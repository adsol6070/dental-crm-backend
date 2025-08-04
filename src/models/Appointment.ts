import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { PatientDocument } from "./Patient";
import { IDoctorDocument } from "./Doctor";

// Define enums as types
type AppointmentType =
  | "consultation"
  | "follow-up"
  | "emergency"
  | "routine-checkup"
  | "procedure";
type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "no-show";
type Priority = "low" | "medium" | "high" | "urgent";
type BookingSource =
  | "website"
  | "mobile-app"
  | "whatsapp"
  | "phone-call"
  | "email"
  | "sms"
  | "in-person"
  | "third-party"
  | "referral"
  | "qr-code"
  | "social-media"
  | "voice-bot"
  | "api";
type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

// Define interfaces for nested objects
interface Consultation {
  diagnosis?: string;
  prescription?: string;
  nextAppointment?: Date;
  followUpRequired?: boolean;
}

interface Metadata {
  ipAddress?: string;
  userAgent?: string;
  referralSource?: string;
  campaignId?: string;
}

// Define the main appointment interface
export interface IAppointment {
  appointmentId: string;
  patient: Types.ObjectId;
  doctor: Types.ObjectId;
  appointmentDate: string;
  appointmentStartTime: Date;
  appointmentEndTime: Date;
  duration: number;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  priority: Priority;
  bookingSource: BookingSource;
  symptoms?: string[];
  notes?: string;
  specialRequirements?: string;
  remindersSent: number;
  lastReminderSent?: Date;
  cancelledAt?: Date;
  paymentStatus: PaymentStatus;
  paymentAmount?: number;
  paymentMethod?: string;
  consultation?: Consultation;
  metadata?: Metadata;
  createdAt?: Date;
  updatedAt?: Date;
}

// Define the document interface with virtuals
export interface AppointmentDocument extends IAppointment, Document {
  _id: Types.ObjectId;
  endDateTime: Date;
}

export type PopulatedAppointmentDocument = AppointmentDocument & {
  patient: PatientDocument;
  doctor: IDoctorDocument;
};

// Define the model interface
export interface AppointmentModel extends Model<AppointmentDocument> {}

// Create the schema with proper typing
const appointmentSchema = new Schema<AppointmentDocument>(
  {
    appointmentId: {
      type: String,
      unique: true,
      required: true,
      default: (): string =>
        `APT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    },
    patient: {
      type: Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    doctor: {
      type: Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    appointmentDate: {
      type: String, // e.g., "2025-08-14"
      required: true,
      index: true,
    },
    appointmentStartTime: {
      type: Date, // stored as UTC
      required: true,
    },
    appointmentEndTime: {
      type: Date, // stored as UTC
      required: true,
    },
    duration: {
      type: Number,
      default: 30, // minutes
      required: true,
    },
    appointmentType: {
      type: String,
      enum: [
        "consultation",
        "follow-up",
        "emergency",
        "routine-checkup",
        "procedure",
      ] as const,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "scheduled",
        "confirmed",
        "in-progress",
        "completed",
        "cancelled",
        "no-show",
      ] as const,
      default: "scheduled",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"] as const,
      default: "medium",
    },
    bookingSource: {
      type: String,
      enum: [
        "website",
        "mobile-app",
        "whatsapp",
        "phone-call",
        "email",
        "sms",
        "in-person",
        "third-party",
        "referral",
        "qr-code",
        "social-media",
        "voice-bot",
        "api",
      ] as const,
      required: true,
      index: true,
    },
    symptoms: [String],
    notes: String,
    specialRequirements: String,
    remindersSent: {
      type: Number,
      default: 0,
    },
    lastReminderSent: Date,
    cancelledAt: Date,
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"] as const,
      default: "pending",
    },
    paymentAmount: Number,
    paymentMethod: String,
    consultation: {
      diagnosis: String,
      prescription: String,
      nextAppointment: Date,
      followUpRequired: Boolean,
    },
    metadata: {
      ipAddress: String,
      userAgent: String,
      referralSource: String,
      campaignId: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
appointmentSchema.index({ doctor: 1, appointmentStartTime: 1 });
appointmentSchema.index({ patient: 1, appointmentStartTime: -1 });
appointmentSchema.index({ status: 1, appointmentStartTime: 1 });
appointmentSchema.index({ bookingSource: 1, createdAt: -1 });

// Virtual for appointment end time
// appointmentSchema
//   .virtual("endDateTime")
//   .get(function (this: AppointmentDocument): Date {
//     return new Date(
//       this.appointmentStartTime.getTime() + this.duration * 60000
//     );
//   });

// Pre-save middleware
appointmentSchema.pre<AppointmentDocument>("save", function (next): void {
  if (this.isModified("status") && this.status === "cancelled") {
    this.cancelledAt = new Date();
  }
  next();
});

// Create and export the model
const Appointment = mongoose.model<AppointmentDocument, AppointmentModel>(
  "Appointment",
  appointmentSchema
);

export default Appointment;
