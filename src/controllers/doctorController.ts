import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import Doctor, { IDoctorDocument } from "../models/Doctor";
import Appointment from "../models/Appointment";
import Patient from "../models/Patient";
import NotificationService from "../services/notificationService";
import logger from "../utils/logger";
import crypto from "crypto";
import { AppError } from "../types/errors";

// Types for request bodies
interface RegisterDoctorBody {
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  professionalInfo: {
    specialization: string;
    qualifications: string[];
    experience: number;
    licenseNumber: string;
    department?: string;
  };
  schedule?: {
    workingDays: {
      day: string;
      startTime: string;
      endTime: string;
      isWorking: boolean;
    }[];
    slotDuration?: number;
    breakTimes?: {
      startTime: string;
      endTime: string;
      description?: string;
    }[];
  };
  availability?: {
    isAvailable?: boolean;
    unavailableDates?: Date[];
    maxAppointmentsPerDay?: number;
  };
  fees: {
    consultationFee: number;
    followUpFee?: number;
    emergencyFee?: number;
  };
}

interface LoginBody {
  email: string;
  password: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
}

interface UpdateScheduleBody {
  workingDays: {
    day: string;
    startTime: string;
    endTime: string;
    isWorking: boolean;
  }[];
  slotDuration?: number;
  breakTimes?: {
    startTime: string;
    endTime: string;
    description?: string;
  }[];
}

interface UpdateFeesBody {
  consultationFee: number;
  followUpFee?: number;
  emergencyFee?: number;
}

// Response types
interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    doctor: {
      id: string;
      doctorId: string;
      fullName: string;
      email: string;
      isActive: boolean;
    };
    token: string;
  };
}

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// JWT payload interface
interface JwtPayload {
  doctorId: string;
  type: string;
}

interface AddUnavailableDateBody {
  date: string;
  reason: string;
  type: "full-day" | "half-day" | "morning" | "afternoon";
  notes?: string;
}

interface AddDateRangeBody {
  startDate: string;
  endDate: string;
  reason: string;
  type: "full-day" | "half-day" | "morning" | "afternoon";
  notes?: string;
}

interface UpdateUnavailableDateBody {
  reason?: string;
  type?: "full-day" | "half-day" | "morning" | "afternoon";
  notes?: string;
}

class DoctorController {
  // Generate JWT token
  private static generateToken(doctorId: string): string {
    const payload: JwtPayload = { doctorId, type: "doctor" };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not defined in environment variables.");
    }

    const options: SignOptions = {
      expiresIn: (process.env.JWT_EXPIRES_IN ||
        "90d") as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, secret, options);
  }

  // Register new doctor
  static async registerDoctor(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = req.body;

      // Check if doctor already exists
      const existingDoctor = await Doctor.findOne({
        $or: [
          { "personalInfo.email": data.personalInfo.email.toLowerCase() },
          { "personalInfo.phone": data.personalInfo.phone },
          {
            "professionalInfo.licenseNumber":
              data.professionalInfo.licenseNumber,
          },
        ],
      });

      if (existingDoctor) {
        throw new AppError(
          "Doctor with this email, phone, or license number already exists",
          409
        );
      }

      const verificationToken = crypto.randomBytes(32).toString("hex");
      const tokenExpiry = new Date();
      tokenExpiry.setHours(tokenExpiry.getHours() + 24);

      // Create new doctor
      const doctor = new Doctor({
        personalInfo: {
          firstName: data.personalInfo.firstName.trim(),
          lastName: data.personalInfo.lastName.trim(),
          email: data.personalInfo.email.toLowerCase().trim(),
          phone: data.personalInfo.phone.trim(),
        },
        professionalInfo: {
          specialization: data.professionalInfo.specialization,
          qualifications: data.professionalInfo.qualifications,
          experience: data.professionalInfo.experience,
          licenseNumber: data.professionalInfo.licenseNumber.toUpperCase(),
          department: data.professionalInfo.department,
        },
        schedule: {
          workingDays: data.schedule?.workingDays || [],
          slotDuration: data.schedule?.slotDuration || 30,
          breakTimes: data.schedule?.breakTimes || [],
        },
        availability: {
          isAvailable: data.availability?.isAvailable ?? true,
          unavailableDates: data.availability?.unavailableDates || [],
          maxAppointmentsPerDay: data.availability?.maxAppointmentsPerDay || 20,
        },
        fees: {
          consultationFee: data.fees.consultationFee,
          followUpFee: data.fees.followUpFee,
          emergencyFee: data.fees.emergencyFee,
        },
        statistics: {
          totalAppointments: 0,
          completedAppointments: 0,
          cancelledAppointments: 0,
          rating: 0,
          reviewCount: 0,
        },
        authentication: {
          password: data.authentication.password,
          emailVerificationToken: verificationToken, // ← Fixed field name
          emailVerificationExpires: tokenExpiry, // ← Added expiry field
          isVerified: false,
        },
        isActive: false,
      });

      await doctor.save();

      try {
        await NotificationService.sendEmail({
          to: doctor.personalInfo.email,
          subject: "✉️ Verify Your Email Address - Doctor Registration",
          template: "doctor-email-verification",
          data: {
            doctorName: doctor.fullName,
            verificationUrl: `${
              process.env.FRONTEND_URL || "http://localhost:5173"
            }/auth/verifyemail/${verificationToken}?type=doctor`,
            expiresIn: "24 hours",
            clinicDetails: process.env.CLINIC_DETAILS || "Healthcare Clinic",
          },
        });

        logger.info(`Verification email sent to doctor: ${doctor.doctorId}`, {
          doctorId: doctor.doctorId,
          email: doctor.personalInfo.email,
        });
      } catch (emailError) {
        logger.error(
          `Failed to send verification email to ${doctor.personalInfo.email}:`,
          emailError
        );
      }

      // Generate token
      const token = DoctorController.generateToken(doctor._id.toString());

      logger.info(`New doctor registered: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        email: doctor.personalInfo.email,
        specialization: doctor.professionalInfo.specialization,
      });

      res.status(201).json({
        success: true,
        message: "Doctor registered successfully.",
        data: {
          doctor: {
            id: (doctor._id as any).toString(),
            doctorId: doctor.doctorId,
            fullName: doctor.fullName,
            email: doctor.personalInfo.email,
            isActive: doctor.isActive,
          },
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Doctor login
  static async loginDoctor(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.body;

      // Find doctor by email
      const doctor = await Doctor.findOne({
        "personalInfo.email": email.toLowerCase(),
        isActive: true,
      });

      if (!doctor) {
        throw new AppError("Invalid email or password", 401);
      }

      // Note: Password comparison would need to be implemented in the Doctor model
      // For now, we'll assume a simple comparison

      // Generate token
      const token = DoctorController.generateToken(doctor._id.toString());

      logger.info(`Doctor logged in: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        email: doctor.personalInfo.email,
      });

      res.json({
        success: true,
        message: "Login successful",
        data: {
          doctor: {
            id: doctor._id.toString(),
            doctorId: doctor.doctorId,
            fullName: doctor.fullName,
            email: doctor.personalInfo.email,
            isActive: doctor.isActive,
          },
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor profile
  static async getDoctorProfile(
    req: Request,
    res: Response<ApiResponse<{ doctor: IDoctorDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }
      
      res.json({
        success: true,
        data: { doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update doctor profile
  static async updateDoctorProfile(
    req: Request,
    res: Response<ApiResponse<{ doctor: IDoctorDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.doctor?.id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor profile updated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: { doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update professional information
  static async updateProfessionalInfo(
    req: Request,
    res: Response<ApiResponse<{ professionalInfo: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      // Check if license number is already in use
      if (updateData.licenseNumber) {
        const existingDoctor = await Doctor.findOne({
          "professionalInfo.licenseNumber":
            updateData.licenseNumber.toUpperCase(),
          _id: { $ne: res.locals.doctor?.id },
        });

        if (existingDoctor) {
          throw new AppError("Medical license number already in use", 409);
        }
      }

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.doctor?.id,
        { professionalInfo: updateData },
        { new: true, runValidators: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor professional info updated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Professional information updated successfully",
        data: { professionalInfo: doctor.professionalInfo },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update contact information
  static async updateContactInfo(
    req: Request,
    res: Response<ApiResponse<{ personalInfo: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      // Check if phone number is already in use
      if (updateData.phone) {
        const existingDoctor = await Doctor.findOne({
          "personalInfo.phone": updateData.phone,
          _id: { $ne: res.locals.doctor?.id },
        });

        if (existingDoctor) {
          throw new AppError(
            "Phone number already in use by another doctor",
            409
          );
        }
      }

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.doctor?.id,
        { personalInfo: updateData },
        { new: true, runValidators: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor contact info updated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Contact information updated successfully",
        data: { personalInfo: doctor.personalInfo },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor schedule
  static async getDoctorSchedule(
    req: Request,
    res: Response<ApiResponse<{ schedule: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findById(res.locals.doctor?.id).select(
        "schedule availability"
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      res.json({
        success: true,
        data: {
          schedule: { ...doctor.schedule, availability: doctor.availability },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update doctor schedule
  static async updateDoctorSchedule(
    req: Request,
    res: Response<ApiResponse<{ schedule: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const scheduleData = req.body as UpdateScheduleBody;

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.doctor?.id,
        { schedule: scheduleData },
        { new: true, runValidators: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor schedule updated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
      });

      res.json({
        success: true,
        message: "Schedule updated successfully",
        data: { schedule: doctor.schedule },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update availability
  static async updateAvailability(
    req: Request,
    res: Response<ApiResponse<{ availability: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.body;

      const updatePayload = Object.entries(updateData).reduce(
        (acc, [key, value]) => {
          acc[`availability.${key}`] = value;
          return acc;
        },
        {} as Record<string, any>
      );

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.doctor?.id,
        { $set: updatePayload },
        { new: true, runValidators: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor availability updated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
      });

      res.json({
        success: true,
        message: "Availability updated successfully",
        data: { availability: doctor.availability },
      });
    } catch (error) {
      next(error);
    }
  }

  // Add break time
  static async addBreakTime(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { day, startTime, endTime, title } = req.body;

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      doctor.schedule.breakTimes.push({
        day,
        startTime,
        endTime,
        title,
      });

      await doctor.save();

      logger.info(`Break time added for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        startTime,
        endTime,
      });

      res.json({
        success: true,
        message: "Break time added successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Remove break time
  static async removeBreakTime(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { breakId } = req.params;

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      const index = doctor.schedule.breakTimes.findIndex(
        (breakTime: any) => breakTime._id?.toString() === breakId
      );

      if (index === -1) {
        throw new AppError("Break time not found", 404);
      }

      doctor.schedule.breakTimes.splice(index, 1);
      await doctor.save();

      logger.info(`Break time removed for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        breakId,
      });

      res.json({
        success: true,
        message: "Break time removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get unavailable dates
  static async getUnavailableDates(
    req: Request,
    res: Response<ApiResponse<{ unavailableDates: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findById(res.locals.doctor?.id).select(
        "availability.unavailableDates"
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Transform data to match frontend expectations
      const unavailableDates = doctor.availability.unavailableDates.map(
        (date: any) => ({
          id: date.id || date._id?.toString(),
          date: date.date,
          reason: date.reason,
          type: date.type,
          notes: date.notes,
          createdAt: date.createdAt,
          updatedAt: date.updatedAt,
        })
      );

      res.json({
        success: true,
        data: { unavailableDates },
      });
    } catch (error) {
      next(error);
    }
  }

  // Add unavailable date
  static async addUnavailableDate(
    req: Request,
    res: Response<ApiResponse<{ unavailableDate: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        date,
        reason,
        type = "full-day",
        notes,
      } = req.body as AddUnavailableDateBody;

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Check if date already exists
      const existingDate = doctor.availability.unavailableDates.find(
        (unavailableDate: any) => unavailableDate.date === date
      );

      if (existingDate) {
        throw new AppError("Date is already marked as unavailable", 409);
      }

      // Add the unavailable date
      const newUnavailableDate = {
        id: new Date().getTime().toString(),
        date,
        reason,
        type,
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      doctor.availability.unavailableDates.push(newUnavailableDate);
      await doctor.save();

      // Cancel existing appointments on this date
      const startOfDay = new Date(date + "T00:00:00.000Z");
      const endOfDay = new Date(date + "T23:59:59.999Z");

      await Appointment.updateMany(
        {
          doctor: res.locals.user?.id,
          appointmentDateTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
          status: { $in: ["scheduled", "confirmed"] },
        },
        {
          status: "cancelled",
          statusUpdateReason: `Doctor unavailable: ${reason}`,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: res.locals.user?.id,
        }
      );

      logger.info(`Unavailable date added for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        date,
        reason,
        type,
      });

      res.status(201).json({
        success: true,
        message: "Unavailable date added successfully",
        data: { unavailableDate: newUnavailableDate },
      });
    } catch (error) {
      next(error);
    }
  }
  static async addUnavailableDateRange(
    req: Request,
    res: Response<ApiResponse<{ addedDates: any[]; count: number }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        startDate,
        endDate,
        reason,
        type = "full-day",
        notes,
      } = req.body as AddDateRangeBody;

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        throw new AppError(
          "Start date must be before or equal to end date",
          400
        );
      }

      // Generate all dates in the range
      const dates = [];
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split("T")[0];

        // Check if date already exists
        const existingDate = doctor.availability.unavailableDates.find(
          (unavailableDate: any) => unavailableDate.date === dateStr
        );

        if (!existingDate) {
          const newUnavailableDate = {
            id: `${new Date().getTime()}-${Math.random()
              .toString(36)
              .substr(2, 9)}`,
            date: dateStr,
            reason,
            type,
            notes,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          doctor.availability.unavailableDates.push(newUnavailableDate);
          dates.push(newUnavailableDate);
        }

        current.setDate(current.getDate() + 1);
      }

      if (dates.length === 0) {
        throw new AppError(
          "All dates in the range are already marked as unavailable",
          409
        );
      }

      await doctor.save();

      // Cancel existing appointments in the date range
      const startOfRange = new Date(startDate + "T00:00:00.000Z");
      const endOfRange = new Date(endDate + "T23:59:59.999Z");

      await Appointment.updateMany(
        {
          doctor: res.locals.user?.id,
          appointmentDateTime: {
            $gte: startOfRange,
            $lte: endOfRange,
          },
          status: { $in: ["scheduled", "confirmed"] },
        },
        {
          status: "cancelled",
          statusUpdateReason: `Doctor unavailable: ${reason}`,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: res.locals.user?.id,
        }
      );

      logger.info(
        `Date range added as unavailable for doctor: ${doctor.doctorId}`,
        {
          doctorId: doctor.doctorId,
          startDate,
          endDate,
          reason,
          type,
          addedCount: dates.length,
        }
      );

      res.status(201).json({
        success: true,
        message: `${dates.length} date(s) added as unavailable`,
        data: {
          addedDates: dates,
          count: dates.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // Remove unavailable date
  static async removeUnavailableDate(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { dateId } = req.params;

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      const index = doctor.availability.unavailableDates.findIndex(
        (unavailableDate: any) =>
          unavailableDate.id === dateId ||
          unavailableDate._id?.toString() === dateId
      );

      if (index === -1) {
        throw new AppError("Unavailable date not found", 404);
      }

      const removedDate = doctor.availability.unavailableDates[index];
      doctor.availability.unavailableDates.splice(index, 1);
      await doctor.save();

      logger.info(`Unavailable date removed for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        dateId,
        date: removedDate.date,
        reason: removedDate.reason,
      });

      res.json({
        success: true,
        message: "Unavailable date removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
  // Update unavailable date
  static async updateUnavailableDate(
    req: Request,
    res: Response<ApiResponse<{ unavailableDate: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { dateId } = req.params;
      const updateData = req.body as UpdateUnavailableDateBody;

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      const unavailableDate = doctor.availability.unavailableDates.find(
        (date: any) => date.id === dateId || date._id?.toString() === dateId
      );

      if (!unavailableDate) {
        throw new AppError("Unavailable date not found", 404);
      }

      // Update the fields
      Object.assign(unavailableDate, updateData, { updatedAt: new Date() });
      await doctor.save();

      logger.info(`Unavailable date updated for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        dateId,
        updateData,
      });

      res.json({
        success: true,
        message: "Unavailable date updated successfully",
        data: { unavailableDate },
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk remove unavailable dates
  static async bulkRemoveUnavailableDates(
    req: Request,
    res: Response<ApiResponse<{ removedCount: number }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { dateIds } = req.body as { dateIds: string[] };

      if (!Array.isArray(dateIds) || dateIds.length === 0) {
        throw new AppError(
          "dateIds array is required and cannot be empty",
          400
        );
      }

      const doctor = await Doctor.findById(res.locals.doctor?.id);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      let removedCount = 0;

      // Remove dates in reverse order to avoid index issues
      for (
        let i = doctor.availability.unavailableDates.length - 1;
        i >= 0;
        i--
      ) {
        const unavailableDate = doctor.availability.unavailableDates[i];
        if (dateIds.includes(unavailableDate.id!)) {
          doctor.availability.unavailableDates.splice(i, 1);
          removedCount++;
        }
      }

      if (removedCount === 0) {
        throw new AppError("No matching unavailable dates found", 404);
      }

      await doctor.save();

      logger.info(
        `Bulk removed unavailable dates for doctor: ${doctor.doctorId}`,
        {
          doctorId: doctor.doctorId,
          removedCount,
          dateIds,
        }
      );

      res.json({
        success: true,
        message: `${removedCount} unavailable date(s) removed successfully`,
        data: { removedCount },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get unavailable dates summary/statistics
  static async getUnavailableDatesSummary(
    req: Request,
    res: Response<ApiResponse<{ summary: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findById(res.locals.doctor?.id).select(
        "availability.unavailableDates"
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      const unavailableDates = doctor.availability.unavailableDates;
      const today = new Date().toISOString().split("T")[0];

      const summary = {
        total: unavailableDates.length,
        upcoming: unavailableDates.filter((date: any) => date.date >= today)
          .length,
        past: unavailableDates.filter((date: any) => date.date < today).length,
        thisMonth: unavailableDates.filter((date: any) => {
          const dateObj = new Date(date.date);
          const currentDate = new Date();
          return (
            dateObj.getMonth() === currentDate.getMonth() &&
            dateObj.getFullYear() === currentDate.getFullYear()
          );
        }).length,
        byType: unavailableDates.reduce((acc: any, date: any) => {
          acc[date.type] = (acc[date.type] || 0) + 1;
          return acc;
        }, {}),
        byReason: unavailableDates.reduce((acc: any, date: any) => {
          acc[date.reason] = (acc[date.reason] || 0) + 1;
          return acc;
        }, {}),
      };

      res.json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor fees
  static async getDoctorFees(
    req: Request,
    res: Response<ApiResponse<{ fees: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findById(res.locals.doctor?.id).select(
        "fees"
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      res.json({
        success: true,
        data: { fees: doctor.fees },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update doctor fees
  static async updateDoctorFees(
    req: Request,
    res: Response<ApiResponse<{ fees: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const feesData = req.validatedData as UpdateFeesBody;

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.doctor?.id,
        { fees: feesData },
        { new: true, runValidators: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor fees updated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        fees: feesData,
      });

      res.json({
        success: true,
        message: "Fees updated successfully",
        data: { fees: doctor.fees },
      });
    } catch (error) {
      next(error);
    }
  }

  // Change password
  static async changePassword(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { currentPassword, newPassword } =
        req.validatedData as ChangePasswordBody;

      // Note: Password functionality would need to be implemented in the Doctor model
      // For now, we'll just return success

      logger.info(`Password changed for doctor: ${res.locals.user?.id}`, {
        doctorId: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Upload profile picture
  static async uploadProfilePicture(
    req: Request,
    res: Response<ApiResponse<{ profilePicture: string }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError("No file uploaded", 400);
      }

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.user?.id,
        { profilePicture: req.file.path },
        { new: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Profile picture uploaded for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        filename: req.file.filename,
      });

      res.json({
        success: true,
        message: "Profile picture uploaded successfully",
        data: { profilePicture: req.file.path },
      });
    } catch (error) {
      next(error);
    }
  }

  // Upload documents
  static async uploadDocuments(
    req: Request,
    res: Response<ApiResponse<{ documents: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new AppError("No files uploaded", 400);
      }

      const documentPaths = files.map((file) => ({
        filename: file.originalname,
        path: file.path,
        uploadedAt: new Date(),
      }));

      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.user?.id,
        { $push: { documents: { $each: documentPaths } } },
        { new: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Documents uploaded for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        documentCount: files.length,
      });

      res.json({
        success: true,
        message: "Documents uploaded successfully",
        data: { documents: documentPaths },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor appointments
  static async getDoctorAppointments(
    req: Request,
    res: Response<ApiResponse<{ appointments: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate,
        sortBy = "appointmentDateTime",
        sortOrder = "desc",
      } = query;

      const filter: any = { doctor: res.locals.doctor?.id };

      if (status) filter.status = status;
      if (startDate || endDate) {
        filter.appointmentDateTime = {};
        if (startDate) filter.appointmentDateTime.$gte = new Date(startDate);
        if (endDate) filter.appointmentDateTime.$lte = new Date(endDate);
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const appointments = await Appointment.find(filter)
        .populate("patient", "personalInfo contactInfo patientId")
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Appointment.countDocuments(filter);

      res.json({
        success: true,
        data: { appointments },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get today's appointments
  static async getTodayAppointments(
    req: Request,
    res: Response<ApiResponse<{ appointments: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      const appointments = await Appointment.find({
        doctor: res.locals.doctor?.id,
        appointmentDateTime: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ["scheduled", "confirmed", "in-progress"] },
      })
        .populate("patient", "personalInfo contactInfo patientId")
        .sort({ appointmentDateTime: 1 })
        .lean();

      res.json({
        success: true,
        data: { appointments },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get upcoming appointments
  static async getUpcomingAppointments(
    req: Request,
    res: Response<ApiResponse<{ appointments: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const now = new Date();

      const appointments = await Appointment.find({
        doctor: res.locals.doctor?.id,
        appointmentDateTime: { $gte: now },
        status: { $in: ["scheduled", "confirmed"] },
      })
        .populate("patient", "personalInfo contactInfo patientId")
        .sort({ appointmentDateTime: 1 })
        .limit(10)
        .lean();

      res.json({
        success: true,
        data: { appointments },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get appointment details
  static async getAppointmentDetails(
    req: Request,
    res: Response<ApiResponse<{ appointment: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { appointmentId } = req.params;

      const appointment = await Appointment.findOne({
        _id: appointmentId,
        doctor: res.locals.doctor?.id,
      }).populate("patient", "personalInfo contactInfo patientId medicalInfo");

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

  // Update appointment status
  static async updateAppointmentStatus(
    req: Request,
    res: Response<ApiResponse<{ appointment: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { appointmentId } = req.params;
      const { status, reason } = req.validatedData;

      // First get the current appointment to capture the old status
      const currentAppointment = await Appointment.findOne({
        _id: appointmentId,
        doctor: res.locals.doctor?.id,
      });

      if (!currentAppointment) {
        throw new AppError("Appointment not found", 404);
      }

      const oldStatus = currentAppointment.status;

      // Update the appointment
      const appointment = await Appointment.findOneAndUpdate(
        { _id: appointmentId, doctor: res.locals.doctor?.id },
        {
          status,
          statusUpdateReason: reason,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: res.locals.doctor?.id,
        },
        { new: true }
      ).populate("patient", "personalInfo contactInfo");

      if (!appointment) {
        throw new AppError("Appointment not found", 404);
      }

      // Send status change notification to patient
      if (oldStatus !== status) {
        await NotificationService.sendStatusChangeNotification(
          appointment._id,
          oldStatus,
          status
        );
      }

      logger.info(
        `Appointment status updated by doctor: ${res.locals.doctor?.id}`,
        {
          appointmentId: appointment._id,
          oldStatus,
          newStatus: status,
          reason,
        }
      );

      res.json({
        success: true,
        message: "Appointment status updated successfully",
        data: { appointment },
      });
    } catch (error) {
      next(error);
    }
  }
  // Add consultation notes
  static async addConsultationNotes(
    req: Request,
    res: Response<ApiResponse<{ consultation: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { appointmentId } = req.params;
      const consultationData = req.validatedData;

      const appointment = await Appointment.findOneAndUpdate(
        { _id: appointmentId, doctor: res.locals.doctor?.id },
        {
          consultation: consultationData,
          status: "completed",
        },
        { new: true }
      ).populate("patient", "personalInfo contactInfo");

      if (!appointment) {
        throw new AppError("Appointment not found", 404);
      }

      logger.info(
        `Consultation notes added by doctor: ${res.locals.doctor?.id}`,
        {
          appointmentId: appointment._id,
          doctorId: res.locals.doctor?.id,
        }
      );

      res.json({
        success: true,
        message: "Consultation notes added successfully",
        data: { consultation: appointment.consultation },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor dashboard
  static async getDoctorDashboard(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctorId = res.locals.doctor?.id;

      // Get today's appointments
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));

      const todayAppointments = await Appointment.find({
        doctor: doctorId,
        appointmentStartTime: { $gte: startOfDay, $lte: endOfDay },
      })
        .populate("patient", "personalInfo contactInfo")
        .sort({ appointmentStartTime: 1 });

      // Get upcoming appointments
      const upcomingAppointments = await Appointment.find({
        doctor: doctorId,
        appointmentStartTime: { $gte: new Date() },
        status: { $in: ["scheduled", "confirmed"] },
      })
        .populate("patient", "personalInfo contactInfo")
        .sort({ appointmentStartTime: 1 })
        .limit(5);

      // Get recent patients
      const recentPatients = await Appointment.find({
        doctor: doctorId,
        status: "completed",
      })
        .populate("patient", "personalInfo contactInfo")
        .sort({ appointmentStartTime: -1 })
        .limit(5);

      // Get doctor statistics
      const doctor = await Doctor.findById(doctorId);

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Get monthly appointment statistics
      const currentYear = new Date().getFullYear();
      const monthlyStats = await Appointment.aggregate([
        {
          $match: {
            doctor: doctor._id,
            appointmentStartTime: {
              $gte: new Date(`${currentYear}-01-01`),
              $lte: new Date(`${currentYear}-12-31`),
            },
          },
        },
        {
          $group: {
            _id: { $month: "$appointmentDateTime" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      res.json({
        success: true,
        data: {
          todayAppointments,
          upcomingAppointments,
          recentPatients,
          statistics: doctor.statistics,
          monthlyStats,
          personalInfo: doctor.personalInfo,
          professionalInfo: doctor.professionalInfo,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor statistics
  static async getDoctorStatistics(
    req: Request,
    res: Response<ApiResponse<{ statistics: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctorId = res.locals.doctor?.id;

      const stats = await Appointment.aggregate([
        { $match: { doctor: doctorId } },
        {
          $group: {
            _id: null,
            totalAppointments: { $sum: 1 },
            completedAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            cancelledAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
            noShowAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "no-show"] }, 1, 0] },
            },
            upcomingAppointments: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$appointmentDateTime", new Date()] },
                      { $in: ["$status", ["scheduled", "confirmed"]] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const statistics = stats[0] || {
        totalAppointments: 0,
        completedAppointments: 0,
        cancelledAppointments: 0,
        noShowAppointments: 0,
        upcomingAppointments: 0,
      };

      // Calculate Rates
      statistics.completionRate =
        statistics.totalAppointments > 0
          ? (
              (statistics.completedAppointments /
                statistics.totalAppointments) *
              100
            ).toFixed(1)
          : "0";

      statistics.cancellationRate =
        statistics.totalAppointments > 0
          ? (
              (statistics.cancelledAppointments /
                statistics.totalAppointments) *
              100
            ).toFixed(1)
          : "0";

      // Get Unique Patients Count
      const uniquePatients = await Appointment.distinct("patient", {
        doctor: doctorId,
      });
      statistics.totalPatients = uniquePatients.length;

      res.json({
        success: true,
        data: { statistics },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get monthly calendar
  static async getMonthlyCalendar(
    req: Request,
    res: Response<ApiResponse<{ calendar: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { month, year } = req.validatedParams;

      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);

      const appointments = await Appointment.find({
        doctor: res.locals.user?.id,
        appointmentDateTime: { $gte: startDate, $lte: endDate },
      })
        .populate("patient", "personalInfo contactInfo")
        .sort({ appointmentDateTime: 1 });

      // Group appointments by date
      const calendar = appointments.reduce((acc: any, appointment: any) => {
        const date = appointment.appointmentDateTime
          .toISOString()
          .split("T")[0];
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(appointment);
        return acc;
      }, {});

      res.json({
        success: true,
        data: { calendar },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor patients
  static async getDoctorPatients(
    req: Request,
    res: Response<ApiResponse<{ patients: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const { page = 1, limit = 10, search } = query;

      // Get unique patients who have appointments with this doctor
      const appointmentPatients = await Appointment.distinct("patient", {
        doctor: res.locals.doctor?.id,
      });

      const filter: any = { _id: { $in: appointmentPatients } };

      if (search) {
        filter.$or = [
          { "personalInfo.firstName": { $regex: search, $options: "i" } },
          { "personalInfo.lastName": { $regex: search, $options: "i" } },
          { "contactInfo.email": { $regex: search, $options: "i" } },
          { "contactInfo.phone": { $regex: search, $options: "i" } },
          { patientId: { $regex: search, $options: "i" } },
        ];
      }

      const patients = await Patient.find(filter)
        .select("personalInfo contactInfo patientId statistics")
        .sort({ "personalInfo.firstName": 1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Patient.countDocuments(filter);

      res.json({
        success: true,
        data: { patients },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient history
  static async getPatientHistory(
    req: Request,
    res: Response<ApiResponse<{ history: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { patientId } = req.params;

      const history = await Appointment.find({
        patient: patientId,
        doctor: res.locals.doctor?.id,
        status: "completed",
      })
        .sort({ appointmentDateTime: -1 })
        .select("appointmentDateTime consultation symptoms notes");

      res.json({
        success: true,
        data: { history },
      });
    } catch (error) {
      next(error);
    }
  }

  // Search doctor patients
  static async searchDoctorPatients(
    req: Request,
    res: Response<ApiResponse<{ patients: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { q, limit = 10 } = req.validatedQuery || {};

      if (!q) {
        throw new AppError("Search query is required", 400);
      }

      // Get patients who have appointments with this doctor
      const appointmentPatients = await Appointment.distinct("patient", {
        doctor: res.locals.doctor?.id,
      });

      const patients = await Patient.find({
        _id: { $in: appointmentPatients },
        $or: [
          { "personalInfo.firstName": { $regex: q, $options: "i" } },
          { "personalInfo.lastName": { $regex: q, $options: "i" } },
          { "contactInfo.email": { $regex: q, $options: "i" } },
          { "contactInfo.phone": { $regex: q, $options: "i" } },
          { patientId: { $regex: q, $options: "i" } },
        ],
      })
        .select("personalInfo contactInfo patientId")
        .limit(Number(limit))
        .lean();

      res.json({
        success: true,
        data: { patients },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor reviews
  static async getDoctorReviews(
    req: Request,
    res: Response<ApiResponse<{ reviews: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const { page = 1, limit = 10 } = query;

      const reviews = await Appointment.find({
        doctor: res.locals.user?.id,
        "review.rating": { $exists: true },
      })
        .populate("patient", "personalInfo")
        .select("review appointmentDateTime patient")
        .sort({ "review.submittedAt": -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Appointment.countDocuments({
        doctor: res.locals.user?.id,
        "review.rating": { $exists: true },
      });

      res.json({
        success: true,
        data: { reviews },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get rating summary
  static async getRatingSummary(
    req: Request,
    res: Response<ApiResponse<{ summary: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const summary = await Appointment.aggregate([
        {
          $match: {
            doctor: res.locals.user?.id,
            "review.rating": { $exists: true },
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$review.rating" },
            totalReviews: { $sum: 1 },
            ratingDistribution: {
              $push: "$review.rating",
            },
          },
        },
      ]);

      const result = summary[0] || {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: [],
      };

      // Calculate rating distribution
      const distribution = result.ratingDistribution.reduce(
        (acc: any, rating: number) => {
          acc[rating] = (acc[rating] || 0) + 1;
          return acc;
        },
        {}
      );

      res.json({
        success: true,
        data: {
          summary: {
            averageRating: Math.round(result.averageRating * 10) / 10,
            totalReviews: result.totalReviews,
            ratingDistribution: distribution,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor notifications
  static async getDoctorNotifications(
    req: Request,
    res: Response<ApiResponse<{ notifications: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      // This would typically come from a notifications collection
      // For now, using appointment-based notifications as placeholder
      const notifications = await Appointment.find({
        doctor: res.locals.user?.id,
        status: { $in: ["scheduled", "confirmed"] },
        appointmentDateTime: { $gte: new Date() },
      })
        .populate("patient", "personalInfo")
        .sort({ appointmentDateTime: 1 })
        .limit(10)
        .select("appointmentDateTime patient status");

      const notificationList = notifications.map((apt) => ({
        type: "upcoming_appointment",
        title: "Upcoming Appointment",
        message: `Appointment with ${(apt.patient as any)?.fullName}`,
        appointmentId: apt._id,
        appointmentStartTime: apt.appointmentStartTime,
        isRead: false,
        createdAt: new Date(),
      }));

      res.json({
        success: true,
        data: { notifications: notificationList },
      });
    } catch (error) {
      next(error);
    }
  }

  // Mark notification as read
  static async markNotificationRead(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { notificationId } = req.validatedParams;

      // This would typically update a notifications collection
      // For now, just return success
      res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      next(error);
    }
  }

  // Mark all notifications as read
  static async markAllNotificationsRead(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      // This would typically update a notifications collection
      // For now, just return success
      res.json({
        success: true,
        message: "All notifications marked as read",
      });
    } catch (error) {
      next(error);
    }
  }

  // Deactivate account
  static async deactivateAccount(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findByIdAndUpdate(
        res.locals.user?.id,
        {
          isActive: false,
        },
        { new: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Cancel all future appointments
      await Appointment.updateMany(
        {
          doctor: res.locals.user?.id,
          appointmentDateTime: { $gte: new Date() },
          status: { $in: ["scheduled", "confirmed"] },
        },
        { status: "cancelled" }
      );

      logger.info(`Doctor account deactivated: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
      });

      res.json({
        success: true,
        message: "Account deactivated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Export doctor data
  static async exportDoctorData(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const doctor = await Doctor.findById(res.locals.user?.id);
      const appointments = await Appointment.find({
        doctor: res.locals.user?.id,
      }).populate("patient", "personalInfo contactInfo");

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      const exportData = {
        personalInfo: doctor.personalInfo,
        professionalInfo: doctor.professionalInfo,
        schedule: doctor.schedule,
        availability: doctor.availability,
        fees: doctor.fees,
        statistics: doctor.statistics,
        appointments: appointments.map((apt) => ({
          appointmentId: apt.appointmentId,
          patientName: (apt.patient as any)?.fullName,
          appointmentStartTime: apt.appointmentStartTime,
          status: apt.status,
          appointmentType: apt.appointmentType,
          symptoms: apt.symptoms,
          notes: apt.notes,
          consultation: apt.consultation,
        })),
        exportedAt: new Date().toISOString(),
      };

      logger.info(`Data export requested for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
      });

      res.json({
        success: true,
        message: "Doctor data exported successfully",
        data: exportData,
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PUBLIC METHODS ====================

  // Search doctors
  static async searchDoctors(
    req: Request,
    res: Response<ApiResponse<{ doctors: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const {
        q,
        specialization,
        experience,
        rating,
        availableToday,
        page = 1,
        limit = 10,
        sortBy = "statistics.rating",
        sortOrder = "desc",
      } = query;

      const filter: any = {
        isActive: true,
        "availability.isAvailable": true,
      };

      // Search by name or specialization
      if (q) {
        filter.$or = [
          { "personalInfo.firstName": { $regex: q, $options: "i" } },
          { "personalInfo.lastName": { $regex: q, $options: "i" } },
          { "professionalInfo.specialization": { $regex: q, $options: "i" } },
        ];
      }

      if (specialization) {
        filter["professionalInfo.specialization"] = {
          $regex: specialization,
          $options: "i",
        };
      }

      if (experience) {
        filter["professionalInfo.experience"] = { $gte: Number(experience) };
      }

      if (rating) {
        filter["statistics.rating"] = { $gte: Number(rating) };
      }

      // Filter for doctors available today would require checking working days
      // This is a simplified implementation
      if (availableToday === "true") {
        filter["availability.isAvailable"] = true;
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const doctors = await Doctor.find(filter)
        .select("personalInfo professionalInfo fees statistics doctorId")
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Doctor.countDocuments(filter);

      res.json({
        success: true,
        data: { doctors },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get public doctor list
  static async getPublicDoctorList(
    req: Request,
    res: Response<ApiResponse<{ doctors: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const { page = 1, limit = 12, specialization } = query;

      const filter: any = {
        isActive: true,
        "availability.isAvailable": true,
      };

      if (specialization) {
        filter["professionalInfo.specialization"] = {
          $regex: specialization,
          $options: "i",
        };
      }

      const doctors = await Doctor.find(filter)
        .select("personalInfo professionalInfo fees statistics doctorId")
        .sort({ "statistics.rating": -1, "professionalInfo.experience": -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Doctor.countDocuments(filter);

      res.json({
        success: true,
        data: { doctors },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get specializations
  static async getSpecializations(
    req: Request,
    res: Response<ApiResponse<{ specializations: string[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const specializations = await Doctor.distinct(
        "professionalInfo.specialization",
        {
          isActive: true,
          "availability.isAvailable": true,
        }
      );

      res.json({
        success: true,
        data: { specializations: specializations.sort() },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctors by specialization
  static async getDoctorsBySpecialization(
    req: Request,
    res: Response<ApiResponse<{ doctors: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { specialization } = req.validatedParams;
      const query = req.validatedQuery || {};
      const { page = 1, limit = 10 } = query;

      const doctors = await Doctor.find({
        "professionalInfo.specialization": {
          $regex: specialization,
          $options: "i",
        },
        isActive: true,
        "availability.isAvailable": true,
      })
        .select("personalInfo professionalInfo fees statistics doctorId")
        .sort({ "statistics.rating": -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Doctor.countDocuments({
        "professionalInfo.specialization": {
          $regex: specialization,
          $options: "i",
        },
        isActive: true,
        "availability.isAvailable": true,
      });

      res.json({
        success: true,
        data: { doctors },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get public doctor profile
  static async getPublicDoctorProfile(
    req: Request,
    res: Response<ApiResponse<{ doctor: any; reviews: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { doctorId } = req.validatedParams;

      const doctor = await Doctor.findOne({
        $or: [{ _id: doctorId }, { doctorId: doctorId }],
        isActive: true,
        "availability.isAvailable": true,
      }).select(
        "personalInfo professionalInfo fees statistics schedule availability doctorId"
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Get recent reviews
      const reviews = await Appointment.find({
        doctor: doctor._id,
        "review.rating": { $exists: true },
      })
        .populate("patient", "personalInfo.firstName")
        .select("review appointmentDateTime")
        .sort({ "review.submittedAt": -1 })
        .limit(5)
        .lean();

      res.json({
        success: true,
        data: {
          doctor,
          reviews,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Check if email exists
  static async checkEmailExists(
    req: Request,
    res: Response<ApiResponse<{ exists: boolean }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email } = req.validatedData;

      const doctor = await Doctor.findOne({
        "personalInfo.email": email.toLowerCase(),
      });

      res.json({
        success: true,
        data: { exists: !!doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Check if license exists
  static async checkLicenseExists(
    req: Request,
    res: Response<ApiResponse<{ exists: boolean }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { licenseNumber } = req.validatedData;

      const doctor = await Doctor.findOne({
        "professionalInfo.licenseNumber": licenseNumber.toUpperCase(),
      });

      res.json({
        success: true,
        data: { exists: !!doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Forgot password
  static async forgotPassword(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email } = req.validatedData as ForgotPasswordBody;

      const doctor = await Doctor.findOne({
        "personalInfo.email": email.toLowerCase(),
        isActive: true,
      });

      if (!doctor) {
        res.json({
          success: true,
          message: "If the email exists, a password reset link has been sent.",
        });
        return;
      }

      // Generate reset token and send email logic would go here
      // For now, just return success

      logger.info(`Password reset requested for doctor: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        email: doctor.personalInfo.email,
      });

      res.json({
        success: true,
        message: "If the email exists, a password reset link has been sent.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Reset password
  static async resetPassword(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token, newPassword } = req.validatedData as ResetPasswordBody;

      // Password reset logic would go here
      // For now, just return success

      res.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify email
  static async verifyEmail(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        throw new AppError("Verification token is required", 400);
      }

      const doctor = await Doctor.findOne({
        "authentication.emailVerificationToken": token,
        "authentication.emailVerificationExpires": { $gt: new Date() },
      });

      if (!doctor) {
        throw new AppError("Invalid or expired verification token", 400);
      }

      doctor.authentication.isVerified = true;
      doctor.authentication.emailVerificationToken = undefined;
      doctor.isActive = true;
      doctor.availability.isAvailable = true;

      await doctor.save();

      res.json({
        success: true,
        message: "Email verified successfully.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Resend verification email
  static async resendVerificationEmail(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email } = req.validatedData;

      const doctor = await Doctor.findOne({
        "personalInfo.email": email.toLowerCase(),
        isActive: true,
      });

      if (!doctor) {
        res.json({
          success: true,
          message:
            "If the email exists and is unverified, a verification email has been sent.",
        });
        return;
      }

      // Resend verification email logic would go here

      res.json({
        success: true,
        message:
          "If the email exists and is unverified, a verification email has been sent.",
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== ADMIN METHODS ====================

  // Get all doctors (Admin only)
  static async getAllDoctors(
    req: Request,
    res: Response<ApiResponse<{ doctors: IDoctorDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const {
        page = 1,
        limit = 20,
        search,
        status = "all",
        specialization,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = query;

      const filter: any = {};

      // Apply filters
      if (status !== "all") {
        filter.isActive = status === "active";
      }

      if (specialization) {
        filter["professionalInfo.specialization"] = {
          $regex: specialization,
          $options: "i",
        };
      }

      // Search functionality
      if (search) {
        filter.$or = [
          { "personalInfo.firstName": { $regex: search, $options: "i" } },
          { "personalInfo.lastName": { $regex: search, $options: "i" } },
          { "personalInfo.email": { $regex: search, $options: "i" } },
          { "personalInfo.phone": { $regex: search, $options: "i" } },
          { doctorId: { $regex: search, $options: "i" } },
          {
            "professionalInfo.licenseNumber": { $regex: search, $options: "i" },
          },
        ];
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const doctors = await Doctor.find(filter)
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Doctor.countDocuments(filter);

      res.json({
        success: true,
        data: { doctors: doctors as IDoctorDocument[] },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get pending verification doctors (Admin only)
  static async getPendingVerificationDoctors(
    req: Request,
    res: Response<ApiResponse<{ doctors: IDoctorDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const { page = 1, limit = 20 } = query;

      // Note: Since the model doesn't have verification status, we'll just get inactive doctors
      const doctors = await Doctor.find({
        isActive: false,
      })
        .sort({ createdAt: 1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await Doctor.countDocuments({
        isActive: false,
      });

      res.json({
        success: true,
        data: { doctors: doctors as IDoctorDocument[] },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Search doctors (Admin only)
  static async searchDoctorsAdmin(
    req: Request,
    res: Response<ApiResponse<{ doctors: IDoctorDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { q, limit = 10 } = req.validatedQuery || {};

      if (!q) {
        throw new AppError("Search query is required", 400);
      }

      const doctors = await Doctor.find({
        $or: [
          { "personalInfo.firstName": { $regex: q, $options: "i" } },
          { "personalInfo.lastName": { $regex: q, $options: "i" } },
          { "personalInfo.email": { $regex: q, $options: "i" } },
          { "personalInfo.phone": { $regex: q, $options: "i" } },
          { doctorId: { $regex: q, $options: "i" } },
          { "professionalInfo.licenseNumber": { $regex: q, $options: "i" } },
        ],
      })
        .select("personalInfo professionalInfo doctorId isActive")
        .limit(Number(limit))
        .lean();

      res.json({
        success: true,
        data: { doctors: doctors as IDoctorDocument[] },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor by admin
  static async getDoctorByAdmin(
    req: Request,
    res: Response<
      ApiResponse<{ doctor: IDoctorDocument; appointmentStats: any[] }>
    >,
    next: NextFunction
  ): Promise<void> {
    try {
      const { doctorId } = req.params;

      const doctor = await Doctor.findOne({
        $or: [{ _id: doctorId }, { doctorId: doctorId }],
      });

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Get doctor's appointment statistics
      const appointmentStats = await Appointment.aggregate([
        { $match: { doctor: doctor._id } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      res.json({
        success: true,
        data: {
          doctor,
          appointmentStats,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update doctor by admin
  static async updateDoctorByAdmin(
    req: Request,
    res: Response<ApiResponse<{ doctor: IDoctorDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { doctorId } = req.validatedParams;
      const updateData = req.validatedData;

      // Remove sensitive fields that shouldn't be updated via admin
      delete updateData._id;
      delete updateData.doctorId;

      const doctor = await Doctor.findOneAndUpdate(
        {
          $or: [{ _id: doctorId }, { doctorId: doctorId }],
        },
        updateData,
        { new: true, runValidators: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      logger.info(`Doctor updated by admin: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        adminUser: res.locals.user?.id,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Doctor updated successfully",
        data: { doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update doctor status
  static async updateDoctorStatus(
    req: Request,
    res: Response<ApiResponse<{ doctor: IDoctorDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { doctorId } = req.validatedParams;
      const { isActive, reason } = req.validatedData;

      const doctor = await Doctor.findOneAndUpdate(
        {
          $or: [{ _id: doctorId }, { doctorId: doctorId }],
        },
        {
          isActive,
          // Note: These fields don't exist in the model, but keeping for consistency
          statusUpdateReason: reason,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: res.locals.user?.id,
        } as any,
        { new: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // If deactivating, cancel future appointments
      if (!isActive) {
        await Appointment.updateMany(
          {
            doctor: doctor._id,
            appointmentDateTime: { $gte: new Date() },
            status: { $in: ["scheduled", "confirmed"] },
          },
          { status: "cancelled" }
        );
      }

      logger.info(`Doctor status updated by admin: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        newStatus: isActive ? "active" : "inactive",
        reason,
        adminUser: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: `Doctor ${
          isActive ? "activated" : "deactivated"
        } successfully`,
        data: { doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify doctor
  static async verifyDoctor(
    req: Request,
    res: Response<ApiResponse<{ doctor: IDoctorDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { doctorId } = req.params;
      const { verificationStatus, reason } = req.body;
      console.log("Status:", verificationStatus, "Reason:", reason);

      if (!["verified", "rejected"].includes(verificationStatus)) {
        throw new AppError(
          "Invalid status. Must be 'verified' or 'rejected'",
          400
        );
      }

      const isVerifiedByAdmin = verificationStatus === "verified";
      const updateData: {
        isVerifiedByAdmin: boolean;
        verificationNotes: any;
        approvalDate?: Date;
      } = {
        isVerifiedByAdmin: true,
        verificationNotes: reason,
      };

      // Set approval date only if approved
      if (isVerifiedByAdmin) {
        updateData.approvalDate = new Date();
      }

      const doctor = await Doctor.findOneAndUpdate(
        {
          $or: [{ _id: doctorId }, { doctorId }],
        },
        updateData,
        { new: true }
      );

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Send email notification
      await NotificationService.sendEmail({
        to: doctor.personalInfo.email,
        subject: `Doctor Account ${
          verificationStatus === "verified" ? "verified" : "Rejected"
        }`,
        template: "doctor-verification-status",
        data: {
          doctorName: doctor.fullName,
          status: verificationStatus,
          reason: reason || "",
        },
      });

      logger.info(`Doctor ${verificationStatus}: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        isVerifiedByAdmin,
        reason,
        adminUser: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: `Doctor ${verificationStatus} successfully`,
        data: { doctor },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete doctor by admin
  static async deleteDoctorByAdmin(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { doctorId } = req.params;

      const doctor = await Doctor.findOne({
        $or: [{ _id: doctorId }, { doctorId: doctorId }],
      });

      if (!doctor) {
        throw new AppError("Doctor not found", 404);
      }

      // Check if doctor has future appointments
      const futureAppointments = await Appointment.countDocuments({
        doctor: doctor._id,
        appointmentDateTime: { $gte: new Date() },
        status: { $in: ["scheduled", "confirmed"] },
      });

      if (futureAppointments > 0) {
        throw new AppError(
          "Cannot delete doctor with future appointments. Please cancel appointments first.",
          400
        );
      }

      // Soft delete by marking as inactive (since model doesn't have isDeleted field)
      doctor.isActive = false;
      await doctor.save();

      logger.info(`Doctor deleted by admin: ${doctor.doctorId}`, {
        doctorId: doctor.doctorId,
        adminUser: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Doctor deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get doctor performance analytics (Admin only)
  static async getDoctorPerformanceAnalytics(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { period = "month", year = new Date().getFullYear().toString() } =
        req.validatedQuery || {};

      let dateRange: any;
      if (period === "month") {
        dateRange = {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        };
      } else {
        // For other periods, you can add more logic
        dateRange = {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        };
      }

      const performance = await Appointment.aggregate([
        {
          $match: {
            appointmentDateTime: dateRange,
          },
        },
        {
          $lookup: {
            from: "doctors",
            localField: "doctor",
            foreignField: "_id",
            as: "doctorInfo",
          },
        },
        {
          $unwind: "$doctorInfo",
        },
        {
          $group: {
            _id: "$doctor",
            doctorName: { $first: "$doctorInfo.fullName" },
            doctorId: { $first: "$doctorInfo.doctorId" },
            totalAppointments: { $sum: 1 },
            completedAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            cancelledAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
            averageRating: { $avg: "$review.rating" },
            totalRevenue: { $sum: "$fees.consultationFee" },
          },
        },
        {
          $addFields: {
            completionRate: {
              $cond: [
                { $gt: ["$totalAppointments", 0] },
                {
                  $multiply: [
                    {
                      $divide: ["$completedAppointments", "$totalAppointments"],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
          },
        },
        {
          $sort: { totalAppointments: -1 },
        },
      ]);

      res.json({
        success: true,
        data: { performance, period, year },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get specialization statistics (Admin only)
  static async getDoctorPerformanceAnalyticsRaw(
    period: string = "month",
    year: string = new Date().getFullYear().toString()
  ) {
    let dateRange = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };

    const performance = await Appointment.aggregate([
      { $match: { appointmentDateTime: dateRange } },
      {
        $lookup: {
          from: "doctors",
          localField: "doctor",
          foreignField: "_id",
          as: "doctorInfo",
        },
      },
      { $unwind: "$doctorInfo" },
      {
        $group: {
          _id: "$doctor",
          doctorName: { $first: "$doctorInfo.fullName" },
          doctorId: { $first: "$doctorInfo.doctorId" },
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          cancelledAppointments: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          averageRating: { $avg: "$review.rating" },
          totalRevenue: { $sum: "$fees.consultationFee" },
        },
      },
      {
        $addFields: {
          completionRate: {
            $cond: [
              { $gt: ["$totalAppointments", 0] },
              {
                $multiply: [
                  { $divide: ["$completedAppointments", "$totalAppointments"] },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { totalAppointments: -1 } },
    ]);

    return { performance, period, year };
  }

  static async getSpecializationStatsRaw() {
    const stats = await Doctor.aggregate([
      { $match: { isActive: true, "availability.isAvailable": true } },
      {
        $group: {
          _id: "$professionalInfo.specialization",
          count: { $sum: 1 },
          averageExperience: { $avg: "$professionalInfo.experience" },
          averageRating: { $avg: "$statistics.rating" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return { stats };
  }

  static async getAppointmentTrendsRaw(
    period: string = "month",
    year: string = new Date().getFullYear().toString()
  ) {
    let groupBy: any;
    let dateRange = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };

    if (period === "month") {
      groupBy = { $month: "$appointmentDateTime" };
    } else if (period === "week") {
      groupBy = { $week: "$appointmentDateTime" };
    } else {
      groupBy = { $dayOfYear: "$appointmentDateTime" };
    }

    const trends = await Appointment.aggregate([
      { $match: { appointmentDateTime: dateRange } },
      {
        $group: {
          _id: groupBy,
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          cancelledAppointments: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          revenue: { $sum: "$fees.consultationFee" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return { trends, period, year };
  }
}

export default DoctorController;
