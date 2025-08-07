import mongoose, { Document, Schema, Model, Types } from "mongoose";
import bcrypt from "bcryptjs";

// Enum for days of the week
export enum DayOfWeek {
  MONDAY = "monday",
  TUESDAY = "tuesday",
  WEDNESDAY = "wednesday",
  THURSDAY = "thursday",
  FRIDAY = "friday",
  SATURDAY = "saturday",
  SUNDAY = "sunday",
}

// Interface for personal information
export interface IPersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// Interface for professional information
export interface IProfessionalInfo {
  specialization: string;
  qualifications: string[];
  experience: number; // years
  licenseNumber: string;
  department?: string;
}

// Interface for working day schedule
export interface IWorkingDay {
  day: DayOfWeek;
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  isWorking: boolean;
}

// Interface for break times
export interface IBreakTime {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  title?: string;
}

// Interface for doctor schedule
export interface ISchedule {
  workingDays: IWorkingDay[];
  slotDuration: number; // minutes
  breakTimes: IBreakTime[];
}

export interface IUnavailableDate {
  id?: string;
  date: string; // YYYY-MM-DD format
  reason: string;
  type: "full-day" | "half-day" | "morning" | "afternoon";
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface for availability settings
export interface IAvailability {
  isAvailable: boolean;
  unavailableDates: IUnavailableDate[];
  maxAppointmentsPerDay: number;
}

// Interface for fee structure
export interface IFees {
  consultationFee: number;
  followUpFee?: number;
  emergencyFee?: number;
}

// Interface for doctor statistics
export interface IStatistics {
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments?: number;
  rating: number;
  reviewCount: number;
}

// Interface for authentication (similar to Patient)
export interface IAuthentication {
  password?: string;
  isVerified?: boolean;
  verificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  lastPasswordChange?: Date;
}

// Main Doctor interface
export interface IDoctor {
  doctorId: string;
  personalInfo: IPersonalInfo;
  professionalInfo: IProfessionalInfo;
  schedule: ISchedule;
  availability: IAvailability;
  fees: IFees;
  statistics: IStatistics;
  authentication: IAuthentication; // Added authentication
  isActive: boolean;
  isVerifiedByAdmin?: boolean; // Additional verification by admin
  verificationNotes?: string; // Admin verification notes
  registrationDate?: Date; // When doctor registered
  approvalDate?: Date; // When admin approved
  createdAt: Date;
  updatedAt: Date;
}

// Interface for Doctor document (includes Mongoose document methods)
export interface IDoctorDocument extends IDoctor, Document {
  _id: Types.ObjectId;
  fullName: string; // Virtual property
  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): string;
  generateEmailVerificationToken(): string;
  isAccountFullyVerified(): boolean;
}

// Interface for Doctor model (includes static methods)
export interface IDoctorModel extends Model<IDoctorDocument> {
  findBySpecialization(specialization: string): Promise<IDoctorDocument[]>;
  findAvailableDoctors(): Promise<IDoctorDocument[]>;
  findByLicenseNumber(licenseNumber: string): Promise<IDoctorDocument | null>;
  findByEmail(email: string): Promise<IDoctorDocument | null>;
  findPendingVerification(): Promise<IDoctorDocument[]>;
  findAndAuthenticateDoctor(
    email: string,
    password: string
  ): Promise<IDoctorDocument | null>;
}

// Mongoose schema definition with proper TypeScript integration
const doctorSchema = new Schema<IDoctorDocument, IDoctorModel>(
  {
    doctorId: {
      type: String,
      unique: true,
      required: [true, "Doctor ID is required"],
      default: (): string =>
        `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    personalInfo: {
      firstName: {
        type: String,
        required: [true, "First name is required"],
        trim: true,
        maxlength: [50, "First name cannot exceed 50 characters"],
      },
      lastName: {
        type: String,
        required: [true, "Last name is required"],
        trim: true,
        maxlength: [50, "Last name cannot exceed 50 characters"],
      },
      email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        validate: {
          validator: (email: string): boolean => {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
          },
          message: "Please provide a valid email address",
        },
      },
      phone: {
        type: String,
        required: [true, "Phone number is required"],
        validate: {
          validator: (phone: string): boolean => {
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
            return phoneRegex.test(phone);
          },
          message: "Please provide a valid phone number",
        },
      },
    },
    professionalInfo: {
      specialization: {
        type: String,
        required: [true, "Specialization is required"],
        trim: true,
      },
      qualifications: {
        type: [String],
        default: [],
        validate: {
          validator: (qualifications: string[]): boolean => {
            return qualifications.length > 0;
          },
          message: "At least one qualification is required",
        },
      },
      experience: {
        type: Number,
        required: [true, "Experience is required"],
        min: [0, "Experience cannot be negative"],
        max: [50, "Experience cannot exceed 50 years"],
      },
      licenseNumber: {
        type: String,
        required: [true, "License number is required"],
        unique: true,
        trim: true,
        uppercase: true,
      },
      department: {
        type: String,
        trim: true,
      },
    },
    schedule: {
      workingDays: {
        type: [
          {
            day: {
              type: String,
              enum: {
                values: Object.values(DayOfWeek),
                message: "Invalid day of week",
              },
              required: [true, "Day is required"],
            },
            startTime: {
              type: String,
              required: [true, "Start time is required"],
              validate: {
                validator: (time: string): boolean => {
                  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                  return timeRegex.test(time);
                },
                message: "Start time must be in HH:MM format",
              },
            },
            endTime: {
              type: String,
              required: [true, "End time is required"],
              validate: {
                validator: (time: string): boolean => {
                  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                  return timeRegex.test(time);
                },
                message: "End time must be in HH:MM format",
              },
            },
            isWorking: {
              type: Boolean,
              default: true,
            },
          },
        ],
        default: [],
        validate: {
          validator: function (workingDays: IWorkingDay[]): boolean {
            // Validate that end time is after start time
            return workingDays.every((day) => {
              if (!day.isWorking) return true;
              const start = new Date(`1970-01-01T${day.startTime}:00`);
              const end = new Date(`1970-01-01T${day.endTime}:00`);
              return end > start;
            });
          },
          message: "End time must be after start time for working days",
        },
      },
      slotDuration: {
        type: Number,
        default: 30,
        min: [15, "Slot duration cannot be less than 15 minutes"],
        max: [120, "Slot duration cannot exceed 120 minutes"],
      },
      breakTimes: {
        type: [
          {
            day: {
              type: String,
              enum: {
                values: Object.values(DayOfWeek),
                message: "Invalid day for break time",
              },
              // required: [true, "Break day is required"],
            },
            startTime: {
              type: String,
              required: [true, "Break start time is required"],
              validate: {
                validator: (time: string): boolean => {
                  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                  return timeRegex.test(time);
                },
                message: "Break start time must be in HH:MM format",
              },
            },
            endTime: {
              type: String,
              required: [true, "Break end time is required"],
              validate: {
                validator: (time: string): boolean => {
                  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                  return timeRegex.test(time);
                },
                message: "Break end time must be in HH:MM format",
              },
            },
            title: {
              type: String,
              trim: true,
            },
          },
        ],
        default: [],
        validate: {
          validator: function (breakTimes: IBreakTime[]): boolean {
            // Validate that break end time is after start time
            return breakTimes.every((breakTime) => {
              const start = new Date(`1970-01-01T${breakTime.startTime}:00`);
              const end = new Date(`1970-01-01T${breakTime.endTime}:00`);
              return end > start;
            });
          },
          message: "Break end time must be after start time",
        },
      },
    },
    availability: {
      isAvailable: {
        type: Boolean,
        default: true,
      },
      unavailableDates: {
        type: [
          {
            id: {
              type: String,
              default: (): string => new Date().getTime().toString(),
            },
            date: {
              type: String,
              required: [true, "Date is required"],
              validate: {
                validator: (date: string): boolean => {
                  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                  return dateRegex.test(date) && !isNaN(Date.parse(date));
                },
                message: "Date must be in YYYY-MM-DD format",
              },
            },
            reason: {
              type: String,
              required: [true, "Reason is required"],
              trim: true,
              maxlength: [100, "Reason cannot exceed 100 characters"],
            },
            type: {
              type: String,
              enum: {
                values: ["full-day", "half-day", "morning", "afternoon"],
                message:
                  "Type must be one of: full-day, half-day, morning, afternoon",
              },
              required: [true, "Type is required"],
              default: "full-day",
            },
            notes: {
              type: String,
              trim: true,
              maxlength: [500, "Notes cannot exceed 500 characters"],
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
            updatedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        default: [],
        validate: {
          validator: function (unavailableDates: IUnavailableDate[]): boolean {
            // Check for duplicate dates
            const dates = unavailableDates.map((ud) => ud.date);
            return dates.length === new Set(dates).size;
          },
          message: "Duplicate unavailable dates are not allowed",
        },
      },
      maxAppointmentsPerDay: {
        type: Number,
        default: 20,
        min: [1, "Maximum appointments per day must be at least 1"],
        max: [100, "Maximum appointments per day cannot exceed 100"],
      },
    },
    fees: {
      consultationFee: {
        type: Number,
        required: [true, "Consultation fee is required"],
        min: [0, "Consultation fee cannot be negative"],
      },
      followUpFee: {
        type: Number,
        min: [0, "Follow-up fee cannot be negative"],
      },
      emergencyFee: {
        type: Number,
        min: [0, "Emergency fee cannot be negative"],
      },
    },
    statistics: {
      totalAppointments: {
        type: Number,
        default: 0,
        min: [0, "Total appointments cannot be negative"],
      },
      completedAppointments: {
        type: Number,
        default: 0,
        min: [0, "Completed appointments cannot be negative"],
      },
      cancelledAppointments: {
        type: Number,
        default: 0,
        min: [0, "Cancelled appointments cannot be negative"],
      },
      rating: {
        type: Number,
        default: 0,
        min: [0, "Rating cannot be less than 0"],
        max: [5, "Rating cannot exceed 5"],
      },
      reviewCount: {
        type: Number,
        default: 0,
        min: [0, "Review count cannot be negative"],
      },
    },
    // ✅ Added Authentication object (similar to Patient)
    authentication: {
      password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [8, "Password must be at least 8 characters"],
        select: false, // Don't include in queries by default
      },
      isVerified: {
        type: Boolean,
        default: false,
      },
      verificationToken: {
        type: String,
        select: false,
      },
      passwordResetToken: {
        type: String,
        select: false,
      },
      passwordResetExpires: {
        type: Date,
        select: false,
      },
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
      twoFactorSecret: {
        type: String,
        select: false,
      },
      lastPasswordChange: {
        type: Date,
        default: Date.now,
      },
    },
    isActive: {
      type: Boolean,
      default: false, // Changed to false - requires admin approval
    },
    // ✅ Added admin verification fields
    isVerifiedByAdmin: {
      type: Boolean,
      default: false,
    },
    verificationNotes: {
      type: String,
      trim: true,
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    approvalDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc: IDoctorDocument, ret: any): any {
        // Remove sensitive authentication data from JSON output
        if (ret.authentication) {
          delete ret.authentication.password;
          delete ret.authentication.verificationToken;
          delete ret.authentication.passwordResetToken;
          delete ret.authentication.twoFactorSecret;
        }
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
doctorSchema.index({ "professionalInfo.specialization": 1 });
doctorSchema.index({ "availability.isAvailable": 1 });
doctorSchema.index({ isActive: 1 });
doctorSchema.index({ isVerifiedByAdmin: 1 });

// Compound indexes
doctorSchema.index({
  "professionalInfo.specialization": 1,
  "availability.isAvailable": 1,
  isActive: 1,
});

doctorSchema.index({
  isActive: 1,
  isVerifiedByAdmin: 1,
  "authentication.isVerified": 1,
});

// Virtual for full name with proper TypeScript typing
doctorSchema.virtual("fullName").get(function (this: IDoctorDocument): string {
  const firstName = this.personalInfo?.firstName || "";
  const lastName = this.personalInfo?.lastName || "";
  return `Dr. ${firstName} ${lastName}`.trim();
});

// Pre-save middleware with proper typing
doctorSchema.pre<IDoctorDocument>("save", async function (next): Promise<void> {
  // Hash password if modified
  if (
    this.isModified("authentication.password") &&
    this.authentication.password
  ) {
    this.authentication.password = await bcrypt.hash(
      this.authentication.password,
      12
    );
    this.authentication.lastPasswordChange = new Date();
  }

  // Validate that statistics are consistent
  if (
    this.statistics.completedAppointments > this.statistics.totalAppointments
  ) {
    return next(
      new Error("Completed appointments cannot exceed total appointments")
    );
  }

  // Ensure email is lowercase
  if (this.personalInfo?.email) {
    this.personalInfo.email = this.personalInfo.email.toLowerCase();
  }

  // Set approval date when admin verifies
  if (
    this.isModified("isVerifiedByAdmin") &&
    this.isVerifiedByAdmin &&
    !this.approvalDate
  ) {
    this.approvalDate = new Date();
  }

  if (this.isModified("availability.unavailableDates")) {
    this.availability.unavailableDates.forEach(date => {
      if (!date.updatedAt || this.isModified(`availability.unavailableDates.${date.id}`)) {
        date.updatedAt = new Date();
      }
    });
  }

  next();
});

doctorSchema.methods.addUnavailableDate = function (
  this: IDoctorDocument,
  dateData: Omit<IUnavailableDate, 'id' | 'createdAt' | 'updatedAt'>
): IUnavailableDate {
  const unavailableDate: IUnavailableDate = {
    id: new Date().getTime().toString(),
    date: dateData.date,
    reason: dateData.reason,
    type: dateData.type,
    notes: dateData.notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  this.availability.unavailableDates.push(unavailableDate);
  return unavailableDate;
};

doctorSchema.methods.removeUnavailableDate = function (
  this: IDoctorDocument,
  dateId: string
): boolean {
  const index = this.availability.unavailableDates.findIndex(
    (date) => date.id === dateId
  );
  
  if (index === -1) {
    return false;
  }
  
  this.availability.unavailableDates.splice(index, 1);
  return true;
};

doctorSchema.methods.updateUnavailableDate = function (
  this: IDoctorDocument,
  dateId: string,
  updateData: Partial<Omit<IUnavailableDate, 'id' | 'createdAt'>>
): IUnavailableDate | null {
  const unavailableDate = this.availability.unavailableDates.find(
    (date) => date.id === dateId
  );
  
  if (!unavailableDate) {
    return null;
  }
  
  Object.assign(unavailableDate, updateData, { updatedAt: new Date() });
  return unavailableDate;
};

doctorSchema.methods.isDateUnavailable = function (
  this: IDoctorDocument,
  date: string
): IUnavailableDate | null {
  return this.availability.unavailableDates.find(
    (unavailableDate) => unavailableDate.date === date
  ) || null;
};

// ✅ Added authentication instance methods
doctorSchema.methods.comparePassword = async function (
  this: IDoctorDocument,
  candidatePassword: string
): Promise<boolean> {
  if (!this.authentication?.password) return false;
  return bcrypt.compare(candidatePassword, this.authentication.password);
};

doctorSchema.methods.generatePasswordResetToken = function (
  this: IDoctorDocument
): string {
  const crypto = require("crypto");
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.authentication.passwordResetToken = resetToken;
  this.authentication.passwordResetExpires = new Date(
    Date.now() + 10 * 60 * 1000
  ); // 10 minutes
  return resetToken;
};

doctorSchema.methods.generateEmailVerificationToken = function (
  this: IDoctorDocument
): string {
  const crypto = require("crypto");
  const verificationToken = crypto.randomBytes(32).toString("hex");
  this.authentication.verificationToken = verificationToken;
  return verificationToken;
};

doctorSchema.methods.isAccountFullyVerified = function (
  this: IDoctorDocument
): boolean {
  return (
    !!this.authentication.isVerified &&
    !!this.isVerifiedByAdmin &&
    !!this.isActive
  );
};

// Existing instance methods
// doctorSchema.methods.isAvailableOnDate = function (
//   this: IDoctorDocument,
//   date: Date
// ): boolean {
//   if (!this.availability.isAvailable || !this.isActive) {
//     return false;
//   }

//   // Check if date is in unavailable dates
//   return !this.availability.unavailableDates.some(
//     (unavailableDate) => unavailableDate.toDateString() === date.toDateString()
//   );
// };

doctorSchema.methods.getWorkingHoursForDay = function (
  this: IDoctorDocument,
  dayOfWeek: DayOfWeek
): IWorkingDay | null {
  return (
    this.schedule.workingDays.find(
      (day) => day.day === dayOfWeek && day.isWorking
    ) || null
  );
};

doctorSchema.methods.updateRating = function (
  this: IDoctorDocument,
  newRating: number
): void {
  const currentTotal = this.statistics.rating * this.statistics.reviewCount;
  this.statistics.reviewCount += 1;
  this.statistics.rating =
    (currentTotal + newRating) / this.statistics.reviewCount;
};

// Static methods with proper TypeScript typing
doctorSchema.statics.findBySpecialization = function (
  this: IDoctorModel,
  specialization: string
): Promise<IDoctorDocument[]> {
  return this.find({
    "professionalInfo.specialization": {
      $regex: specialization,
      $options: "i",
    },
    isActive: true,
    isVerifiedByAdmin: true,
  }).exec();
};

doctorSchema.statics.findAvailableDoctors = function (
  this: IDoctorModel
): Promise<IDoctorDocument[]> {
  return this.find({
    "availability.isAvailable": true,
    isActive: true,
    isVerifiedByAdmin: true,
    "authentication.isVerified": true,
  })
    .sort({ "statistics.rating": -1 })
    .exec();
};

doctorSchema.statics.findByLicenseNumber = function (
  this: IDoctorModel,
  licenseNumber: string
): Promise<IDoctorDocument | null> {
  return this.findOne({
    "professionalInfo.licenseNumber": licenseNumber.toUpperCase(),
  }).exec();
};

// ✅ Added new static methods for authentication
doctorSchema.statics.findByEmail = function (
  this: IDoctorModel,
  email: string
): Promise<IDoctorDocument | null> {
  return this.findOne({
    "personalInfo.email": email.toLowerCase(),
  }).exec();
};

doctorSchema.statics.findPendingVerification = function (
  this: IDoctorModel
): Promise<IDoctorDocument[]> {
  return this.find({
    $or: [{ "authentication.isVerified": false }, { isVerifiedByAdmin: false }],
  })
    .sort({ registrationDate: -1 })
    .exec();
};

doctorSchema.statics.findAndAuthenticateDoctor = async function (
  this: IDoctorModel,
  email: string,
  password: string
): Promise<IDoctorDocument | null> {
  const doctor = await this.findOne({
    "personalInfo.email": email.toLowerCase(),
  }).select("+authentication.password");

  if (!doctor || !(await doctor.comparePassword(password))) {
    return null;
  }

  return doctor;
};

// Create and export the model with proper TypeScript typing
const Doctor: IDoctorModel = mongoose.model<IDoctorDocument, IDoctorModel>(
  "Doctor",
  doctorSchema
);

export default Doctor;
