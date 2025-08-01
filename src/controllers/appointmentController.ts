import Appointment from "../models/Appointment";
import Patient from "../models/Patient";
import Doctor from "../models/Doctor";
import NotificationService from "../services/notificationService";
import AppointmentService from "../services/appointmentService";
import logger from "../utils/logger";
import { AppError } from "../types/errors";
import { NextFunction, Request, Response } from "express";
import { console } from "inspector";

class AppointmentController {
  private static getFeeByAppointmentType(doctor: any, type: string): number {
    switch (type) {
      case "consultation":
        return doctor.fees?.consultationFee || 0;
      case "follow-up":
        return doctor.fees?.followUpFee || 0;
      case "online":
        return doctor.fees?.onlineFee || 0;
      case "emergency":
        return doctor.fees?.emergencyFee || 0;
      default:
        return doctor.fees?.consultationFee || 0; // default fallback
    }
  }

  // Book a new appointment
  static async bookAppointment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      console.log("appointment requested body", req.body);
      const {
        patient: patientId,
        doctor: doctorId,
        appointmentDateTime,
        duration,
        appointmentType,
        symptoms,
        notes,
        bookingSource,
        status,
        priority,
        paymentMethod,
        paymentStatus,
        specialRequirements,
      } = req.body;

      // Fetch Patient
      const patient = await Patient.findById(patientId);
      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Fetch Doctor
      const doctor = await Doctor.findById(doctorId);
      if (!doctor || !doctor.isActive) {
        throw new AppError("Doctor not found or unavailable", 404);
      }

      // Check Slot Availability
      const isSlotAvailable = await AppointmentService.checkSlotAvailability(
        doctorId,
        new Date(appointmentDateTime),
        duration // taken from req.body (validated)
      );
      if (!isSlotAvailable) {
        throw new AppError("Selected time slot is not available", 409);
      }
      // Create Appointment
      const appointment = new Appointment({
        patient: patientId,
        doctor: doctorId,
        appointmentDateTime: new Date(appointmentDateTime),
        duration,
        appointmentType,
        symptoms: symptoms || [],
        notes,
        bookingSource,
        specialRequirements,
        paymentStatus,
        paymentMethod,
        priority,
        status,
        paymentAmount: AppointmentController.getFeeByAppointmentType(doctor, appointmentType),
        metadata: {
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        },
      });

      const appResponse = await appointment.save();
      console.log("appointment booked", appResponse);

      // Update statistics
      await Patient.findByIdAndUpdate(patientId, {
        $inc: { "statistics.totalAppointments": 1 },
      });

      await Doctor.findByIdAndUpdate(doctorId, {
        $inc: { "statistics.totalAppointments": 1 },
      });

      // Populate response fields
      await appointment.populate(["patient", "doctor"]);

      logger.info(`New appointment booked: ${appointment.appointmentId}`, {
        appointmentId: appointment.appointmentId,
        patientId: patient.patientId,
        doctorId: doctor.doctorId,
        bookingSource,
      });

      res.status(201).json({
        success: true,
        message: "Appointment booked successfully",
        data: {
          appointment,
          confirmationCode: appointment.appointmentId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor availability
  //   static async getDoctorAvailability(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { doctorId } = req.params;
  //       const { startDate, endDate } = req.query;

  //       const doctor = await Doctor.findById(doctorId);
  //       if (!doctor) {
  //         throw new AppError("Doctor not found", 404);
  //       }

  //       const availability = await AppointmentService.getDoctorAvailability(
  //         doctorId,
  //         new Date(startDate),
  //         new Date(endDate)
  //       );

  //       res.json({
  //         success: true,
  //         data: {
  //           doctor: {
  //             id: doctor._id,
  //             name: doctor.fullName,
  //             specialization: doctor.professionalInfo.specialization,
  //           },
  //           availability,
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Get available slots for a specific date
  //   static async getAvailableSlots(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { doctorId, date } = req.params;

  //       const doctor = await Doctor.findById(doctorId);
  //       if (!doctor) {
  //         throw new AppError("Doctor not found", 404);
  //       }

  //       const slots = await AppointmentService.getAvailableSlots(
  //         doctorId,
  //         new Date(date)
  //       );

  //       res.json({
  //         success: true,
  //         data: {
  //           date,
  //           doctorId,
  //           slots,
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  // Get all appointments with filters
  static async getAllAppointments(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const query = req.validatedQuery || {};
      const {
        page = 1,
        limit = 20,
        status,
        doctorId,
        patientId,
        bookingSource,
        startDate,
        endDate,
        sortBy = "appointmentDateTime",
        sortOrder = "asc",
      } = query;

      const filter: any = {};

      if (status) filter.status = status;
      if (doctorId) filter.doctor = doctorId;
      if (patientId) filter.patient = patientId;
      if (bookingSource) filter.bookingSource = bookingSource;

      if (startDate || endDate) {
        filter.appointmentDateTime = {};
        if (startDate) filter.appointmentDateTime.$gte = new Date(startDate);
        if (endDate) filter.appointmentDateTime.$lte = new Date(endDate);
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const appointments = await Appointment.find(filter)
        .populate("patient", "personalInfo contactInfo patientId")
        .populate("doctor", "personalInfo professionalInfo doctorId")
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Appointment.countDocuments(filter);

      res.json({
        success: true,
        data: {
          appointments,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  //   // Additional methods would continue here...
  //   // (getAppointmentById, updateAppointment, cancelAppointment, etc.)

  //   // Get appointment by ID
  static async getAppointmentById(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { id } = req.params;

      const appointment = await Appointment.findById(id)
        .populate(
          "patient",
          "personalInfo contactInfo patientId medicalHistory"
        )
        .populate(
          "doctor",
          "personalInfo professionalInfo doctorId fees schedule"
        );

      if (!appointment) {
        throw new AppError("Appointment not found", 404);
      }

      res.json({
        success: true,
        data: { appointment },
      });
    } catch (error) {
      next(error);
    }
  }

  //   // Update appointment
  //   static async updateAppointment(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { id } = req.params;
  //       const {
  //         appointmentDateTime,
  //         symptoms,
  //         notes,
  //         specialRequirements,
  //         appointmentType,
  //       } = req.body;

  //       const appointment = await Appointment.findById(id);
  //       if (!appointment) {
  //         throw new AppError("Appointment not found", 404);
  //       }

  //       // Check if appointment can be updated (not completed or cancelled)
  //       if (["completed", "cancelled"].includes(appointment.status)) {
  //         throw new AppError(
  //           `Cannot update ${appointment.status} appointment`,
  //           400
  //         );
  //       }

  //       // If updating appointment time, check availability
  //       if (
  //         appointmentDateTime &&
  //         appointmentDateTime !== appointment.appointmentDateTime.toISOString()
  //       ) {
  //         const doctor = await Doctor.findById(appointment.doctor);
  //         const isSlotAvailable = await AppointmentService.checkSlotAvailability(
  //           appointment.doctor,
  //           new Date(appointmentDateTime),
  //           doctor.schedule.slotDuration,
  //           id // Exclude current appointment from availability check
  //         );

  //         if (!isSlotAvailable) {
  //           throw new AppError("New time slot is not available", 409);
  //         }
  //       }

  //       const updateData = {
  //         ...(appointmentDateTime && {
  //           appointmentDateTime: new Date(appointmentDateTime),
  //         }),
  //         ...(symptoms && { symptoms }),
  //         ...(notes && { notes }),
  //         ...(specialRequirements && { specialRequirements }),
  //         ...(appointmentType && { appointmentType }),
  //         updatedAt: new Date(),
  //       };

  //       const updatedAppointment = await Appointment.findByIdAndUpdate(
  //         id,
  //         updateData,
  //         { new: true, runValidators: true }
  //       ).populate(["patient", "doctor"]);

  //       // Send update notification
  //       await NotificationService.sendAppointmentUpdate(updatedAppointment._id);

  //       logger.info(`Appointment updated: ${updatedAppointment.appointmentId}`, {
  //         appointmentId: updatedAppointment.appointmentId,
  //         changes: Object.keys(updateData),
  //       });

  //       res.json({
  //         success: true,
  //         message: "Appointment updated successfully",
  //         data: { appointment: updatedAppointment },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Cancel appointment
  //   static async cancelAppointment(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { id } = req.params;
  //       const { cancellationReason, refundRequested = false } = req.body;

  //       const appointment = await Appointment.findById(id);
  //       if (!appointment) {
  //         throw new AppError("Appointment not found", 404);
  //       }

  //       if (appointment.status === "cancelled") {
  //         throw new AppError("Appointment is already cancelled", 400);
  //       }

  //       if (appointment.status === "completed") {
  //         throw new AppError("Cannot cancel completed appointment", 400);
  //       }

  //       // Check cancellation policy (24 hours before appointment)
  //       const twentyFourHoursFromNow = new Date();
  //       twentyFourHoursFromNow.setHours(twentyFourHoursFromNow.getHours() + 24);

  //       const canCancelWithoutPenalty =
  //         appointment.appointmentDateTime > twentyFourHoursFromNow;

  //       const updatedAppointment = await Appointment.findByIdAndUpdate(
  //         id,
  //         {
  //           status: "cancelled",
  //           cancellation: {
  //             cancelledAt: new Date(),
  //             reason: cancellationReason,
  //             refundRequested,
  //             refundEligible: canCancelWithoutPenalty,
  //           },
  //           updatedAt: new Date(),
  //         },
  //         { new: true, runValidators: true }
  //       ).populate(["patient", "doctor"]);

  //       // Update statistics
  //       await Patient.findByIdAndUpdate(appointment.patient, {
  //         $inc: { "statistics.cancelledAppointments": 1 },
  //       });

  //       await Doctor.findByIdAndUpdate(appointment.doctor, {
  //         $inc: { "statistics.cancelledAppointments": 1 },
  //       });

  //       // Send cancellation notification
  //       await NotificationService.sendAppointmentCancellation(
  //         updatedAppointment._id
  //       );

  //       logger.info(
  //         `Appointment cancelled: ${updatedAppointment.appointmentId}`,
  //         {
  //           appointmentId: updatedAppointment.appointmentId,
  //           reason: cancellationReason,
  //           refundEligible: canCancelWithoutPenalty,
  //         }
  //       );

  //       res.json({
  //         success: true,
  //         message: "Appointment cancelled successfully",
  //         data: {
  //           appointment: updatedAppointment,
  //           refundEligible: canCancelWithoutPenalty,
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Search appointments
  //   static async searchAppointments(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { query, page = 1, limit = 20, filters = {} } = req.query;

  //       const searchFilter = {
  //         $or: [
  //           {
  //             "patient.personalInfo.firstName": { $regex: query, $options: "i" },
  //           },
  //           { "patient.personalInfo.lastName": { $regex: query, $options: "i" } },
  //           { "patient.contactInfo.email": { $regex: query, $options: "i" } },
  //           { "patient.patientId": { $regex: query, $options: "i" } },
  //           { appointmentId: { $regex: query, $options: "i" } },
  //         ],
  //         ...filters,
  //       };

  //       const appointments = await Appointment.aggregate([
  //         {
  //           $lookup: {
  //             from: "patients",
  //             localField: "patient",
  //             foreignField: "_id",
  //             as: "patient",
  //           },
  //         },
  //         {
  //           $lookup: {
  //             from: "doctors",
  //             localField: "doctor",
  //             foreignField: "_id",
  //             as: "doctor",
  //           },
  //         },
  //         { $unwind: "$patient" },
  //         { $unwind: "$doctor" },
  //         { $match: searchFilter },
  //         { $sort: { appointmentDateTime: -1 } },
  //         { $skip: (page - 1) * limit },
  //         { $limit: parseInt(limit) },
  //       ]);

  //       const total = await Appointment.aggregate([
  //         {
  //           $lookup: {
  //             from: "patients",
  //             localField: "patient",
  //             foreignField: "_id",
  //             as: "patient",
  //           },
  //         },
  //         { $unwind: "$patient" },
  //         { $match: searchFilter },
  //         { $count: "total" },
  //       ]);

  //       res.json({
  //         success: true,
  //         data: {
  //           appointments,
  //           pagination: {
  //             page: parseInt(page),
  //             limit: parseInt(limit),
  //             total: total[0]?.total || 0,
  //             pages: Math.ceil((total[0]?.total || 0) / limit),
  //           },
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Update appointment status
  //   static async updateAppointmentStatus(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { id } = req.params;
  //       const { status, notes } = req.body;

  //       const validStatuses = [
  //         "scheduled",
  //         "confirmed",
  //         "in-progress",
  //         "completed",
  //         "cancelled",
  //         "no-show",
  //       ];
  //       if (!validStatuses.includes(status)) {
  //         throw new AppError("Invalid status", 400);
  //       }

  //       const appointment = await Appointment.findById(id);
  //       if (!appointment) {
  //         throw new AppError("Appointment not found", 404);
  //       }

  //       const updatedAppointment = await Appointment.findByIdAndUpdate(
  //         id,
  //         {
  //           status,
  //           ...(notes && { statusNotes: notes }),
  //           updatedAt: new Date(),
  //         },
  //         { new: true, runValidators: true }
  //       ).populate(["patient", "doctor"]);

  //       // Update statistics based on status
  //       if (status === "completed") {
  //         await Patient.findByIdAndUpdate(appointment.patient, {
  //           $inc: { "statistics.completedAppointments": 1 },
  //         });
  //         await Doctor.findByIdAndUpdate(appointment.doctor, {
  //           $inc: { "statistics.completedAppointments": 1 },
  //         });
  //       }

  //       // Send status update notification
  //       await NotificationService.sendAppointmentStatusUpdate(
  //         updatedAppointment._id,
  //         status
  //       );

  //       logger.info(
  //         `Appointment status updated: ${updatedAppointment.appointmentId}`,
  //         {
  //           appointmentId: updatedAppointment.appointmentId,
  //           oldStatus: appointment.status,
  //           newStatus: status,
  //         }
  //       );

  //       res.json({
  //         success: true,
  //         message: "Appointment status updated successfully",
  //         data: { appointment: updatedAppointment },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Reschedule appointment
  //   static async rescheduleAppointment(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { id } = req.params;
  //       const { newDateTime, reason } = req.body;

  //       const appointment = await Appointment.findById(id);
  //       if (!appointment) {
  //         throw new AppError("Appointment not found", 404);
  //       }

  //       if (["completed", "cancelled"].includes(appointment.status)) {
  //         throw new AppError(
  //           `Cannot reschedule ${appointment.status} appointment`,
  //           400
  //         );
  //       }

  //       const doctor = await Doctor.findById(appointment.doctor);
  //       const isSlotAvailable = await AppointmentService.checkSlotAvailability(
  //         appointment.doctor,
  //         new Date(newDateTime),
  //         doctor.schedule.slotDuration,
  //         id
  //       );

  //       if (!isSlotAvailable) {
  //         throw new AppError("New time slot is not available", 409);
  //       }

  //       const oldDateTime = appointment.appointmentDateTime;
  //       const updatedAppointment = await Appointment.findByIdAndUpdate(
  //         id,
  //         {
  //           appointmentDateTime: new Date(newDateTime),
  //           status: "scheduled",
  //           reschedule: {
  //             originalDateTime: oldDateTime,
  //             newDateTime: new Date(newDateTime),
  //             reason,
  //             rescheduledAt: new Date(),
  //           },
  //           updatedAt: new Date(),
  //         },
  //         { new: true, runValidators: true }
  //       ).populate(["patient", "doctor"]);

  //       // Send reschedule notification
  //       await NotificationService.sendAppointmentReschedule(
  //         updatedAppointment._id
  //       );

  //       logger.info(
  //         `Appointment rescheduled: ${updatedAppointment.appointmentId}`,
  //         {
  //           appointmentId: updatedAppointment.appointmentId,
  //           oldDateTime: oldDateTime.toISOString(),
  //           newDateTime: newDateTime,
  //           reason,
  //         }
  //       );

  //       res.json({
  //         success: true,
  //         message: "Appointment rescheduled successfully",
  //         data: { appointment: updatedAppointment },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Confirm appointment
  //   static async confirmAppointment(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { id } = req.params;

  //       const appointment = await Appointment.findById(id);
  //       if (!appointment) {
  //         throw new AppError("Appointment not found", 404);
  //       }

  //       if (appointment.status !== "scheduled") {
  //         throw new AppError("Only scheduled appointments can be confirmed", 400);
  //       }

  //       const updatedAppointment = await Appointment.findByIdAndUpdate(
  //         id,
  //         {
  //           status: "confirmed",
  //           confirmedAt: new Date(),
  //           updatedAt: new Date(),
  //         },
  //         { new: true, runValidators: true }
  //       ).populate(["patient", "doctor"]);

  //       // Send confirmation notification
  //       await NotificationService.sendAppointmentConfirmed(
  //         updatedAppointment._id
  //       );

  //       logger.info(
  //         `Appointment confirmed: ${updatedAppointment.appointmentId}`,
  //         {
  //           appointmentId: updatedAppointment.appointmentId,
  //         }
  //       );

  //       res.json({
  //         success: true,
  //         message: "Appointment confirmed successfully",
  //         data: { appointment: updatedAppointment },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Complete appointment
  //   static async completeAppointment(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { id } = req.params;
  //       const {
  //         diagnosis,
  //         treatment,
  //         prescription,
  //         followUpRequired,
  //         followUpDate,
  //         doctorNotes,
  //       } = req.body;

  //       const appointment = await Appointment.findById(id);
  //       if (!appointment) {
  //         throw new AppError("Appointment not found", 404);
  //       }

  //       if (appointment.status === "completed") {
  //         throw new AppError("Appointment is already completed", 400);
  //       }

  //       if (appointment.status === "cancelled") {
  //         throw new AppError("Cannot complete cancelled appointment", 400);
  //       }

  //       const updatedAppointment = await Appointment.findByIdAndUpdate(
  //         id,
  //         {
  //           status: "completed",
  //           completedAt: new Date(),
  //           medicalRecord: {
  //             diagnosis,
  //             treatment,
  //             prescription,
  //             doctorNotes,
  //             followUpRequired,
  //             ...(followUpDate && { followUpDate: new Date(followUpDate) }),
  //           },
  //           updatedAt: new Date(),
  //         },
  //         { new: true, runValidators: true }
  //       ).populate(["patient", "doctor"]);

  //       // Update statistics
  //       await Patient.findByIdAndUpdate(appointment.patient, {
  //         $inc: { "statistics.completedAppointments": 1 },
  //       });

  //       await Doctor.findByIdAndUpdate(appointment.doctor, {
  //         $inc: { "statistics.completedAppointments": 1 },
  //       });

  //       // Add to patient's medical history
  //       await Patient.findByIdAndUpdate(appointment.patient, {
  //         $push: {
  //           medicalHistory: {
  //             appointmentId: appointment._id,
  //             date: new Date(),
  //             diagnosis,
  //             treatment,
  //             prescription,
  //             doctorId: appointment.doctor,
  //           },
  //         },
  //       });

  //       // Send completion notification
  //       await NotificationService.sendAppointmentCompleted(
  //         updatedAppointment._id
  //       );

  //       logger.info(
  //         `Appointment completed: ${updatedAppointment.appointmentId}`,
  //         {
  //           appointmentId: updatedAppointment.appointmentId,
  //           diagnosis,
  //           followUpRequired,
  //         }
  //       );

  //       res.json({
  //         success: true,
  //         message: "Appointment completed successfully",
  //         data: { appointment: updatedAppointment },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Get daily report
  //   static async getDailyReport(req: Request, res: Response, next: NextFunction) {
  //     try {
  //       const { date } = req.query;
  //       const reportDate = date ? new Date(date) : new Date();

  //       const startOfDay = new Date(reportDate);
  //       startOfDay.setHours(0, 0, 0, 0);

  //       const endOfDay = new Date(reportDate);
  //       endOfDay.setHours(23, 59, 59, 999);

  //       const report = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: startOfDay, $lte: endOfDay },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: null,
  //             totalAppointments: { $sum: 1 },
  //             scheduled: {
  //               $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] },
  //             },
  //             confirmed: {
  //               $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
  //             },
  //             completed: {
  //               $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
  //             },
  //             cancelled: {
  //               $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
  //             },
  //             noShows: {
  //               $sum: { $cond: [{ $eq: ["$status", "no-show"] }, 1, 0] },
  //             },
  //             totalRevenue: { $sum: "$paymentAmount" },
  //           },
  //         },
  //       ]);

  //       const appointmentsByHour = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: startOfDay, $lte: endOfDay },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: { $hour: "$appointmentDateTime" },
  //             count: { $sum: 1 },
  //           },
  //         },
  //         { $sort: { _id: 1 } },
  //       ]);

  //       res.json({
  //         success: true,
  //         data: {
  //           date: reportDate.toISOString().split("T")[0],
  //           summary: report[0] || {
  //             totalAppointments: 0,
  //             scheduled: 0,
  //             confirmed: 0,
  //             completed: 0,
  //             cancelled: 0,
  //             noShows: 0,
  //             totalRevenue: 0,
  //           },
  //           hourlyDistribution: appointmentsByHour,
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Get weekly report
  //   static async getWeeklyReport(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { startDate } = req.query;
  //       const weekStart = startDate ? new Date(startDate) : new Date();

  //       // Get start of week (Monday)
  //       const dayOfWeek = weekStart.getDay();
  //       const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  //       weekStart.setDate(diff);
  //       weekStart.setHours(0, 0, 0, 0);

  //       const weekEnd = new Date(weekStart);
  //       weekEnd.setDate(weekStart.getDate() + 6);
  //       weekEnd.setHours(23, 59, 59, 999);

  //       const dailyStats = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: weekStart, $lte: weekEnd },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: {
  //               year: { $year: "$appointmentDateTime" },
  //               month: { $month: "$appointmentDateTime" },
  //               day: { $dayOfMonth: "$appointmentDateTime" },
  //             },
  //             totalAppointments: { $sum: 1 },
  //             completed: {
  //               $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
  //             },
  //             cancelled: {
  //               $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
  //             },
  //             revenue: { $sum: "$paymentAmount" },
  //           },
  //         },
  //         { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
  //       ]);

  //       const weeklyTotals = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: weekStart, $lte: weekEnd },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: null,
  //             totalAppointments: { $sum: 1 },
  //             totalRevenue: { $sum: "$paymentAmount" },
  //             avgDailyAppointments: { $avg: 1 },
  //           },
  //         },
  //       ]);

  //       res.json({
  //         success: true,
  //         data: {
  //           weekStart: weekStart.toISOString().split("T")[0],
  //           weekEnd: weekEnd.toISOString().split("T")[0],
  //           summary: weeklyTotals[0] || {
  //             totalAppointments: 0,
  //             totalRevenue: 0,
  //             avgDailyAppointments: 0,
  //           },
  //           dailyBreakdown: dailyStats,
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }

  //   // Get monthly report
  //   static async getMonthlyReport(
  //     req: Request,
  //     res: Response,
  //     next: NextFunction
  //   ) {
  //     try {
  //       const { year, month } = req.query;
  //       const currentDate = new Date();
  //       const reportYear = year ? parseInt(year) : currentDate.getFullYear();
  //       const reportMonth = month ? parseInt(month) - 1 : currentDate.getMonth();

  //       const monthStart = new Date(reportYear, reportMonth, 1);
  //       const monthEnd = new Date(
  //         reportYear,
  //         reportMonth + 1,
  //         0,
  //         23,
  //         59,
  //         59,
  //         999
  //       );

  //       const monthlyStats = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: monthStart, $lte: monthEnd },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: null,
  //             totalAppointments: { $sum: 1 },
  //             scheduled: {
  //               $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] },
  //             },
  //             confirmed: {
  //               $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
  //             },
  //             completed: {
  //               $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
  //             },
  //             cancelled: {
  //               $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
  //             },
  //             noShows: {
  //               $sum: { $cond: [{ $eq: ["$status", "no-show"] }, 1, 0] },
  //             },
  //             totalRevenue: { $sum: "$paymentAmount" },
  //             avgAppointmentValue: { $avg: "$paymentAmount" },
  //           },
  //         },
  //       ]);

  //       const weeklyBreakdown = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: monthStart, $lte: monthEnd },
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: { $week: "$appointmentDateTime" },
  //             count: { $sum: 1 },
  //             revenue: { $sum: "$paymentAmount" },
  //           },
  //         },
  //         { $sort: { _id: 1 } },
  //       ]);

  //       const topDoctors = await Appointment.aggregate([
  //         {
  //           $match: {
  //             appointmentDateTime: { $gte: monthStart, $lte: monthEnd },
  //           },
  //         },
  //         {
  //           $lookup: {
  //             from: "doctors",
  //             localField: "doctor",
  //             foreignField: "_id",
  //             as: "doctorInfo",
  //           },
  //         },
  //         { $unwind: "$doctorInfo" },
  //         {
  //           $group: {
  //             _id: "$doctor",
  //             doctorName: { $first: "$doctorInfo.personalInfo.firstName" },
  //             appointmentCount: { $sum: 1 },
  //             revenue: { $sum: "$paymentAmount" },
  //           },
  //         },
  //         { $sort: { appointmentCount: -1 } },
  //         { $limit: 10 },
  //       ]);

  //       res.json({
  //         success: true,
  //         data: {
  //           month: reportMonth + 1,
  //           year: reportYear,
  //           summary: monthlyStats[0] || {
  //             totalAppointments: 0,
  //             scheduled: 0,
  //             confirmed: 0,
  //             completed: 0,
  //             cancelled: 0,
  //             noShows: 0,
  //             totalRevenue: 0,
  //             avgAppointmentValue: 0,
  //           },
  //           weeklyBreakdown,
  //           topDoctors,
  //         },
  //       });
  //     } catch (error) {
  //       next(error);
  //     }
  //   }
}

export default AppointmentController;
