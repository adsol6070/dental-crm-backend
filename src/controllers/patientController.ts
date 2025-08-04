// controllers/patientController.ts
import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import Patient, { PatientDocument } from "../models/Patient";
import Appointment from "../models/Appointment";
import NotificationService from "../services/notificationService";
import logger from "../utils/logger";
import { AppError } from "../types/errors";
// import { generatePatientReport } from "../utils/reportGenerator";

// Types for request bodies
interface RegisterPatientBody {
  personalInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: "male" | "female" | "other";
    bloodGroup?: string;
  };
  contactInfo: {
    email: string;
    phone: string;
    alternatePhone?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
  };
  medicalInfo?: {
    allergies?: string[];
    chronicConditions?: string[];
    currentMedications?: string[];
    emergencyContact?: {
      name?: string;
      relationship?: string;
      phone?: string;
    };
  };
  preferences?: {
    preferredLanguage?: string;
    communicationMethod?: "email" | "sms" | "whatsapp" | "phone";
    reminderSettings?: {
      enableReminders?: boolean;
      reminderTime?: number;
    };
  };
  authentication: {
    password: string;
  };
  registrationSource:
    | "website"
    | "mobile-app"
    | "whatsapp"
    | "phone-call"
    | "in-person"
    | "referral";
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

// Response types
interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    patient: {
      id: string;
      patientId: string;
      fullName: string;
      email: string;
      isVerified: boolean;
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
  patientId: string;
  type: string;
}

class PatientController {
  // Generate JWT token
  private static generateToken(patientId: string): string {
    const payload: JwtPayload = { patientId, type: "patient" };

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

  // Register new patient
  static async registerPatient(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = req.validatedData as RegisterPatientBody;

      // Check if patient already exists
      const existingPatient = await Patient.findOne({
        $or: [
          { "contactInfo.email": data.contactInfo.email.toLowerCase() },
          { "contactInfo.phone": data.contactInfo.phone },
        ],
      });

      if (existingPatient) {
        throw new AppError(
          "Patient with this email or phone already exists",
          409
        );
      }

      // Create new patient
      const patient = new Patient({
        personalInfo: {
          firstName: data.personalInfo.firstName.trim(),
          lastName: data.personalInfo.lastName.trim(),
          dateOfBirth: new Date(data.personalInfo.dateOfBirth),
          gender: data.personalInfo.gender,
          bloodGroup: data.personalInfo.bloodGroup,
        },
        contactInfo: {
          email: data.contactInfo.email.toLowerCase().trim(),
          phone: data.contactInfo.phone.trim(),
          alternatePhone: data.contactInfo.alternatePhone?.trim(),
          address: data.contactInfo.address || {},
        },
        medicalInfo: data.medicalInfo,
        authentication: {
          password: data.authentication.password,
          verificationToken: crypto.randomBytes(32).toString("hex"),
          isVerified: false,
        },
        registrationSource: data.registrationSource,
        preferences: {
          preferredLanguage: data.preferences?.preferredLanguage || "english",
          communicationMethod: data.preferences?.communicationMethod || "email",
          reminderSettings: {
            enableReminders:
              data.preferences?.reminderSettings?.enableReminders ?? true,
            reminderTime:
              data.preferences?.reminderSettings?.reminderTime || 24,
          },
        },
      });

      await patient.save();

      // Send verification email
      await PatientController.sendVerificationEmail(patient);

      // Generate token
      const token = PatientController.generateToken(patient._id.toString());

      logger.info(`New patient registered: ${patient.patientId}`, {
        patientId: patient.patientId,
        email: patient.contactInfo.email,
        registrationSource: data.registrationSource,
      });

      res.status(201).json({
        success: true,
        message:
          "Patient registered successfully. Please check your email for verification.",
        data: {
          patient: {
            id: patient._id.toString(),
            patientId: patient.patientId,
            fullName: patient.fullName,
            email: patient.contactInfo.email,
            isVerified: patient.authentication?.isVerified || false,
          },
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Patient login
  static async loginPatient(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password } = req.validatedData as LoginBody;

      // Find patient by email
      const patient = await Patient.findOne({
        "contactInfo.email": email.toLowerCase(),
        isActive: true,
      }).select("+authentication.password");

      if (!patient || !(await patient.comparePassword(password))) {
        throw new AppError("Invalid email or password", 401);
      }

      // Check if account is verified
      if (!patient.authentication?.isVerified) {
        throw new AppError("Please verify your email before logging in", 401);
      }

      // Generate token
      const token = PatientController.generateToken(patient._id.toString());

      // Update last visit
      if (patient.statistics) {
        patient.statistics.lastVisit = new Date();
      }
      await patient.save();

      logger.info(`Patient logged in: ${patient.patientId}`, {
        patientId: patient.patientId,
        email: patient.contactInfo.email,
      });

      res.json({
        success: true,
        message: "Login successful",
        data: {
          patient: {
            id: patient._id.toString(),
            patientId: patient.patientId,
            fullName: patient.fullName,
            email: patient.contactInfo.email,
            isVerified: patient.authentication?.isVerified || false,
          },
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient profile
  static async getPatientProfile(
    req: Request,
    res: Response<ApiResponse<{ patient: PatientDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const patient = await Patient.findById(res.locals.patient?.id);

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      res.json({
        success: true,
        data: { patient },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update patient profile
  static async updatePatientProfile(
    req: Request,
    res: Response<ApiResponse<{ patient: PatientDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(`Patient profile updated: ${patient.patientId}`, {
        patientId: patient.patientId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: { patient },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update patient preferences
  static async updatePatientPreferences(
    req: Request,
    res: Response<ApiResponse<{ preferences: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        { preferences: updateData },
        { new: true, runValidators: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(`Patient preferences updated: ${patient.patientId}`, {
        patientId: patient.patientId,
        preferences: updateData,
      });

      res.json({
        success: true,
        message: "Preferences updated successfully",
        data: { preferences: patient.preferences },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update medical information
  static async updateMedicalInfo(
    req: Request,
    res: Response<ApiResponse<{ medicalInfo: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        { medicalInfo: updateData },
        { new: true, runValidators: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(`Patient medical info updated: ${patient.patientId}`, {
        patientId: patient.patientId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Medical information updated successfully",
        data: { medicalInfo: patient.medicalInfo },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update contact information
  static async updateContactInfo(
    req: Request,
    res: Response<ApiResponse<{ contactInfo: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      // Check if phone number is already in use by another patient
      if (updateData.phone) {
        const existingPatient = await Patient.findOne({
          "contactInfo.phone": updateData.phone,
          _id: { $ne: res.locals.patient?.id },
        });

        if (existingPatient) {
          throw new AppError(
            "Phone number already in use by another patient",
            409
          );
        }
      }

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        { contactInfo: updateData },
        { new: true, runValidators: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(`Patient contact info updated: ${patient.patientId}`, {
        patientId: patient.patientId,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Contact information updated successfully",
        data: { contactInfo: patient.contactInfo },
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

      const patient = await Patient.findById(res.locals.patient?.id).select(
        "+authentication.password"
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Verify current password
      if (!(await patient.comparePassword(currentPassword))) {
        throw new AppError("Current password is incorrect", 400);
      }

      // Update password
      if (patient.authentication) {
        patient.authentication.password = newPassword;
        await patient.save();
      }

      logger.info(`Password changed for patient: ${patient.patientId}`, {
        patientId: patient.patientId,
      });

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient appointments
  static async getPatientAppointments(
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

      const filter: any = { patient: res.locals.patient?.id };

      if (status) filter.status = status;
      if (startDate || endDate) {
        filter.appointmentDateTime = {};
        if (startDate) filter.appointmentDateTime.$gte = new Date(startDate);
        if (endDate) filter.appointmentDateTime.$lte = new Date(endDate);
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const appointments = await Appointment.find(filter)
        .populate("doctor", "personalInfo professionalInfo doctorId")
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

  // Get upcoming appointments
  static async getUpcomingAppointments(
    req: Request,
    res: Response<ApiResponse<{ appointments: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const now = new Date();

      const appointments = await Appointment.find({
        patient: res.locals.patient?.id,
        appointmentDateTime: { $gte: now },
        status: { $in: ["scheduled", "confirmed"] },
      })
        .populate("doctor", "personalInfo professionalInfo doctorId")
        .sort({ appointmentDateTime: 1 })
        .limit(5)
        .lean();

      res.json({
        success: true,
        data: { appointments },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get appointment history
  static async getAppointmentHistory(
    req: Request,
    res: Response<ApiResponse<{ appointments: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { page = 1, limit = 10, year } = req.validatedQuery || {};

      const filter: any = {
        patient: res.locals.patient?.id,
        status: { $in: ["completed", "cancelled", "no-show"] },
      };

      if (year) {
        const startDate = new Date(`${year}-01-01`);
        const endDate = new Date(`${year}-12-31`);
        filter.appointmentDateTime = { $gte: startDate, $lte: endDate };
      }

      const appointments = await Appointment.find(filter)
        .populate("doctor", "personalInfo professionalInfo doctorId")
        .sort({ appointmentDateTime: -1 })
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
        patient: res.locals.patient?.id,
      }).populate("doctor", "personalInfo professionalInfo doctorId fees");

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

  // Get patient dashboard data
  static async getDashboardData(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const patientId = res.locals.patient?.id;

      // Get upcoming appointments
      const upcomingAppointments = await Appointment.find({
        patient: patientId,
        appointmentStartTime: { $gte: new Date() },
        status: { $in: ["scheduled", "confirmed"] },
      })
        .populate("doctor", "personalInfo professionalInfo")
        .sort({ appointmentStartTime: 1 })
        .limit(3);

      // Get recent appointments
      const recentAppointments = await Appointment.find({
        patient: patientId,
        status: "completed",
      })
        .populate("doctor", "personalInfo professionalInfo")
        .sort({ appointmentStartTime: -1 })
        .limit(3);

      // Get patient statistics
      const patient = await Patient.findById(patientId);

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Get monthly appointment count
      const currentYear = new Date().getFullYear();
      const monthlyStats = await Appointment.aggregate([
        {
          $match: {
            patient: patient._id,
            appointmentStartTime: {
              $gte: new Date(`${currentYear}-01-01`),
              $lte: new Date(`${currentYear}-12-31`),
            },
          },
        },
        {
          $group: {
            _id: { $month: "$appointmentStartTime" },
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
          upcomingAppointments,
          recentAppointments,
          statistics: patient.statistics,
          monthlyStats,
          personalInfo: patient.personalInfo,
          preferences: patient.preferences,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient statistics
  static async getPatientStatistics(
    req: Request,
    res: Response<ApiResponse<{ statistics: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const patientId = res.locals.patient?.id;

      const stats = await Appointment.aggregate([
        { $match: { patient: patientId } },
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

      // Calculate rates
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

      res.json({
        success: true,
        data: { statistics },
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

      const patient = await Patient.findOne({
        "contactInfo.email": email.toLowerCase(),
        isActive: true,
      });

      if (!patient) {
        // Don't reveal whether email exists or not
        res.json({
          success: true,
          message: "If the email exists, a password reset link has been sent.",
        });
        return;
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
      if (patient.authentication) {
        patient.authentication.passwordResetToken = resetToken;
        patient.authentication.passwordResetExpires = new Date(
          Date.now() + 30 * 60 * 1000
        ); // 30 minutes
      }

      await patient.save();

      // Send reset email
      await NotificationService.sendEmail({
        to: patient.contactInfo.email,
        subject: "Password Reset Request",
        template: "password-reset",
        data: {
          patientName: patient.fullName,
          resetUrl: `${process.env.FRONTEND_URL}/reset-password/${resetToken}`,
          expiryTime: "30 minutes",
        },
      });

      logger.info(
        `Password reset requested for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
          email: patient.contactInfo.email,
        }
      );

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

      const patient = await Patient.findOne({
        "authentication.passwordResetToken": token,
        "authentication.passwordResetExpires": { $gt: new Date() },
        isActive: true,
      });

      if (!patient) {
        throw new AppError("Invalid or expired reset token", 400);
      }

      // Update password and clear reset token
      if (patient.authentication) {
        patient.authentication.password = newPassword;
        patient.authentication.passwordResetToken = undefined;
        patient.authentication.passwordResetExpires = undefined;
      }

      await patient.save();

      logger.info(
        `Password reset completed for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
        }
      );

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
      const { token } = req.validatedParams;

      const patient = await Patient.findOne({
        "authentication.verificationToken": token,
        isActive: true,
      });

      if (!patient) {
        throw new AppError("Invalid verification token", 400);
      }

      // Mark as verified
      if (patient.authentication) {
        patient.authentication.isVerified = true;
        patient.authentication.verificationToken = undefined;
      }

      await patient.save();

      logger.info(`Email verified for patient: ${patient.patientId}`, {
        patientId: patient.patientId,
        email: patient.contactInfo.email,
      });

      res.json({
        success: true,
        message: "Email verified successfully",
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

      const patient = await Patient.findOne({
        "contactInfo.email": email.toLowerCase(),
        "authentication.isVerified": false,
        isActive: true,
      });

      if (!patient) {
        res.json({
          success: true,
          message:
            "If the email exists and is unverified, a verification email has been sent.",
        });
        return;
      }

      // Generate new verification token
      if (patient.authentication) {
        patient.authentication.verificationToken = crypto
          .randomBytes(32)
          .toString("hex");
      }
      await patient.save();

      // Send verification email
      await PatientController.sendVerificationEmail(patient);

      logger.info(
        `Verification email resent for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
          email: patient.contactInfo.email,
        }
      );

      res.json({
        success: true,
        message:
          "If the email exists and is unverified, a verification email has been sent.",
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

      const patient = await Patient.findOne({
        "contactInfo.email": email.toLowerCase(),
      });

      res.json({
        success: true,
        data: { exists: !!patient },
      });
    } catch (error) {
      next(error);
    }
  }

  // Check if phone exists
  static async checkPhoneExists(
    req: Request,
    res: Response<ApiResponse<{ exists: boolean }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { phone } = req.validatedData;

      const patient = await Patient.findOne({
        "contactInfo.phone": phone,
      });

      res.json({
        success: true,
        data: { exists: !!patient },
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

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        { profilePicture: req.file.path },
        { new: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(
        `Profile picture uploaded for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
          filename: req.file.filename,
        }
      );

      res.json({
        success: true,
        message: "Profile picture uploaded successfully",
        data: { profilePicture: req.file.path },
      });
    } catch (error) {
      next(error);
    }
  }

  // Upload medical documents
  static async uploadMedicalDocuments(
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

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        { $push: { medicalDocuments: { $each: documentPaths } } },
        { new: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(
        `Medical documents uploaded for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
          documentCount: files.length,
        }
      );

      res.json({
        success: true,
        message: "Medical documents uploaded successfully",
        data: { documents: documentPaths },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get medical records
  static async getMedicalRecords(
    req: Request,
    res: Response<ApiResponse<{ medicalRecords: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    console.log("Request Patient Id:", res.locals.patient?.id);
    try {
      const appointments = await Appointment.find({
        patient: res.locals.patient?.id,
        status: "completed",
        "consultation.diagnosis": { $exists: true, $ne: "" },
      })
        .populate("doctor", "personalInfo professionalInfo")
        .sort({ appointmentDateTime: -1 })
        .select("appointmentDateTime consultation doctor appointmentId")
        .lean();

      res.json({
        success: true,
        data: { medicalRecords: appointments },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get prescriptions
  static async getPrescriptions(
    req: Request,
    res: Response<ApiResponse<{ prescriptions: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const appointments = await Appointment.find({
        patient: res.locals.patient?.id,
        status: "completed",
        "consultation.prescription": { $exists: true, $ne: "" },
      })
        .populate("doctor", "personalInfo professionalInfo")
        .sort({ appointmentDateTime: -1 })
        .select(
          "appointmentDateTime consultation.prescription doctor appointmentId"
        )
        .lean();

      res.json({
        success: true,
        data: { prescriptions: appointments },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get lab reports
  static async getLabReports(
    req: Request,
    res: Response<ApiResponse<{ labReports: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      // This would typically integrate with a lab system
      // For now, returning empty array as placeholder
      res.json({
        success: true,
        data: { labReports: [] },
        message: "Lab reports integration coming soon",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get notification preferences
  static async getNotificationPreferences(
    req: Request,
    res: Response<ApiResponse<{ preferences: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const patient = await Patient.findById(res.locals.patient?.id).select(
        "preferences.communicationMethod preferences.reminderSettings"
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      res.json({
        success: true,
        data: { preferences: patient.preferences },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update notification preferences
  static async updateNotificationPreferences(
    req: Request,
    res: Response<ApiResponse<{ preferences: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const updateData = req.validatedData;

      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        { preferences: updateData },
        { new: true, runValidators: true }
      ).select("preferences");

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(
        `Notification preferences updated for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
          preferences: updateData,
        }
      );

      res.json({
        success: true,
        message: "Notification preferences updated successfully",
        data: { preferences: patient.preferences },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get notification history
  static async getNotificationHistory(
    req: Request,
    res: Response<ApiResponse<{ notifications: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      // This would typically come from a notifications collection
      // For now, using appointment-based notifications
      const appointments = await Appointment.find({
        patient: res.locals.patient?.id,
        remindersSent: { $gt: 0 },
      })
        .sort({ lastReminderSent: -1 })
        .select("appointmentId lastReminderSent remindersSent status")
        .limit(20);

      const notifications = appointments.map((apt) => ({
        type: "appointment_reminder",
        appointmentId: apt.appointmentId,
        sentAt: apt.lastReminderSent,
        count: apt.remindersSent,
        status: "sent",
      }));

      res.json({
        success: true,
        data: { notifications },
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
      const patient = await Patient.findByIdAndUpdate(
        res.locals.patient?.id,
        {
          isActive: false,
          deactivatedAt: new Date(),
        },
        { new: true }
      );

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Cancel all future appointments
      await Appointment.updateMany(
        {
          patient: res.locals.patient?.id,
          appointmentDateTime: { $gte: new Date() },
          status: { $in: ["scheduled", "confirmed"] },
        },
        { status: "cancelled" }
      );

      logger.info(`Patient account deactivated: ${patient.patientId}`, {
        patientId: patient.patientId,
      });

      res.json({
        success: true,
        message: "Account deactivated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Request account deletion
  static async requestAccountDeletion(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const patient = await Patient.findById(res.locals.patient?.id);

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Mark for deletion (actual deletion would be handled by admin)
      (patient as any).deletionRequested = true;
      (patient as any).deletionRequestedAt = new Date();
      await patient.save();

      // Send notification to admin
      await NotificationService.sendEmail({
        to: process.env.ADMIN_EMAIL!,
        subject: "Patient Account Deletion Request",
        template: "account-deletion-request",
        data: {
          patientName: patient.fullName,
          patientId: patient.patientId,
          email: patient.contactInfo.email,
          requestDate: new Date().toISOString(),
        },
      });

      logger.info(
        `Account deletion requested for patient: ${patient.patientId}`,
        {
          patientId: patient.patientId,
        }
      );

      res.json({
        success: true,
        message:
          "Account deletion request submitted. An admin will review your request.",
      });
    } catch (error) {
      next(error);
    }
  }

  // Export patient data
  static async exportPatientData(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const patient = await Patient.findById(res.locals.patient?.id);
      const appointments = await Appointment.find({
        patient: res.locals.patient?.id,
      }).populate("doctor", "personalInfo professionalInfo");

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      const exportData = {
        personalInfo: patient.personalInfo,
        contactInfo: patient.contactInfo,
        medicalInfo: patient.medicalInfo,
        preferences: patient.preferences,
        statistics: patient.statistics,
        appointments: appointments.map((apt) => ({
          appointmentId: apt.appointmentId,
          doctorName: (apt.doctor as any)?.fullName,
          appointmentDateTime: apt.appointmentStartTime,
          status: apt.status,
          appointmentType: apt.appointmentType,
          symptoms: apt.symptoms,
          notes: apt.notes,
          consultation: apt.consultation,
        })),
        exportedAt: new Date().toISOString(),
      };

      logger.info(`Data export requested for patient: ${patient.patientId}`, {
        patientId: patient.patientId,
      });

      res.json({
        success: true,
        message: "Patient data exported successfully",
        data: exportData,
      });
    } catch (error) {
      next(error);
    }
  }

  // Helper method to send verification email
  private static async sendVerificationEmail(
    patient: PatientDocument
  ): Promise<void> {
    try {
      await NotificationService.sendEmail({
        to: patient.contactInfo.email,
        subject: "Email Verification Required",
        template: "email-verification",
        data: {
          patientName: patient.fullName,
          verificationUrl: `${process.env.FRONTEND_URL}/verify-email/${patient.authentication?.verificationToken}`,
        },
      });
    } catch (error) {
      logger.error("Failed to send verification email:", error);
    }
  }

  // ==================== ADMIN METHODS ====================

  // Get all patients (Admin only)
  static async getAllPatients(
    req: Request,
    res: Response<ApiResponse<{ patients: PatientDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.validatedQuery || {};
      const {
        page = 1,
        limit = 20,
        search,
        status = "all",
        registrationSource,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = query;

      const filter: any = {};

      // Apply filters
      if (status !== "all") {
        filter.isActive = status === "active";
      }

      if (registrationSource) {
        filter.registrationSource = registrationSource;
      }

      // Search functionality
      if (search) {
        filter.$or = [
          { "personalInfo.firstName": { $regex: search, $options: "i" } },
          { "personalInfo.lastName": { $regex: search, $options: "i" } },
          { "contactInfo.email": { $regex: search, $options: "i" } },
          { "contactInfo.phone": { $regex: search, $options: "i" } },
          { patientId: { $regex: search, $options: "i" } },
        ];
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const patients = await Patient.find(filter)
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .select("-authentication.password")
        .lean();

      const total = await Patient.countDocuments(filter);

      res.json({
        success: true,
        data: { patients: patients as PatientDocument[] },
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

  // Search patients (Admin only)
  static async searchPatients(
    req: Request,
    res: Response<ApiResponse<{ patients: PatientDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { q, limit = 10 } = req.validatedQuery || {};

      if (!q) {
        throw new AppError("Search query is required", 400);
      }

      const patients = await Patient.find({
        $or: [
          { "personalInfo.firstName": { $regex: q, $options: "i" } },
          { "personalInfo.lastName": { $regex: q, $options: "i" } },
          { "contactInfo.email": { $regex: q, $options: "i" } },
          { "contactInfo.phone": { $regex: q, $options: "i" } },
          { patientId: { $regex: q, $options: "i" } },
        ],
      })
        .select("personalInfo contactInfo patientId statistics")
        .limit(Number(limit))
        .lean();

      res.json({
        success: true,
        data: { patients: patients as PatientDocument[] },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient by admin
  static async getPatientByAdmin(
    req: Request,
    res: Response<
      ApiResponse<{ patient: PatientDocument; appointmentStats: any[] }>
    >,
    next: NextFunction
  ): Promise<void> {
    try {
      const { patientId } = req.params;

      const patient = await Patient.findOne({
        $or: [{ _id: patientId }, { patientId: patientId }],
      }).select("-authentication.password");

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Get patient's appointment statistics
      const appointmentStats = await Appointment.aggregate([
        { $match: { patient: patient._id } },
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
          patient,
          appointmentStats,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update patient by admin
  static async updatePatientByAdmin(
    req: Request,
    res: Response<ApiResponse<{ patient: PatientDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { patientId } = req.params;
      const updateData = req.validatedData;

      // Remove sensitive fields that shouldn't be updated via admin
      delete updateData.authentication;
      delete updateData._id;
      delete updateData.patientId;

      const patient = await Patient.findOneAndUpdate(
        {
          $or: [{ _id: patientId }, { patientId: patientId }],
        },
        updateData,
        { new: true, runValidators: true }
      ).select("-authentication.password");

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      logger.info(`Patient updated by admin: ${patient.patientId}`, {
        patientId: patient.patientId,
        adminUser: res.locals.user?.id,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: "Patient updated successfully",
        data: { patient },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update patient status
  static async updatePatientStatus(
    req: Request,
    res: Response<ApiResponse<{ patient: PatientDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { patientId } = req.params;
      const { isActive, reason } = req.body;

      const patient = await Patient.findOneAndUpdate(
        {
          $or: [{ _id: patientId }, { patientId: patientId }],
        },
        {
          isActive,
          statusUpdateReason: reason,
          statusUpdatedAt: new Date(),
          statusUpdatedBy: res.locals.user?.id,
        } as any,
        { new: true }
      ).select("-authentication.password");

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // If deactivating, cancel future appointments
      if (!isActive) {
        await Appointment.updateMany(
          {
            patient: patient._id,
            appointmentDateTime: { $gte: new Date() },
            status: { $in: ["scheduled", "confirmed"] },
          },
          { status: "cancelled" }
        );
      }

      logger.info(`Patient status updated by admin: ${patient.patientId}`, {
        patientId: patient.patientId,
        newStatus: isActive ? "active" : "inactive",
        reason,
        adminUser: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: `Patient ${
          isActive ? "activated" : "deactivated"
        } successfully`,
        data: { patient },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete patient by admin
  static async deletePatientByAdmin(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { patientId } = req.params;

      const patient = await Patient.findOne({
        $or: [{ _id: patientId }, { patientId: patientId }],
      });

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }

      // Check if patient has future appointments
      const futureAppointments = await Appointment.countDocuments({
        patient: patient._id,
        appointmentDateTime: { $gte: new Date() },
        status: { $in: ["scheduled", "confirmed"] },
      });

      if (futureAppointments > 0) {
        throw new AppError(
          "Cannot delete patient with future appointments. Please cancel appointments first.",
          400
        );
      }

      // Soft delete by marking as deleted
      (patient as any).isDeleted = true;
      (patient as any).deletedAt = new Date();
      (patient as any).deletedBy = res.locals.user?.id;
      (patient as any).isActive = false;

      await patient.save();

      logger.info(`Patient deleted by admin: ${patient.patientId}`, {
        patientId: patient.patientId,
        adminUser: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Patient deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get registration trends (Admin only)
  static async getRegistrationTrends(
    req: Request,
    res: Response<ApiResponse<{ trends: any[]; period: string; year: string }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { period = "month", year = new Date().getFullYear().toString() } =
        req.validatedQuery || {};

      let groupBy: any;
      let dateRange: any;

      if (period === "month") {
        groupBy = { $month: "$createdAt" };
        dateRange = {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        };
      } else if (period === "week") {
        groupBy = { $week: "$createdAt" };
        dateRange = {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        };
      } else {
        groupBy = { $dayOfYear: "$createdAt" };
        dateRange = {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        };
      }

      const trends = await Patient.aggregate([
        {
          $match: {
            createdAt: dateRange,
          },
        },
        {
          $group: {
            _id: groupBy,
            count: { $sum: 1 },
            sources: {
              $push: "$registrationSource",
            },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      res.json({
        success: true,
        data: { trends, period, year },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient demographics (Admin only)
  static async getPatientDemographics(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const demographics = await Patient.aggregate([
        {
          $group: {
            _id: null,
            totalPatients: { $sum: 1 },
            activePatients: {
              $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
            },
            verifiedPatients: {
              $sum: {
                $cond: [{ $eq: ["$authentication.isVerified", true] }, 1, 0],
              },
            },
            genderDistribution: {
              $push: "$personalInfo.gender",
            },
            ageGroups: {
              $push: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $lt: [
                          {
                            $divide: [
                              {
                                $subtract: [
                                  new Date(),
                                  "$personalInfo.dateOfBirth",
                                ],
                              },
                              1000 * 60 * 60 * 24 * 365,
                            ],
                          },
                          18,
                        ],
                      },
                      then: "Under 18",
                    },
                    {
                      case: {
                        $lt: [
                          {
                            $divide: [
                              {
                                $subtract: [
                                  new Date(),
                                  "$personalInfo.dateOfBirth",
                                ],
                              },
                              1000 * 60 * 60 * 24 * 365,
                            ],
                          },
                          30,
                        ],
                      },
                      then: "18-29",
                    },
                    {
                      case: {
                        $lt: [
                          {
                            $divide: [
                              {
                                $subtract: [
                                  new Date(),
                                  "$personalInfo.dateOfBirth",
                                ],
                              },
                              1000 * 60 * 60 * 24 * 365,
                            ],
                          },
                          50,
                        ],
                      },
                      then: "30-49",
                    },
                    {
                      case: {
                        $lt: [
                          {
                            $divide: [
                              {
                                $subtract: [
                                  new Date(),
                                  "$personalInfo.dateOfBirth",
                                ],
                              },
                              1000 * 60 * 60 * 24 * 365,
                            ],
                          },
                          65,
                        ],
                      },
                      then: "50-64",
                    },
                  ],
                  default: "65+",
                },
              },
            },
            registrationSources: {
              $push: "$registrationSource",
            },
          },
        },
      ]);

      // Process the results to get counts
      const result = demographics[0] || {
        totalPatients: 0,
        activePatients: 0,
        verifiedPatients: 0,
        genderDistribution: [],
        ageGroups: [],
        registrationSources: [],
      };

      // Count gender distribution
      const genderCounts = result.genderDistribution.reduce(
        (acc: any, gender: string) => {
          acc[gender] = (acc[gender] || 0) + 1;
          return acc;
        },
        {}
      );

      // Count age groups
      const ageCounts = result.ageGroups.reduce((acc: any, age: string) => {
        acc[age] = (acc[age] || 0) + 1;
        return acc;
      }, {});

      // Count registration sources
      const sourceCounts = result.registrationSources.reduce(
        (acc: any, source: string) => {
          acc[source] = (acc[source] || 0) + 1;
          return acc;
        },
        {}
      );

      res.json({
        success: true,
        data: {
          totalPatients: result.totalPatients,
          activePatients: result.activePatients,
          verifiedPatients: result.verifiedPatients,
          genderDistribution: genderCounts,
          ageDistribution: ageCounts,
          registrationSources: sourceCounts,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get patient engagement (Admin only)
  static async getPatientEngagement(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const engagement = await Patient.aggregate([
        {
          $lookup: {
            from: "appointments",
            localField: "_id",
            foreignField: "patient",
            as: "appointments",
          },
        },
        {
          $addFields: {
            appointmentCount: { $size: "$appointments" },
            lastAppointment: { $max: "$appointments.appointmentDateTime" },
            completedAppointments: {
              $size: {
                $filter: {
                  input: "$appointments",
                  cond: { $eq: ["$this.status", "completed"] },
                },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalPatients: { $sum: 1 },
            patientsWithAppointments: {
              $sum: { $cond: [{ $gt: ["$appointmentCount", 0] }, 1, 0] },
            },
            averageAppointmentsPerPatient: { $avg: "$appointmentCount" },
            activePatients: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$lastAppointment", null] },
                      {
                        $gte: [
                          "$lastAppointment",
                          new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
                        ],
                      },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            patientsByAppointmentCount: {
              $push: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ["$appointmentCount", 0] },
                      then: "No appointments",
                    },
                    {
                      case: { $lte: ["$appointmentCount", 3] },
                      then: "1-3 appointments",
                    },
                    {
                      case: { $lte: ["$appointmentCount", 10] },
                      then: "4-10 appointments",
                    },
                  ],
                  default: "10+ appointments",
                },
              },
            },
          },
        },
      ]);

      const result = engagement[0] || {
        totalPatients: 0,
        patientsWithAppointments: 0,
        averageAppointmentsPerPatient: 0,
        activePatients: 0,
        patientsByAppointmentCount: [],
      };

      // Count appointment distribution
      const appointmentDistribution = result.patientsByAppointmentCount.reduce(
        (acc: any, category: string) => {
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        },
        {}
      );

      res.json({
        success: true,
        data: {
          totalPatients: result.totalPatients,
          patientsWithAppointments: result.patientsWithAppointments,
          engagementRate:
            result.totalPatients > 0
              ? (
                  (result.patientsWithAppointments / result.totalPatients) *
                  100
                ).toFixed(1)
              : "0",
          averageAppointmentsPerPatient:
            Math.round(result.averageAppointmentsPerPatient * 100) / 100,
          activePatients: result.activePatients,
          appointmentDistribution,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default PatientController;
