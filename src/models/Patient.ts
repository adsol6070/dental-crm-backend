import mongoose, { Schema, Document, Model, Types } from "mongoose";
import bcrypt from "bcryptjs";

type Gender = "male" | "female" | "other";
type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";
type CommunicationMethod = "email" | "sms" | "whatsapp" | "phone";
type RegistrationSource =
  | "website"
  | "mobile-app"
  | "whatsapp"
  | "phone-call"
  | "in-person"
  | "referral";

// Define interfaces for nested objects
interface Address {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
}

interface PersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender;
  bloodGroup?: BloodGroup;
}

interface ContactInfo {
  email: string;
  phone: string;
  alternatePhone?: string;
  address?: Address;
}

interface MedicalInfo {
  allergies?: string[];
  chronicConditions?: string[];
  currentMedications?: string[];
  emergencyContact?: EmergencyContact;
}

interface ReminderSettings {
  enableReminders?: boolean;
  reminderTime?: number;
}

interface Preferences {
  preferredLanguage?: string;
  communicationMethod?: CommunicationMethod;
  reminderSettings?: ReminderSettings;
}

interface Authentication {
  password?: string;
  isVerified?: boolean;
  verificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
}

interface Statistics {
  totalAppointments?: number;
  completedAppointments?: number;
  cancelledAppointments?: number;
  noShowCount?: number;
  lastVisit?: Date;
}

export interface IPatient {
  patientId: string;
  personalInfo: PersonalInfo;
  contactInfo: ContactInfo;
  medicalInfo?: MedicalInfo;
  preferences?: Preferences;
  authentication?: Authentication;
  statistics?: Statistics;
  registrationSource: RegistrationSource;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatientDocument extends IPatient, Document {
  _id: Types.ObjectId;
  fullName: string;
  age: number | undefined;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface PatientModel extends Model<PatientDocument> {}

const patientSchema = new Schema<PatientDocument>(
  {
    patientId: {
      type: String,
      unique: true,
      required: true,
      default: (): string =>
        `PAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    personalInfo: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      dateOfBirth: { type: Date, required: true },
      gender: {
        type: String,
        enum: ["male", "female", "other"] as const,
        required: true,
      },
      bloodGroup: {
        type: String,
        enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const,
      },
    },
    contactInfo: {
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
      phone: { type: String, required: true, trim: true },
      alternatePhone: { type: String, trim: true },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: { type: String, default: "India" },
      },
    },
    medicalInfo: {
      allergies: [String],
      chronicConditions: [String],
      currentMedications: [String],
      emergencyContact: {
        name: String,
        relationship: String,
        phone: String,
      },
    },
    preferences: {
      preferredLanguage: { type: String, default: "english" },
      communicationMethod: {
        type: String,
        enum: ["email", "sms", "whatsapp", "phone"] as const,
        default: "email",
      },
      reminderSettings: {
        enableReminders: { type: Boolean, default: true },
        reminderTime: { type: Number, default: 24 }, // hours before appointment
      },
    },
    authentication: {
      password: String,
      isVerified: { type: Boolean, default: false },
      verificationToken: String,
      passwordResetToken: String,
      passwordResetExpires: Date,
    },
    statistics: {
      totalAppointments: { type: Number, default: 0 },
      completedAppointments: { type: Number, default: 0 },
      cancelledAppointments: { type: Number, default: 0 },
      noShowCount: { type: Number, default: 0 },
      lastVisit: Date,
    },
    registrationSource: {
      type: String,
      enum: [
        "website",
        "mobile-app",
        "whatsapp",
        "phone-call",
        "in-person",
        "referral",
      ] as const,
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc: PatientDocument, ret: any): any {
        if (ret.authentication && ret.authentication.password) {
          delete ret.authentication.password;
        }
        return ret;
      },
    },
  }
);

patientSchema.index({ "contactInfo.phone": 1 });
patientSchema.index({
  "personalInfo.firstName": 1,
  "personalInfo.lastName": 1,
});

patientSchema.virtual("fullName").get(function (this: PatientDocument): string {
  return `${this.personalInfo?.firstName ?? ""} ${
    this.personalInfo?.lastName ?? ""
  }`.trim();
});

patientSchema
  .virtual("age")
  .get(function (this: PatientDocument): number | undefined {
    const today: Date = new Date();
    if (!this.personalInfo || !this.personalInfo.dateOfBirth) {
      return undefined;
    }
    const birthDate: Date = new Date(this.personalInfo.dateOfBirth);
    let age: number = today.getFullYear() - birthDate.getFullYear();
    const monthDiff: number = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  });

patientSchema.pre<PatientDocument>(
  "save",
  async function (next): Promise<void> {
    if (!this.isModified("authentication.password")) return next();

    if (this.authentication && this.authentication.password) {
      this.authentication.password = await bcrypt.hash(
        this.authentication.password,
        12
      );
    }
    next();
  }
);

patientSchema.methods.comparePassword = async function (
  this: PatientDocument,
  candidatePassword: string
): Promise<boolean> {
  if (!this.authentication?.password) return false;
  return bcrypt.compare(candidatePassword, this.authentication.password);
};

const Patient = mongoose.model<PatientDocument, PatientModel>(
  "Patient",
  patientSchema
);

export default Patient;
