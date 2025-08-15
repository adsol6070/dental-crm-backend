import nodemailer, { Transporter, SendMailOptions } from "nodemailer";
import twilio, { Twilio } from "twilio";
import Appointment, {
  AppointmentDocument,
  PopulatedAppointmentDocument,
} from "../models/Appointment";
import Patient, { PatientDocument } from "../models/Patient";
import Doctor, { IDoctorDocument } from "../models/Doctor";
import { Types } from "mongoose";
import logger from "../utils/logger";
import { config } from "../config/environment";

// Define interfaces for service types
interface EmailData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
}

interface SMSData {
  to: string;
  message: string;
}

interface WhatsAppMessageData {
  type: string;
  appointment?: AppointmentDocument;
  patient?: PatientDocument;
  doctor?: IDoctorDocument;
  message?: string;
}

interface NotificationResult {
  success: boolean;
  messageId?: string;
  sid?: string;
  status?: string;
  reason?: string;
  error?: string;
}

interface BulkNotificationParams {
  patientIds: string[] | Types.ObjectId[];
  subject: string;
  message: string;
  channels?: string[];
}

interface BulkNotificationResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{
    patientId: string;
    error: string;
  }>;
}

interface TestNotificationResult {
  email: { success: boolean; error: string | null };
  sms: { success: boolean; error: string | null };
  whatsapp: { success: boolean; error: string | null };
}

interface AppointmentConfirmationResult {
  success: boolean;
  channels: string[];
}

interface DoctorNotificationType {
  new_appointment: {
    subject: string;
    template: string;
  };
  cancellation: {
    subject: string;
    template: string;
  };
  reschedule: {
    subject: string;
    template: string;
  };
}

class NotificationService {
  private emailTransporter: Transporter;
  private smsClient: Twilio | null;

  constructor() {
    // Email transporter
    this.emailTransporter = nodemailer.createTransport({
      host: config.emailHost,
      port: config.emailPort,
      secure: config.emailSecure,
      auth: {
        user: config.emailUser,
        pass: config.emailPassword,
      },
    });

    // SMS client
    this.smsClient = process.env.TWILIO_ACCOUNT_SID
      ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      : null;
  }

  // Send appointment confirmation
  async sendAppointmentConfirmation(
    appointmentId: string | Types.ObjectId
  ): Promise<AppointmentConfirmationResult> {
    try {
      const rawAppointment = await Appointment.findById(appointmentId)
        .populate("patient")
        .populate("doctor");

      if (!rawAppointment) throw new Error("Appointment not found");

      const appointment =
        rawAppointment as unknown as PopulatedAppointmentDocument;

      const patient = appointment.patient;
      const doctor = appointment.doctor;

      // Send email confirmation
      if (patient.contactInfo.email) {
        await this.sendEmail({
          to: patient.contactInfo.email,
          subject: "✅ Appointment Confirmation - " + appointment.appointmentId,
          template: "appointment-confirmation",
          data: {
            patientName: patient.fullName,
            doctorName: doctor.fullName,
            appointmentDate: this.formatDateTime(
              appointment.appointmentStartTime
            ),
            appointmentId: appointment.appointmentId,
            appointmentType: appointment.appointmentType,
            duration: appointment.duration,
            clinicDetails: process.env.CLINIC_DETAILS || "Healthcare Clinic",
            bookingSource: appointment.bookingSource,
          },
        });
      }

      // Send SMS confirmation based on patient preference
      if (
        patient.contactInfo.phone &&
        patient.preferences?.communicationMethod &&
        ["sms", "phone"].includes(patient.preferences.communicationMethod)
      ) {
        const smsMessage: string = this.generateSMSMessage("confirmation", {
          patientName: patient.personalInfo.firstName,
          doctorName: doctor.fullName,
          appointmentDate: this.formatDateTime(
            appointment.appointmentStartTime
          ),
          appointmentId: appointment.appointmentId,
        });

        await this.sendSMS({
          to: patient.contactInfo.phone,
          message: smsMessage,
        });
      }

      // Send WhatsApp message if preferred
      if (
        patient.contactInfo.phone &&
        patient.preferences?.communicationMethod === "whatsapp"
      ) {
        await this.sendWhatsAppMessage(patient.contactInfo.phone, {
          type: "confirmation",
          appointment,
          patient,
          doctor,
        });
      }

      // Send confirmation to doctor's email (optional)
      if (doctor.personalInfo?.email && process.env.NOTIFY_DOCTORS === "true") {
        await this.sendDoctorNotification(appointment, "new_appointment");
      }

      logger.info(`Confirmation sent for appointment: ${appointmentId}`, {
        appointmentId: appointment.appointmentId,
        patientEmail: patient.contactInfo.email,
        communicationMethod: patient.preferences?.communicationMethod,
      });

      return { success: true, channels: this.getNotificationChannels(patient) };
    } catch (error: unknown) {
      logger.error("Failed to send appointment confirmation:", error);
      throw error;
    }
  }

  // Send appointment reminder
  async sendAppointmentReminder(
    appointmentId: string | Types.ObjectId
  ): Promise<void> {
    try {
      const rawAppointment = await Appointment.findById(appointmentId)
        .populate("patient")
        .populate("doctor");

      if (!rawAppointment) {
        logger.warn(`Appointment not found for reminder: ${appointmentId}`);
        return;
      }

      const appointment =
        rawAppointment as unknown as PopulatedAppointmentDocument;

      const patient = appointment.patient;
      const doctor = appointment.doctor;

      // Check if reminders are enabled
      if (!patient.preferences?.reminderSettings?.enableReminders) {
        logger.info(`Reminders disabled for patient: ${patient.patientId}`);
        return;
      }

      // Check if it's time to send reminder
      const reminderTime: number =
        patient.preferences.reminderSettings.reminderTime || 24; // hours
      const appointmentTime: Date = new Date(appointment.appointmentStartTime);
      const currentTime: Date = new Date();
      const timeDiff: number =
        (appointmentTime.getTime() - currentTime.getTime()) / (1000 * 60 * 60); // hours

      if (timeDiff > reminderTime + 1 || timeDiff < 0) {
        logger.info(`Not time for reminder yet. Time diff: ${timeDiff} hours`);
        return;
      }

      // Send email reminder
      if (patient.contactInfo.email) {
        await this.sendEmail({
          to: patient.contactInfo.email,
          subject: "⏰ Appointment Reminder - Tomorrow",
          template: "appointment-reminder",
          data: {
            patientName: patient.fullName,
            doctorName: doctor.fullName,
            appointmentDate: this.formatDateTime(
              appointment.appointmentStartTime
            ),
            appointmentId: appointment.appointmentId,
            appointmentType: appointment.appointmentType,
            clinicAddress: process.env.CLINIC_ADDRESS,
            reminderTime: reminderTime,
          },
        });
      }

      // Send SMS reminder
      if (
        patient.contactInfo.phone &&
        patient.preferences?.communicationMethod &&
        ["sms", "phone"].includes(patient.preferences.communicationMethod)
      ) {
        const smsMessage: string = this.generateSMSMessage("reminder", {
          patientName: patient.personalInfo.firstName,
          doctorName: doctor.fullName,
          appointmentDate: this.formatDateTime(
            appointment.appointmentStartTime
          ),
          appointmentId: appointment.appointmentId,
        });

        await this.sendSMS({
          to: patient.contactInfo.phone,
          message: smsMessage,
        });
      }

      // Send WhatsApp reminder
      if (
        patient.contactInfo.phone &&
        patient.preferences?.communicationMethod === "whatsapp"
      ) {
        await this.sendWhatsAppMessage(patient.contactInfo.phone, {
          type: "reminder",
          appointment,
          patient,
          doctor,
        });
      }

      // Update reminder count and timestamp
      await Appointment.findByIdAndUpdate(appointmentId, {
        $inc: { remindersSent: 1 },
        lastReminderSent: new Date(),
      });

      logger.info(`Reminder sent for appointment: ${appointmentId}`, {
        appointmentId: appointment.appointmentId,
        reminderCount: appointment.remindersSent + 1,
      });
    } catch (error: unknown) {
      logger.error("Failed to send appointment reminder:", error);
    }
  }

  // Send daily reminders for all upcoming appointments
  async sendDailyReminders(): Promise<{
    successCount: number;
    failureCount: number;
    total: number;
  }> {
    try {
      const tomorrow: Date = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfter: Date = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const appointments: AppointmentDocument[] = await Appointment.find({
        appointmentDateTime: {
          $gte: tomorrow,
          $lt: dayAfter,
        },
        status: { $in: ["scheduled", "confirmed"] },
        remindersSent: { $lt: 3 }, // Max 3 reminders
      }).populate(["patient", "doctor"]);

      let successCount: number = 0;
      let failureCount: number = 0;

      for (const appointment of appointments) {
        try {
          await this.sendAppointmentReminder(appointment._id);
          successCount++;
        } catch (error: unknown) {
          failureCount++;
          logger.error(
            `Failed to send reminder for appointment ${appointment.appointmentId}:`,
            error
          );
        }
      }

      logger.info("Daily reminders batch completed", {
        totalAppointments: appointments.length,
        successCount,
        failureCount,
        date: tomorrow.toISOString().split("T")[0],
      });

      return { successCount, failureCount, total: appointments.length };
    } catch (error: unknown) {
      logger.error("Failed to send daily reminders:", error);
      throw error;
    }
  }

  // Send appointment cancellation notification
  async sendCancellationNotification(
    appointmentId: string | Types.ObjectId,
    cancellationReason: string = ""
  ): Promise<void> {
    try {
      const rawAppointment = await Appointment.findById(appointmentId)
        .populate("patient")
        .populate("doctor");

      if (!rawAppointment) throw new Error("Appointment not found");

      const appointment =
        rawAppointment as unknown as PopulatedAppointmentDocument;

      const patient = appointment.patient;
      const doctor = appointment.doctor;

      // Send email notification
      if (patient.contactInfo.email) {
        await this.sendEmail({
          to: patient.contactInfo.email,
          subject: "❌ Appointment Cancelled - " + appointment.appointmentId,
          template: "appointment-cancellation",
          data: {
            patientName: patient.fullName,
            doctorName: doctor.fullName,
            appointmentDate: this.formatDateTime(
              appointment.appointmentStartTime
            ),
            appointmentId: appointment.appointmentId,
            cancellationReason,
            rebookingUrl: `${process.env.BOOKING_URL}?doctor=${doctor._id}`,
          },
        });
      }

      // Send SMS if preferred
      if (
        patient.contactInfo.phone &&
        patient.preferences?.communicationMethod &&
        ["sms", "phone"].includes(patient.preferences.communicationMethod)
      ) {
        const message: string = `🚫 CANCELLED: Your appointment ${
          appointment.appointmentId
        } with ${doctor.fullName} on ${this.formatDateTime(
          appointment.appointmentStartTime
        )} has been cancelled. ${
          cancellationReason ? "Reason: " + cancellationReason : ""
        } Please book a new appointment if needed.`;

        await this.sendSMS({
          to: patient.contactInfo.phone,
          message,
        });
      }

      logger.info(
        `Cancellation notification sent for appointment: ${appointmentId}`
      );
    } catch (error: unknown) {
      logger.error("Failed to send cancellation notification:", error);
      throw error;
    }
  }

  // Send appointment reschedule notification
  async sendRescheduleNotification(
    appointmentId: string | Types.ObjectId,
    oldDateTime: Date,
    newDateTime: Date
  ): Promise<void> {
    try {
      const rawAppointment = await Appointment.findById(appointmentId)
        .populate("patient")
        .populate("doctor");

      if (!rawAppointment) throw new Error("Appointment not found");

      const appointment =
        rawAppointment as unknown as PopulatedAppointmentDocument;

      const patient = appointment.patient;
      const doctor = appointment.doctor;

      // Send email notification
      if (patient.contactInfo.email) {
        await this.sendEmail({
          to: patient.contactInfo.email,
          subject: "🔄 Appointment Rescheduled - " + appointment.appointmentId,
          template: "appointment-reschedule",
          data: {
            patientName: patient.fullName,
            doctorName: doctor.fullName,
            oldDate: this.formatDateTime(oldDateTime),
            newDate: this.formatDateTime(newDateTime),
            appointmentId: appointment.appointmentId,
          },
        });
      }

      // Send SMS if preferred
      if (
        patient.contactInfo.phone &&
        patient.preferences?.communicationMethod &&
        ["sms", "phone"].includes(patient.preferences.communicationMethod)
      ) {
        const message: string = `🔄 RESCHEDULED: Your appointment ${
          appointment.appointmentId
        } with ${doctor.fullName} has been moved from ${this.formatDateTime(
          oldDateTime
        )} to ${this.formatDateTime(newDateTime)}`;

        await this.sendSMS({
          to: patient.contactInfo.phone,
          message,
        });
      }

      logger.info(
        `Reschedule notification sent for appointment: ${appointmentId}`
      );
    } catch (error: unknown) {
      logger.error("Failed to send reschedule notification:", error);
      throw error;
    }
  }

  // Send doctor notification
  async sendDoctorNotification(
    appointment: PopulatedAppointmentDocument,
    type: keyof DoctorNotificationType
  ): Promise<void> {
    try {
      const doctor = appointment.doctor;
      const patient = appointment.patient;

      const templates: DoctorNotificationType = {
        new_appointment: {
          subject: "📅 New Appointment Scheduled",
          template: "doctor-new-appointment",
        },
        cancellation: {
          subject: "❌ Appointment Cancelled",
          template: "doctor-appointment-cancelled",
        },
        reschedule: {
          subject: "🔄 Appointment Rescheduled",
          template: "doctor-appointment-rescheduled",
        },
      };

      const notificationConfig = templates[type];
      if (!notificationConfig) return;

      if (!doctor.personalInfo?.email) return;

      await this.sendEmail({
        to: doctor.personalInfo.email,
        subject: notificationConfig.subject + ` - ${appointment.appointmentId}`,
        template: notificationConfig.template,
        data: {
          doctorName: doctor.fullName,
          patientName: patient.fullName,
          appointmentDate: this.formatDateTime(
            appointment.appointmentStartTime
          ),
          appointmentId: appointment.appointmentId,
          appointmentType: appointment.appointmentType,
          patientPhone: patient.contactInfo.phone,
          symptoms: appointment.symptoms?.join(", ") || "",
          notes: appointment.notes || "",
        },
      });

      logger.info(
        `Doctor notification sent: ${type} for appointment ${appointment.appointmentId}`
      );
    } catch (error: unknown) {
      logger.error("Failed to send doctor notification:", error);
    }
  }

  // Send email
  async sendEmail(emailData: EmailData): Promise<NotificationResult> {
    try {
      const emailContent: string = this.generateEmailContent(
        emailData.template,
        emailData.data
      );

      const mailOptions: SendMailOptions = {
        from: `${process.env.CLINIC_NAME || "Healthcare Clinic"} <${
          process.env.FROM_EMAIL
        }>`,
        to: emailData.to,
        subject: emailData.subject,
        html: emailContent,
        headers: {
          "X-Appointment-ID": emailData.data.appointmentId || "N/A",
          "X-Patient-ID": emailData.data.patientId || "N/A",
        },
      };

      const result = await this.emailTransporter.sendMail(mailOptions);

      logger.info(`Email sent successfully to: ${emailData.to}`, {
        messageId: result.messageId,
        template: emailData.template,
        appointmentId: emailData.data.appointmentId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error: unknown) {
      logger.error(`Failed to send email to ${emailData.to}:`, error);
      throw error;
    }
  }

  // Send SMS
  async sendSMS(smsData: SMSData): Promise<NotificationResult> {
    try {
      if (!this.smsClient) {
        logger.warn("SMS client not configured - SMS not sent");
        return { success: false, reason: "SMS client not configured" };
      }

      // Format phone number
      const formattedPhone: string = this.formatPhoneNumber(smsData.to);

      const result = await this.smsClient.messages.create({
        body: smsData.message,
        from: process.env.TWILIO_PHONE_NUMBER as string,
        to: formattedPhone,
      });

      logger.info(`SMS sent successfully to: ${smsData.to}`, {
        sid: result.sid,
        status: result.status,
      });

      return { success: true, sid: result.sid, status: result.status };
    } catch (error: any) {
      logger.error(`Failed to send SMS to ${smsData.to}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Send WhatsApp message
  async sendWhatsAppMessage(
    phoneNumber: string,
    messageData: WhatsAppMessageData
  ): Promise<NotificationResult> {
    try {
      if (!this.smsClient) {
        logger.warn("WhatsApp client not configured");
        return { success: false, reason: "WhatsApp client not configured" };
      }

      const message: string = this.generateWhatsAppMessage(messageData);
      const formattedPhone: string = this.formatPhoneNumber(phoneNumber);

      const result = await this.smsClient.messages.create({
        body: message,
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${formattedPhone}`,
      });

      logger.info(`WhatsApp message sent successfully to: ${phoneNumber}`, {
        sid: result.sid,
        status: result.status,
      });

      return { success: true, sid: result.sid, status: result.status };
    } catch (error: any) {
      logger.error(`Failed to send WhatsApp message to ${phoneNumber}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Generate email content based on template
  private generateEmailContent(
    template: string,
    data: Record<string, any>
  ): string {
    const templates: Record<string, string> = {
      "appointment-confirmation": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c5aa0; margin: 0;">✅ Appointment Confirmed</h1>
          </div>
          
          <p style="font-size: 16px; color: #333;">Dear <strong>${
            data.patientName
          }</strong>,</p>
          
          <p style="font-size: 16px; color: #333;">Your appointment has been successfully scheduled. Here are the details:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">👨‍⚕️ Doctor:</td>
                <td style="padding: 8px 0; color: #333;">${data.doctorName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Date & Time:</td>
                <td style="padding: 8px 0; color: #333;">${
                  data.appointmentDate
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🆔 Appointment ID:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${
                  data.appointmentId
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">⏱️ Duration:</td>
                <td style="padding: 8px 0; color: #333;">${
                  data.duration
                } minutes</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🏥 Type:</td>
                <td style="padding: 8px 0; color: #333; text-transform: capitalize;">${
                  data.appointmentType
                }</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #1976d2;">📋 Important Instructions:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333;">
              <li>Please arrive 15 minutes early for your appointment</li>
              <li>Bring your ID and insurance card (if applicable)</li>
              <li>Have your medical history and current medications list ready</li>
              <li>If you need to reschedule, please contact us at least 24 hours in advance</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #666; margin: 0;">Need to reschedule or have questions?</p>
            <p style="color: #2c5aa0; font-weight: bold; margin: 5px 0;">Contact us at ${
              process.env.CLINIC_PHONE || "clinic phone"
            }</p>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              Best regards,<br>
              <strong>${data.clinicDetails}</strong>
            </p>
            <p style="color: #888; font-size: 12px; margin: 10px 0 0 0;">
              Booked via: ${data.bookingSource}
            </p>
          </div>
        </div>
      `,

      "appointment-reminder": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #ff9800; margin: 0;">⏰ Appointment Reminder</h1>
          </div>
          
          <p style="font-size: 16px; color: #333;">Dear <strong>${
            data.patientName
          }</strong>,</p>
          
          <p style="font-size: 16px; color: #333;">This is a friendly reminder about your upcoming appointment:</p>
          
          <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">👨‍⚕️ Doctor:</td>
                <td style="padding: 8px 0; color: #333;">${data.doctorName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Date & Time:</td>
                <td style="padding: 8px 0; color: #333; font-weight: bold;">${
                  data.appointmentDate
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🆔 Appointment ID:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${
                  data.appointmentId
                }</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #f3e5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #7b1fa2;">📍 Location:</h3>
            <p style="margin: 0; color: #333;">${
              data.clinicAddress ||
              "Please check your confirmation email for clinic address"
            }</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #333; margin: 0; font-size: 16px;">
              <strong>⏰ Please arrive 15 minutes early</strong>
            </p>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #666; margin: 0;">Need to reschedule?</p>
            <p style="color: #ff9800; font-weight: bold; margin: 5px 0;">Contact us immediately</p>
          </div>
        </div>
      `,

      "appointment-cancellation": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #f44336; margin: 0;">❌ Appointment Cancelled</h1>
          </div>
          
          <p style="font-size: 16px; color: #333;">Dear <strong>${
            data.patientName
          }</strong>,</p>
          
          <p style="font-size: 16px; color: #333;">We regret to inform you that your appointment has been cancelled:</p>
          
          <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">👨‍⚕️ Doctor:</td>
                <td style="padding: 8px 0; color: #333;">${data.doctorName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Original Date:</td>
                <td style="padding: 8px 0; color: #333;">${
                  data.appointmentDate
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🆔 Appointment ID:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${
                  data.appointmentId
                }</td>
              </tr>
              ${
                data.cancellationReason
                  ? `
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📝 Reason:</td>
                <td style="padding: 8px 0; color: #333;">${data.cancellationReason}</td>
              </tr>
              `
                  : ""
              }
            </table>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${
              data.rebookingUrl
            }" style="background-color: #2196f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              📅 Book New Appointment
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              We apologize for any inconvenience caused.<br>
              Please contact us if you have any questions.
            </p>
          </div>
        </div>
      `,

      "appointment-reschedule": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4caf50; margin: 0;">🔄 Appointment Rescheduled</h1>
          </div>
          
          <p style="font-size: 16px; color: #333;">Dear <strong>${data.patientName}</strong>,</p>
          
          <p style="font-size: 16px; color: #333;">Your appointment has been successfully rescheduled:</p>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">👨‍⚕️ Doctor:</td>
                <td style="padding: 8px 0; color: #333;">${data.doctorName}</td>
              </tr>
              <tr style="background-color: #ffebee;">
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Previous Date:</td>
                <td style="padding: 8px 0; color: #666; text-decoration: line-through;">${data.oldDate}</td>
              </tr>
              <tr style="background-color: #e8f5e8;">
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 New Date:</td>
                <td style="padding: 8px 0; color: #2e7d32; font-weight: bold;">${data.newDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🆔 Appointment ID:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${data.appointmentId}</td>
              </tr>
            </table>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #4caf50; font-weight: bold; margin: 0; font-size: 16px;">
              ✅ Your new appointment is confirmed!
            </p>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              Thank you for your flexibility.<br>
              We look forward to seeing you at your new appointment time.
            </p>
          </div>
        </div>
      `,

      "doctor-new-appointment": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5aa0;">📅 New Appointment Scheduled</h2>
          
          <p>Dear <strong>Dr. ${data.doctorName}</strong>,</p>
          
          <p>A new appointment has been scheduled with you:</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Patient:</td>
                <td style="padding: 5px 0;">${data.patientName}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Date & Time:</td>
                <td style="padding: 5px 0;">${data.appointmentDate}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Appointment ID:</td>
                <td style="padding: 5px 0; font-family: monospace;">${
                  data.appointmentId
                }</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Type:</td>
                <td style="padding: 5px 0; text-transform: capitalize;">${
                  data.appointmentType
                }</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Patient Phone:</td>
                <td style="padding: 5px 0;">${data.patientPhone}</td>
              </tr>
              ${
                data.symptoms
                  ? `
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Symptoms:</td>
                <td style="padding: 5px 0;">${data.symptoms}</td>
              </tr>
              `
                  : ""
              }
              ${
                data.notes
                  ? `
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Notes:</td>
                <td style="padding: 5px 0;">${data.notes}</td>
              </tr>
              `
                  : ""
              }
            </table>
          </div>
          
          <p>Please prepare accordingly for this appointment.</p>
          
          <p>Best regards,<br>Appointment Management System</p>
        </div>
      `,

      "bulk-notification": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5aa0;">📢 Important Notification</h2>
          
          <p>Dear <strong>${data.patientName}</strong>,</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #333; line-height: 1.6;">${data.message}</p>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              Best regards,<br>
              <strong>${data.clinicDetails}</strong>
            </p>
          </div>
        </div>
      `,

      "test-notification": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #4caf50;">✅ Test Notification</h2>
          
          <p>This is a test email from the notification system.</p>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Test Type:</strong> ${data.testType}</p>
            <p><strong>Timestamp:</strong> ${data.timestamp}</p>
          </div>
          
          <p style="color: #4caf50; font-weight: bold;">✅ Email system is working correctly!</p>
        </div>
      `,

      "status-update": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2196f3; margin: 0;">📋 Appointment Status Update</h1>
          </div>
          
          <p style="font-size: 16px; color: #333;">Dear <strong>${data.patientName}</strong>,</p>
          
          <p style="font-size: 16px; color: #333;">Your appointment status has been updated:</p>
          
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">👨‍⚕️ Doctor:</td>
                <td style="padding: 8px 0; color: #333;">${data.doctorName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Date & Time:</td>
                <td style="padding: 8px 0; color: #333;">${data.appointmentDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🆔 Appointment ID:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${data.appointmentId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">Previous Status:</td>
                <td style="padding: 8px 0; color: #666; text-transform: capitalize;">${data.oldStatus}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">New Status:</td>
                <td style="padding: 8px 0; color: #2196f3; font-weight: bold; text-transform: capitalize;">${data.newStatus}</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #333; font-style: italic;">${data.message}</p>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              If you have any questions, please contact us.
            </p>
          </div>
        </div>
      `,

      "admin-account-created": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c5aa0; margin: 0;">🔐 Admin Account Created</h1>
          </div>
          
          <h2 style="color: #2c5aa0;">Admin Account Created</h2>
          <p>Hello <strong>${data.firstName} ${data.lastName}</strong>,</p>
          <p>An admin account has been created for you with the following credentials:</p>
          
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2c5aa0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📧 Email:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${
                  data.email
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🔑 Temporary Password:</td>
                <td style="padding: 8px 0; color: #d32f2f; font-family: monospace; font-weight: bold;">${
                  data.tempPassword
                }</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
            <h3 style="margin: 0 0 10px 0; color: #f57c00;">⚠️ Important Security Instructions:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333;">
              <li><strong>You must change this password on your first login</strong></li>
              <li>Please log in to the system as soon as possible and update your password</li>
              <li>It's also recommended to enable 2FA for enhanced security</li>
              <li>Keep your credentials secure and do not share them with anyone</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${
              data.loginUrl || "#"
            }" style="background-color: #2c5aa0; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              🚀 Login to Your Account
            </a>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #555;">🛡️ Your Admin Privileges Include:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333;">
              <li>Managing staff users and appointments</li>
              <li>Accessing administrative reports</li>
              <li>Managing system settings</li>
              <li>Overseeing clinic operations</li>
            </ul>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              If you have any questions or need assistance, please contact the system administrator.<br>
              <strong>Welcome to the team!</strong>
            </p>
          </div>
        </div>
      `,

      "staff-account-created": `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4caf50; margin: 0;">👥 Staff Account Created</h1>
          </div>
          
          <h2 style="color: #4caf50;">\${data.role.charAt(0).toUpperCase() + data.role.slice(1)} Account Created</h2>
          <p>Hello <strong>${data.firstName} ${data.lastName}</strong>,</p>
          <p>A ${
            data.role
          } account has been created for you with the following credentials:</p>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">📧 Email:</td>
                <td style="padding: 8px 0; color: #333; font-family: monospace;">${
                  data.email
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">🔑 Temporary Password:</td>
                <td style="padding: 8px 0; color: #d32f2f; font-family: monospace; font-weight: bold;">${
                  data.tempPassword
                }</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #555;">👤 Role:</td>
                <td style="padding: 8px 0; color: #333; text-transform: capitalize;">${
                  data.role
                }</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
            <h3 style="margin: 0 0 10px 0; color: #f57c00;">⚠️ Important:</h3>
            <ul style="margin: 0; padding-left: 20px; color: #333;">
              <li><strong>You must change this password on your first login</strong></li>
              <li>Please log in to the system as soon as possible and update your password</li>
              <li>Keep your credentials secure and do not share them with anyone</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${
              data.loginUrl || "#"
            }" style="background-color: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              🚀 Login to Your Account
            </a>
          </div>
          
          <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              If you have any questions or need assistance, please contact your administrator.<br>
              <strong>Welcome to the team!</strong>
            </p>
          </div>
        </div>
      `,

      "doctor-verification-status": `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: ${
        data.status === "verified" ? "#4caf50" : "#f44336"
      }; margin: 0;">
        ${
          data.status === "verified"
            ? "✅ Account Verified"
            : "❌ Account Verification Update"
        }
      </h1>
    </div>
    
    <p style="font-size: 16px; color: #333;">Dear <strong>Dr. ${
      data.doctorName
    }</strong>,</p>
    
    <p style="font-size: 16px; color: #333;">
      We are writing to inform you about the status of your account verification:
    </p>
    
    <div style="background-color: ${
      data.status === "verified" ? "#e8f5e8" : "#ffebee"
    }; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${
        data.status === "verified" ? "#4caf50" : "#f44336"
      };">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #555;">📋 Verification Status:</td>
          <td style="padding: 8px 0; color: ${
            data.status === "verified" ? "#2e7d32" : "#d32f2f"
          }; font-weight: bold; text-transform: capitalize;">
            ${data.status === "verified" ? "✅ Verified" : "❌ " + data.status}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #555;">📅 Date:</td>
          <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString(
            "en-US",
            {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }
          )}</td>
        </tr>
        ${
          data.reason
            ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #555;">${
            data.status === "verified" ? "📝 Notes:" : "⚠️ Reason:"
          }</td>
          <td style="padding: 8px 0; color: #333;">${data.reason}</td>
        </tr>
        `
            : ""
        }
      </table>
    </div>
    
    ${
      data.status === "verified"
        ? `
    <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 10px 0; color: #1976d2;">🎉 Congratulations!</h3>
      <p style="margin: 0; color: #333;">
        Your account has been successfully verified. You can now:
      </p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #333;">
        <li>Access all platform features</li>
        <li>Manage your appointment schedule</li>
        <li>View and update your profile</li>
        <li>Interact with patients and staff</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${
        data.loginUrl || process.env.DOCTOR_PORTAL_URL || "#"
      }" style="background-color: #4caf50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
        🚀 Access Your Dashboard
      </a>
    </div>
    `
        : `
    <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
      <h3 style="margin: 0 0 10px 0; color: #f57c00;">📋 Next Steps:</h3>
      <p style="margin: 0; color: #333;">
        ${
          data.status === "rejected"
            ? "Your verification was not approved. Please review the reason above and contact our support team if you need assistance with resubmitting your application."
            : "Your verification is still under review. We will notify you once the process is complete."
        }
      </p>
    </div>
    
    ${
      data.status === "rejected"
        ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${
        data.supportUrl ||
        "mailto:" + (process.env.SUPPORT_EMAIL || "support@clinic.com")
      }" style="background-color: #2196f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
        📞 Contact Support
      </a>
    </div>
    `
        : ""
    }
    `
    }
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin: 0 0 10px 0; color: #555;">📞 Need Help?</h3>
      <p style="margin: 0; color: #333;">
        If you have any questions about your verification status or need assistance, please don't hesitate to contact our support team:
      </p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #333;">
        <li>📧 Email: ${process.env.SUPPORT_EMAIL || "support@clinic.com"}</li>
        <li>📞 Phone: ${process.env.SUPPORT_PHONE || "Contact clinic"}</li>
        <li>🕒 Support Hours: Monday - Friday, 9:00 AM - 6:00 PM</li>
      </ul>
    </div>
    
    <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
      <p style="color: #888; font-size: 14px; margin: 0;">
        Best regards,<br>
        <strong>${data.clinicDetails || "Medical Platform Team"}</strong>
      </p>
      <p style="color: #888; font-size: 12px; margin: 10px 0 0 0;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  </div>
`,

      "doctor-email-verification": `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2c5aa0; margin: 0;">✉️ Verify Your Email Address</h1>
        </div>
        
        <p style="font-size: 16px; color: #333;">Dear <strong>Dr. ${
          data.doctorName
        }</strong>,</p>
        
        <p style="font-size: 16px; color: #333;">
          Thank you for registering with us! To complete your registration and activate your doctor account, 
          please verify your email address by clicking the button below:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.verificationUrl}" 
             style="background-color: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
            ✅ Verify Email Address
          </a>
        </div>
        
        <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
          <h3 style="margin: 0 0 10px 0; color: #1976d2;">⏰ Important Information:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #333;">
            <li><strong>This verification link expires in ${
              data.expiresIn
            }</strong></li>
            <li>Once verified, you'll be able to access your doctor dashboard</li>
            <li>You can start managing your schedule and accepting appointments</li>
            <li>Your profile will be visible to patients looking for healthcare services</li>
          </ul>
        </div>
        
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
          <h3 style="margin: 0 0 10px 0; color: #f57c00;">🔗 Can't Click the Button?</h3>
          <p style="margin: 0; color: #333;">
            Copy and paste this link into your browser:<br>
            <span style="word-break: break-all; color: #2c5aa0; font-family: monospace; font-size: 14px;">
              ${data.verificationUrl}
            </span>
          </p>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; color: #555;">🚫 Didn't Register?</h3>
          <p style="margin: 0; color: #333;">
            If you didn't create an account with us, you can safely ignore this email. 
            The verification link will expire automatically.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <p style="color: #666; margin: 0;">Need help or have questions?</p>
          <p style="color: #2c5aa0; font-weight: bold; margin: 5px 0;">
            Contact our support team at ${
              process.env.SUPPORT_EMAIL || "support@clinic.com"
            }
          </p>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px; text-align: center;">
          <p style="color: #888; font-size: 14px; margin: 0;">
            Best regards,<br>
            <strong>${data.clinicDetails}</strong>
          </p>
          <p style="color: #888; font-size: 12px; margin: 10px 0 0 0;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
    };

    return templates[template] || "<p>Default email content</p>";
  }

  // Generate SMS message
  private generateSMSMessage(type: string, data: Record<string, any>): string {
    const messages: Record<string, string> = {
      confirmation: `✅ CONFIRMED: Appointment ${data.appointmentId} with ${data.doctorName} on ${data.appointmentDate}. Please arrive 15 min early. Questions? Reply HELP`,
      reminder: `⏰ REMINDER: You have an appointment with ${data.doctorName} tomorrow at ${data.appointmentDate}. ID: ${data.appointmentId}. Please confirm by replying YES`,
      cancellation: `❌ CANCELLED: Your appointment ${data.appointmentId} with ${data.doctorName} on ${data.appointmentDate} has been cancelled. Contact us to reschedule.`,
      reschedule: `🔄 RESCHEDULED: Appointment ${data.appointmentId} moved to ${data.appointmentDate} with ${data.doctorName}. New time confirmed.`,
    };

    return messages[type] || "Appointment notification";
  }

  // Generate WhatsApp message
  private generateWhatsAppMessage(messageData: WhatsAppMessageData): string {
    const { type, appointment, patient, doctor } = messageData;

    if (!appointment || !patient || !doctor) {
      return messageData.message || "Appointment notification";
    }

    const messages: Record<string, string> = {
      confirmation: `
🏥 *Appointment Confirmed* ✅

Hi ${patient.personalInfo.firstName}! 👋

Your appointment has been successfully booked:

👨‍⚕️ *Doctor:* ${doctor.fullName}
📅 *Date & Time:* ${this.formatDateTime(appointment.appointmentStartTime)}
🆔 *Appointment ID:* ${appointment.appointmentId}
⏱️ *Duration:* ${appointment.duration} minutes
🏥 *Type:* ${appointment.appointmentType}

📋 *Important Notes:*
• Please arrive 15 minutes early
• Bring your ID and insurance card
• Have your medical history ready

Need to reschedule? Contact us at least 24 hours in advance.

Thank you for choosing our healthcare services! 🙏`,

      reminder: `
⏰ *Appointment Reminder*

Hi ${patient.personalInfo.firstName}! 

Just a friendly reminder about your appointment:

👨‍⚕️ *Doctor:* ${doctor.fullName}
📅 *Tomorrow:* ${this.formatDateTime(appointment.appointmentStartTime)}
🆔 *ID:* ${appointment.appointmentId}

Please confirm your attendance by replying *YES* 

See you tomorrow! 😊`,

      cancellation: `
❌ *Appointment Cancelled*

Hi ${patient.personalInfo.firstName},

Unfortunately, your appointment has been cancelled:

👨‍⚕️ *Doctor:* ${doctor.fullName}
📅 *Date:* ${this.formatDateTime(appointment.appointmentStartTime)}
🆔 *ID:* ${appointment.appointmentId}

We apologize for any inconvenience. Please book a new appointment when convenient.

Thank you for your understanding! 🙏`,

      reschedule: `
🔄 *Appointment Rescheduled*

Hi ${patient.personalInfo.firstName}!

Your appointment has been successfully rescheduled:

👨‍⚕️ *Doctor:* ${doctor.fullName}
📅 *New Date & Time:* ${this.formatDateTime(appointment.appointmentStartTime)}
🆔 *ID:* ${appointment.appointmentId}

Your new appointment time is confirmed. Thank you! ✅`,

      test:
        messageData.message ||
        "Test WhatsApp message from notification system. System is working correctly!",
    };

    return messages[type] || "Appointment update notification";
  }

  // Format date and time for display
  private formatDateTime(dateTime: Date): string {
    const date = new Date(dateTime);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    return date.toLocaleDateString("en-US", options);
  }

  // Format phone number for international use
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned: string = phone.replace(/\D/g, "");

    // Add country code if not present (assuming India +91)
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
      return `+${cleaned}`;
    } else if (cleaned.length === 13 && cleaned.startsWith("91")) {
      return `+${cleaned.substring(1)}`;
    }

    // Return as is if already formatted
    return cleaned.startsWith("+") ? phone : `+${cleaned}`;
  }

  // Get notification channels used for a patient
  private getNotificationChannels(patient: PatientDocument): string[] {
    const channels: string[] = [];

    if (patient.contactInfo.email) {
      channels.push("email");
    }

    if (patient.contactInfo.phone && patient.preferences?.communicationMethod) {
      const method = patient.preferences.communicationMethod;
      if (["sms", "phone"].includes(method)) {
        channels.push("sms");
      } else if (method === "whatsapp") {
        channels.push("whatsapp");
      }
    }

    return channels;
  }

  // Send bulk notifications
  async sendBulkNotification(
    params: BulkNotificationParams
  ): Promise<BulkNotificationResult> {
    try {
      const { patientIds, subject, message, channels = ["email"] } = params;

      const patients: PatientDocument[] = await Patient.find({
        _id: { $in: patientIds },
        isActive: true,
      });

      const results: BulkNotificationResult = {
        total: patients.length,
        success: 0,
        failed: 0,
        errors: [],
      };

      for (const patient of patients) {
        try {
          // Send email if requested and available
          if (channels.includes("email") && patient.contactInfo.email) {
            await this.sendEmail({
              to: patient.contactInfo.email,
              subject,
              template: "bulk-notification",
              data: {
                patientName: patient.fullName,
                message,
                clinicDetails: process.env.CLINIC_DETAILS,
              },
            });
          }

          // Send SMS if requested and available
          if (channels.includes("sms") && patient.contactInfo.phone) {
            await this.sendSMS({
              to: patient.contactInfo.phone,
              message: `${subject}\n\n${message}\n\n- ${
                process.env.CLINIC_NAME || "Healthcare Team"
              }`,
            });
          }

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            patientId: patient.patientId,
            error: error.message,
          });
          logger.error(
            `Bulk notification failed for patient ${patient.patientId}:`,
            error
          );
        }
      }

      logger.info("Bulk notification completed", results);
      return results;
    } catch (error: unknown) {
      logger.error("Bulk notification failed:", error);
      throw error;
    }
  }

  // Send appointment status change notifications
  async sendStatusChangeNotification(
    appointmentId: string | Types.ObjectId,
    oldStatus: string,
    newStatus: string
  ): Promise<void> {
    try {
      const rawAppointment = await Appointment.findById(appointmentId)
        .populate("patient")
        .populate("doctor");

      if (!rawAppointment) throw new Error("Appointment not found");

      const appointment =
        rawAppointment as unknown as PopulatedAppointmentDocument;

      if (!appointment) return;

      const statusMessages: Record<string, string> = {
        scheduled: "Your appointment has been scheduled",
        confirmed: "Your appointment has been confirmed",
        "in-progress": "Your appointment is now in progress",
        completed: "Your appointment has been completed",
        cancelled: "Your appointment has been cancelled",
        "no-show": "You missed your scheduled appointment",
      };

      const message: string =
        statusMessages[newStatus] || "Your appointment status has been updated";

      // Send appropriate notification based on status change
      if (newStatus === "cancelled") {
        await this.sendCancellationNotification(appointmentId);
      } else if (newStatus === "confirmed") {
        await this.sendAppointmentConfirmation(appointmentId);
      } else {
        // Send general status update
        const patient = appointment.patient as PatientDocument;

        if (patient.contactInfo.email) {
          await this.sendEmail({
            to: patient.contactInfo.email,
            subject: `Appointment Status Update - ${appointment.appointmentId}`,
            template: "status-update",
            data: {
              patientName: patient.fullName,
              appointmentId: appointment.appointmentId,
              doctorName: appointment.doctor.fullName,
              appointmentDate: this.formatDateTime(
                appointment.appointmentStartTime
              ),
              oldStatus,
              newStatus,
              message,
            },
          });
        }
      }

      logger.info(
        `Status change notification sent for appointment ${appointmentId}: ${oldStatus} -> ${newStatus}`
      );
    } catch (error: unknown) {
      logger.error("Failed to send status change notification:", error);
    }
  }

  // Verify email configuration
  async verifyEmailConfiguration(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await this.emailTransporter.verify();
      logger.info("Email configuration verified successfully");
      return { success: true };
    } catch (error: any) {
      logger.error("Email configuration verification failed:", error);
      return { success: false, error: error.message };
    }
  }

  // Test notification system
  async testNotificationSystem(
    testEmail: string,
    testPhone?: string
  ): Promise<TestNotificationResult> {
    const results: TestNotificationResult = {
      email: { success: false, error: null },
      sms: { success: false, error: null },
      whatsapp: { success: false, error: null },
    };

    // Test email
    try {
      await this.sendEmail({
        to: testEmail,
        subject: "Test Email - Notification System",
        template: "test-notification",
        data: {
          testType: "email",
          timestamp: new Date().toISOString(),
        },
      });
      results.email.success = true;
    } catch (error: any) {
      results.email.error = error.message;
    }

    // Test SMS
    if (testPhone && this.smsClient) {
      try {
        await this.sendSMS({
          to: testPhone,
          message:
            "Test SMS from appointment notification system. System is working correctly!",
        });
        results.sms.success = true;
      } catch (error: any) {
        results.sms.error = error.message;
      }
    }

    // Test WhatsApp
    if (testPhone && this.smsClient) {
      try {
        await this.sendWhatsAppMessage(testPhone, {
          type: "test",
          message:
            "Test WhatsApp message from appointment notification system. System is working correctly!",
        });
        results.whatsapp.success = true;
      } catch (error: any) {
        results.whatsapp.error = error.message;
      }
    }

    logger.info("Notification system test completed", results);
    return results;
  }
}

export default new NotificationService();
