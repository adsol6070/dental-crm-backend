import Appointment, { AppointmentDocument } from "../models/Appointment";
import Patient, { PatientDocument } from "../models/Patient";
import AppointmentService from "../services/appointmentService";
import NotificationService from "../services/notificationService";
import logger from "../utils/logger";
import { AppError } from "../types/errors";
import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";

// Define interfaces for different webhook data structures
interface PatientInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  gender?: "male" | "female" | "other";
  address?: Record<string, any>;
}

interface StandardizedAppointmentData {
  patientInfo: PatientInfo;
  doctorId: string | Types.ObjectId;
  appointmentDateTime: Date;
  appointmentType?: string;
  symptoms?: string[];
  notes?: string;
  bookingSource: string;
  specialRequirements?: string;
  metadata?: Record<string, any>;
}

// WordPress booking interface
interface WordPressBookingData {
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  service_type?: string;
  notes?: string;
}

// WhatsApp message interface
interface WhatsAppMessageData {
  Body: string;
  From: string;
  ProfileName?: string;
}

// Practo booking interface
interface PractoBookingData {
  patient: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  doctor: {
    internal_id: string;
  };
  appointment_datetime: string;
  booking_id: string;
}

// SMS booking interface
interface SMSBookingData {
  Body: string;
  From: string;
}

// Email booking interface
interface EmailBookingData {
  from_email: string;
  subject: string;
  body: string;
  parsed_data?: {
    patient_name: string;
    phone: string;
    doctor_id: string;
    preferred_date: string;
  };
}

// Google Calendar interface
interface GoogleCalendarData {
  eventType: string;
  eventData: Record<string, any>;
}

// Zocdoc booking interface
interface ZocdocBookingData {
  patient: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  provider: {
    internal_id: string;
  };
  appointment: {
    start_time: string;
  };
}

// Lybrate booking interface
interface LybrateBookingData {
  user: {
    name: string;
    email: string;
    mobile: string;
  };
  doctor: {
    mapped_id: string;
  };
  slot: {
    datetime: string;
  };
}

// Generic booking data interface
interface GenericBookingData {
  firstName?: string;
  lastName?: string;
  patient_name?: string;
  email?: string;
  patient_email?: string;
  phone?: string;
  patient_phone?: string;
  doctorId?: string;
  doctor_id?: string;
  appointmentDateTime?: string;
  appointment_date?: string;
  [key: string]: any;
}

class WebhookController {
  // Handle WordPress plugin booking
  static async handleWordPressBooking(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        patient_name,
        patient_email,
        patient_phone,
        doctor_id,
        appointment_date,
        appointment_time,
        service_type,
        notes,
      }: WordPressBookingData = req.body;

      // Parse name
      const nameParts: string[] = patient_name.split(" ");
      const firstName: string = nameParts[0];
      const lastName: string = nameParts.slice(1).join(" ") || firstName;

      // Create appointment data
      const appointmentData: StandardizedAppointmentData = {
        patientInfo: {
          firstName,
          lastName,
          email: patient_email,
          phone: patient_phone,
        },
        doctorId: doctor_id,
        appointmentDateTime: new Date(
          `${appointment_date}T${appointment_time}`
        ),
        appointmentType: service_type || "consultation",
        notes,
        bookingSource: "website",
      };

      // Use the main booking logic
      const appointment: AppointmentDocument =
        await this.createAppointmentFromWebhook(appointmentData);

      res.status(200).json({
        success: true,
        message: "Appointment booked successfully via WordPress",
        appointment_id: appointment.appointmentId,
      });

      logger.info("WordPress booking processed successfully", {
        appointmentId: appointment.appointmentId,
        source: "wordpress",
      });
    } catch (error: unknown) {
      logger.error("WordPress webhook error:", error);
      next(error);
    }
  }

  // Handle WhatsApp message
  static async handleWhatsAppMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { Body, From, ProfileName }: WhatsAppMessageData = req.body;
      const phoneNumber: string = From.replace("whatsapp:", "");

      // Simple booking flow - in production, you'd have a more sophisticated chatbot
      if (Body.toLowerCase().includes("book appointment")) {
        // Send available slots or booking link
        await NotificationService.sendWhatsAppMessage(phoneNumber, {
          type: "booking-link",
          message:
            "Please visit our booking portal: " + process.env.BOOKING_URL,
        });
      }

      res.status(200).json({ success: true });
    } catch (error: unknown) {
      logger.error("WhatsApp webhook error:", error);
      next(error);
    }
  }

  // Handle Practo booking
  static async handlePractoBooking(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        patient,
        doctor,
        appointment_datetime,
        booking_id,
      }: PractoBookingData = req.body;

      const appointmentData: StandardizedAppointmentData = {
        patientInfo: {
          firstName: patient.first_name,
          lastName: patient.last_name,
          email: patient.email,
          phone: patient.phone,
        },
        doctorId: doctor.internal_id, // Map Practo doctor ID to internal ID
        appointmentDateTime: new Date(appointment_datetime),
        appointmentType: "consultation",
        bookingSource: "third-party",
        metadata: {
          externalBookingId: booking_id,
          platform: "practo",
        },
      };

      const appointment: AppointmentDocument =
        await this.createAppointmentFromWebhook(appointmentData);

      res.status(200).json({
        success: true,
        internal_appointment_id: appointment.appointmentId,
      });
    } catch (error: unknown) {
      logger.error("Practo webhook error:", error);
      next(error);
    }
  }

  // Handle SMS booking
  static async handleSMSBooking(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { Body, From }: SMSBookingData = req.body;
      const phoneNumber: string = From;

      // Parse SMS content for booking information
      // This is a simplified example - in production, you'd have more sophisticated parsing
      const smsContent: string = Body.toLowerCase();

      if (smsContent.includes("book")) {
        // Send booking link via SMS
        await NotificationService.sendSMS({
          to: phoneNumber,
          message: `To book an appointment, please visit: ${process.env.BOOKING_URL}`,
        });
      }

      res.status(200).json({ success: true });
    } catch (error: unknown) {
      logger.error("SMS webhook error:", error);
      next(error);
    }
  }

  // Handle email booking
  static async handleEmailBooking(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { from_email, subject, body, parsed_data }: EmailBookingData =
        req.body;

      // If email parser service extracted structured data
      if (parsed_data) {
        const nameParts: string[] = parsed_data.patient_name.split(" ");
        const appointmentData: StandardizedAppointmentData = {
          patientInfo: {
            firstName: nameParts[0],
            lastName: nameParts.slice(1).join(" ") || nameParts[0],
            email: from_email,
            phone: parsed_data.phone,
          },
          doctorId: parsed_data.doctor_id,
          appointmentDateTime: new Date(parsed_data.preferred_date),
          appointmentType: "consultation",
          notes: body,
          bookingSource: "email",
        };

        const appointment: AppointmentDocument =
          await this.createAppointmentFromWebhook(appointmentData);

        // Send confirmation email
        await NotificationService.sendEmail({
          to: from_email,
          subject: "Appointment Confirmation",
          template: "appointment-confirmation",
          data: {
            patientName: appointmentData.patientInfo.firstName,
            appointmentId: appointment.appointmentId,
          },
        });
      }

      res.status(200).json({ success: true });
    } catch (error: unknown) {
      logger.error("Email webhook error:", error);
      next(error);
    }
  }

  // Handle Google Calendar integration
  static async handleGoogleCalendar(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { eventType, eventData }: GoogleCalendarData = req.body;

      if (eventType === "appointment_created") {
        // Sync with internal system
        // This would typically update appointment status or create new ones
        logger.info("Google Calendar appointment created", { eventData });
      }

      res.status(200).json({ success: true });
    } catch (error: unknown) {
      logger.error("Google Calendar webhook error:", error);
      next(error);
    }
  }

  // Handle external booking from any source
  static async handleExternalBooking(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { source }: { source: string } = req.params as { source: string };
      const bookingData: GenericBookingData = req.body;

      // Standardize the booking data format
      const standardizedData: StandardizedAppointmentData =
        this.standardizeBookingData(bookingData, source);

      const appointment: AppointmentDocument =
        await this.createAppointmentFromWebhook(standardizedData);

      res.status(200).json({
        success: true,
        appointment_id: appointment.appointmentId,
        source,
      });
    } catch (error: unknown) {
      logger.error(
        `External booking webhook error (${req.params.source}):`,
        error
      );
      next(error);
    }
  }

  // Common method to create appointment from webhook data
  static async createAppointmentFromWebhook(
    appointmentData: StandardizedAppointmentData
  ): Promise<AppointmentDocument> {
    // Find or create patient
    let patient: PatientDocument | null = await Patient.findOne({
      "contactInfo.email": appointmentData.patientInfo.email,
    });

    if (!patient) {
      patient = new Patient({
        personalInfo: {
          firstName: appointmentData.patientInfo.firstName,
          lastName: appointmentData.patientInfo.lastName,
          dateOfBirth:
            appointmentData.patientInfo.dateOfBirth || new Date("1990-01-01"),
          gender: appointmentData.patientInfo.gender || "other",
        },
        contactInfo: {
          email: appointmentData.patientInfo.email,
          phone: appointmentData.patientInfo.phone,
          address: appointmentData.patientInfo.address || {},
        },
        registrationSource: (appointmentData.bookingSource as any) || "webhook",
      });
      await patient.save();
    }

    // Check slot availability
    const isAvailable: boolean = await AppointmentService.checkSlotAvailability(
      appointmentData.doctorId,
      appointmentData.appointmentDateTime
    );

    if (!isAvailable) {
      throw new AppError("Time slot not available", 409);
    }

    // Create appointment
    const appointment: AppointmentDocument = new Appointment({
      patient: patient._id,
      doctor: appointmentData.doctorId,
      appointmentDateTime: appointmentData.appointmentDateTime,
      appointmentType: appointmentData.appointmentType || "consultation",
      symptoms: appointmentData.symptoms || [],
      notes: appointmentData.notes,
      bookingSource: appointmentData.bookingSource as any,
      specialRequirements: appointmentData.specialRequirements,
      metadata: appointmentData.metadata || {},
    });

    await appointment.save();

    // Update statistics
    await Patient.findByIdAndUpdate(patient._id, {
      $inc: { "statistics.totalAppointments": 1 },
    });

    // Send notifications
    await NotificationService.sendAppointmentConfirmation(appointment._id);

    return appointment;
  }

  // Standardize booking data from different sources
  static standardizeBookingData(
    data: ZocdocBookingData | LybrateBookingData | GenericBookingData,
    source: string
  ): StandardizedAppointmentData {
    const standardized: Partial<StandardizedAppointmentData> = {
      bookingSource: source,
    };

    // Map different field names to standard format
    switch (source) {
      case "zocdoc":
        const zocdocData = data as ZocdocBookingData;
        standardized.patientInfo = {
          firstName: zocdocData.patient.first_name,
          lastName: zocdocData.patient.last_name,
          email: zocdocData.patient.email,
          phone: zocdocData.patient.phone,
        };
        standardized.doctorId = zocdocData.provider.internal_id;
        standardized.appointmentDateTime = new Date(
          zocdocData.appointment.start_time
        );
        break;

      case "lybrate":
        const lybrateData = data as LybrateBookingData;
        const nameParts: string[] = lybrateData.user.name.split(" ");
        standardized.patientInfo = {
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(" ") || nameParts[0],
          email: lybrateData.user.email,
          phone: lybrateData.user.mobile,
        };
        standardized.doctorId = lybrateData.doctor.mapped_id;
        standardized.appointmentDateTime = new Date(lybrateData.slot.datetime);
        break;

      default:
        // Generic mapping
        const genericData = data as GenericBookingData;
        const genericNameParts: string[] = (
          genericData.patient_name || ""
        ).split(" ");
        standardized.patientInfo = {
          firstName: genericData.firstName || genericNameParts[0] || "",
          lastName:
            genericData.lastName || genericNameParts.slice(1).join(" ") || "",
          email: genericData.email || genericData.patient_email || "",
          phone: genericData.phone || genericData.patient_phone || "",
        };
        standardized.doctorId =
          genericData.doctorId || genericData.doctor_id || "";
        standardized.appointmentDateTime = new Date(
          genericData.appointmentDateTime || genericData.appointment_date || ""
        );
    }

    // Validate required fields
    if (
      !standardized.patientInfo?.firstName ||
      !standardized.patientInfo?.email ||
      !standardized.doctorId
    ) {
      throw new AppError("Missing required booking data", 400);
    }

    return standardized as StandardizedAppointmentData;
  }
}

export default WebhookController;
