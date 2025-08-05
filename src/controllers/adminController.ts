import { NextFunction, Request, Response } from "express";
import User from "../models/User";
import { AppError } from "../types/errors";
import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import notificationService from "../services/notificationService";
import DoctorController from "./doctorController";
import PatientController from "./patientController";
import { Types } from "mongoose";

interface JwtPayload {
  userId: string;
  type: string;
}

class UserController {
  private static generateToken(userId: string, userRole: string): string {
    const payload: JwtPayload = { userId, type: userRole };

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

  private static generateTempPassword(): string {
    return crypto.randomBytes(12).toString("hex");
  }

  // Super Admin registration - only works with correct setup key
  static async registerSuperAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { firstName, lastName, email, phone, password, setupKey } =
        req.body;

      // Check if setup key matches environment variable
      const requiredSetupKey = process.env.SUPER_ADMIN_SETUP_KEY;
      if (!requiredSetupKey) {
        throw new AppError("Super admin registration is not configured", 500);
      }

      if (setupKey !== requiredSetupKey) {
        throw new AppError("Invalid setup key", 401);
      }

      // Check if super admin already exists
      const existingSuperAdmin = await User.findOne({ role: "super_admin" });
      if (existingSuperAdmin) {
        throw new AppError("Super admin already exists", 400);
      }

      // Validate required fields
      if (!firstName || !lastName || !email || !password) {
        throw new AppError("All fields are required", 400);
      }

      // Check if user with email already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new AppError("User with this email already exists", 400);
      }

      // Create super admin
      const userData = {
        firstName,
        lastName,
        email,
        phone,
        password,
        role: "super_admin" as const,
        status: "active" as const,
        isActive: true,
      };

      const superAdmin = await User.createUser(userData);
      const token = UserController.generateToken(
        superAdmin._id.toString(),
        superAdmin.role
      );

      res.json({
        success: true,
        message: "Super admin registered successfully",
        data: {
          user: superAdmin,
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Super Admin creates Admin users
  static async createAdmin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        sendCredentials = true,
      } = req.body;

      // Only super admin can create admin users
      if (res.locals.user?.role !== "super_admin") {
        throw new AppError("Only super admin can create admin users", 403);
      }

      // Validate required fields
      if (!firstName || !lastName || !email) {
        throw new AppError(
          "First name, last name, and email are required",
          400
        );
      }

      // Check if user with email already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new AppError("User with this email already exists", 400);
      }

      // Generate temporary password
      const tempPassword = UserController.generateTempPassword();
      // Create admin user
      const userData = {
        firstName,
        lastName,
        email,
        phone,
        password: tempPassword,
        role: "admin" as const,
        status: "active" as const,
        isActive: true,
        mustChangePassword: true,
        tempPassword: true,
        createdBy: new Types.ObjectId(res.locals.user?.id),
      };
      const admin = await User.createUser(userData);

      // Send credentials via email if requested
      if (sendCredentials) {
        try {
          await notificationService.sendEmail({
            to: email,
            subject: "Admin Account Created - Temporary Credentials",
            template: "admin-account-created",
            data: {
              firstName,
              lastName,
              email,
              tempPassword,
              loginUrl: "http://localhost:5173/auth/login",
              role: admin.role,
            },
          });
        } catch (emailError) {
          console.error("Failed to send email:", emailError);
          // Don't fail the user creation if email fails
        }
      }

      res.json({
        success: true,
        message: "Admin user created successfully",
        data: {
          user: admin,
          tempPassword: sendCredentials ? undefined : tempPassword, // Only return password if not sent via email
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Super Admin or Admin creates Staff users
  static async createStaff(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        role = "staff",
        sendCredentials = true,
      } = req.body;

      // Only super admin and admin can create staff users
      if (!["super_admin", "admin"].includes(res.locals.user?.role || "")) {
        throw new AppError(
          "Only super admin or admin can create staff users",
          403
        );
      }

      // Validate role
      const allowedRoles = ["staff", "doctor", "nurse", "receptionist"];
      if (!allowedRoles.includes(role)) {
        throw new AppError(
          `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
          400
        );
      }

      // Validate required fields
      if (!firstName || !lastName || !email) {
        throw new AppError(
          "First name, last name, and email are required",
          400
        );
      }

      // Check if user with email already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new AppError("User with this email already exists", 400);
      }

      // Generate temporary password
      const tempPassword = UserController.generateTempPassword();

      // Create staff user
      const userData = {
        firstName,
        lastName,
        email,
        phone,
        password: tempPassword,
        role,
        status: "active" as const,
        isActive: true,
        mustChangePassword: true,
        tempPassword: true,
        createdBy: new Types.ObjectId(res.locals.user?.id),
      };

      const staff = await User.createUser(userData);

      // Send credentials via email if requested
      if (sendCredentials) {
        const emailSubject = `${
          role.charAt(0).toUpperCase() + role.slice(1)
        } Account Created`;
        try {
          await notificationService.sendEmail({
            to: email,
            subject: emailSubject,
            template: "staff-account-created",
            data: {
              firstName,
              lastName,
              email,
              role,
              tempPassword,
            },
          });
        } catch (emailError) {
          console.error("Failed to send email:", emailError);
          // Don't fail the user creation if email fails
        }
      }

      res.json({
        success: true,
        message: `${role} user created successfully`,
        data: {
          user: staff,
          tempPassword: sendCredentials ? undefined : tempPassword,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all users (with pagination and filtering)
  static async getAllUsers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // Only super admin and admin can view all users
      if (!["super_admin", "admin"].includes(res.locals.user?.role || "")) {
        throw new AppError("Access denied", 403);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const role = req.query.role as string;
      const status = req.query.status as string;
      const search = req.query.search as string;

      const filter: any = {};

      if (role) filter.role = role;
      if (status) filter.status = status;
      if (search) {
        filter.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;

      const users = await User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "firstName lastName email");

      const total = await User.countDocuments(filter);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update user status (activate/deactivate)
  static async updateUserStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const { status, isActive } = req.body;

      // Only super admin and admin can update user status
      if (!["super_admin", "admin"].includes(res.locals.user?.role || "")) {
        throw new AppError("Access denied", 403);
      }

      // Prevent updating super admin by non-super admin
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        throw new AppError("User not found", 404);
      }

      if (
        targetUser.role === "super_admin" &&
        res.locals.user?.role !== "super_admin"
      ) {
        throw new AppError("Cannot update super admin user", 403);
      }

      // Prevent super admin from deactivating themselves
      if (
        targetUser.role === "super_admin" &&
        targetUser._id.toString() === res.locals.user?.id
      ) {
        throw new AppError("Cannot deactivate yourself", 400);
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { status, isActive },
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        message: "User status updated successfully",
        data: {
          user: updatedUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete user
  static async deleteUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;

      // Only super admin can delete users
      if (res.locals.user?.role !== "super_admin") {
        throw new AppError("Only super admin can delete users", 403);
      }

      const targetUser = await User.findById(userId);
      if (!targetUser) {
        throw new AppError("User not found", 404);
      }

      // Prevent super admin from deleting themselves
      if (targetUser._id.toString() === res.locals.user?.id) {
        throw new AppError("Cannot delete yourself", 400);
      }

      await User.findByIdAndDelete(userId);

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Generate setup key (run this once to get the key)
  static generateSetupKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  // Check if super admin exists
  static async checkSuperAdminExists(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const superAdmin = await User.findOne({ role: "super_admin" });

      res.json({
        success: true,
        data: {
          exists: !!superAdmin,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Regular user registration (staff level)
  static async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { firstName, lastName, email, phone, password, role } = req.body;

      // Prevent direct super_admin or admin registration through regular register
      if (["super_admin", "admin"].includes(role)) {
        throw new AppError(
          "Cannot register super admin or admin through this endpoint",
          400
        );
      }

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new AppError("User with this email already exists", 400);
      }

      const userData = {
        firstName,
        lastName,
        email,
        phone,
        password,
        role: role || "staff",
      };

      const user = await User.createUser(userData);
      const token = UserController.generateToken(
        user._id.toString(),
        user.role
      );

      res.json({
        success: true,
        message: "User registered successfully",
        data: {
          user,
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Login with 2FA support
  static async login(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { email, password, twoFactorCode } = req.body;
      if (!email || !password) {
        throw new AppError("Email and password are required", 400);
      }

      const user = await User.findOne({ email: email.toLowerCase() }).select(
        "+password +twoFactorSecret"
      );

      if (!user || !(await user.comparePassword(password))) {
        throw new AppError("Invalid email or password", 401);
      }

      if (!user.isActive || user.status !== "active") {
        throw new AppError("Account is inactive or suspended", 401);
      }

      // Check if 2FA is enabled
      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          res.json({
            success: false,
            message: "2FA code required",
            requiresTwoFactor: true,
          });
          return;
        }

        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret!,
          encoding: "base32",
          token: twoFactorCode,
          window: 2,
        });

        if (!verified) {
          throw new AppError("Invalid 2FA code", 401);
        }
      }

      // Check if user must change password
      if (user.mustChangePassword) {
        const tempToken = jwt.sign(
          { userId: user._id.toString(), type: "password_change" },
          process.env.JWT_SECRET!,
          { expiresIn: "15m" }
        );

        res.json({
          success: false,
          message: "Password change required",
          requiresPasswordChange: true,
          tempToken,
        });
        return;
      }

      user.lastLogin = new Date();
      await user.save();

      const token = UserController.generateToken(
        user._id.toString(),
        user.role
      );
      const userResponse = user.toJSON();

      res.json({
        success: true,
        message: "Login successful",
        data: {
          user: userResponse,
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Force password change (for temporary passwords)
  static async forcePasswordChange(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { newPassword, tempToken } = req.body;

      if (!newPassword || !tempToken) {
        throw new AppError(
          "New password and temporary token are required",
          400
        );
      }

      const decoded = jwt.verify(tempToken, process.env.JWT_SECRET!) as any;
      if (decoded.type !== "password_change") {
        throw new AppError("Invalid token type", 401);
      }

      const user = await User.findById(decoded.userId).select("+password");
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!user.mustChangePassword) {
        throw new AppError("Password change not required", 400);
      }

      // Update password
      user.password = newPassword;
      user.mustChangePassword = false;
      user.tempPassword = false;
      await user.save();

      const token = UserController.generateToken(
        user._id.toString(),
        user.role
      );

      res.json({
        success: true,
        message: "Password changed successfully",
        data: {
          user: user.toJSON(),
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Enable 2FA
  static async enable2FA(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = res.locals.user?.id;
      const user = await User.findById(userId);

      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (user.twoFactorEnabled) {
        throw new AppError("2FA is already enabled", 400);
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `${user.email}`,
        issuer: process.env.APP_NAME || "Your App",
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

      // Save secret (don't enable yet)
      user.twoFactorSecret = secret.base32;
      await user.save();

      res.json({
        success: true,
        message: "2FA setup initiated",
        data: {
          secret: secret.base32,
          qrCode,
          manualEntryKey: secret.base32,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify and complete 2FA setup
  static async verify2FA(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token } = req.body;
      const userId = res.locals.user?.id;

      if (!token) {
        throw new AppError("2FA token is required", 400);
      }

      const user = await User.findById(userId).select("+twoFactorSecret");
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!user.twoFactorSecret) {
        throw new AppError("2FA setup not initiated", 400);
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token,
        window: 2,
      });

      if (!verified) {
        throw new AppError("Invalid 2FA token", 401);
      }

      // Enable 2FA
      user.twoFactorEnabled = true;
      await user.save();

      res.json({
        success: true,
        message: "2FA enabled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Disable 2FA
  static async disable2FA(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { password, twoFactorCode } = req.body;
      const userId = res.locals.user?.id;

      if (!password || !twoFactorCode) {
        throw new AppError("Password and 2FA code are required", 400);
      }

      const user = await User.findById(userId).select(
        "+password +twoFactorSecret"
      );
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!user.twoFactorEnabled) {
        throw new AppError("2FA is not enabled", 400);
      }

      // Verify password
      if (!(await user.comparePassword(password))) {
        throw new AppError("Invalid password", 401);
      }

      // Verify 2FA code
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: "base32",
        token: twoFactorCode,
        window: 2,
      });

      if (!verified) {
        throw new AppError("Invalid 2FA code", 401);
      }

      // Disable 2FA
      user.twoFactorEnabled = false;
      user.twoFactorSecret = undefined;
      await user.save();

      res.json({
        success: true,
        message: "2FA disabled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get current user profile
  static async getProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = res.locals.user?.id;

      const user = await User.findById(userId).select("-password");
      if (!user) {
        throw new AppError("User not found", 404);
      }

      res.json({
        success: true,
        message: "Profile retrieved successfully",
        data: {
          user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update profile
  static async updateProfile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { firstName, lastName, phone } = req.body;
      const userId = res.locals.user?.id;

      const user = await User.findByIdAndUpdate(
        userId,
        { firstName, lastName, phone },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new AppError("User not found", 404);
      }

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: {
          user,
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Change password
  static async changePassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = res.locals.user?.id;

      if (!currentPassword || !newPassword) {
        throw new AppError(
          "Current password and new password are required",
          400
        );
      }

      const user = await User.findById(userId).select("+password");
      if (!user) {
        throw new AppError("User not found", 404);
      }

      if (!(await user.comparePassword(currentPassword))) {
        throw new AppError("Current password is incorrect", 401);
      }

      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
  static async getDashboardStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
    //   const { period = "month", year = new Date().getFullYear().toString() } =
    //     req.query || {};

      const [
        doctorPerformance,
        specializationStats,
        appointmentTrends,
        // registrationTrends,
        // patientDemographics,
        // patientEngagement,
      ] = await Promise.all([
        // DoctorController.getDoctorPerformanceAnalyticsRaw(
        //   period as string,
        //   year as string
        // ),
        DoctorController.getSpecializationStatsRaw(),
        // DoctorController.getAppointmentTrendsRaw(
        //   period as string,
        //   year as string
        // ),
        // PatientController.getRegistrationTrendsRaw(
        //   period as string,
        //   year as string
        // ),
        PatientController.getPatientDemographicsRaw(),
        PatientController.getPatientEngagementRaw(),
      ]);

      res.json({
        success: true,
        data: {
          doctorPerformance,
          specializationStats,
          appointmentTrends,
        //   registrationTrends,
        //   patientDemographics,
        //   patientEngagement,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default UserController;
