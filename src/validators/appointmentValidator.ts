import Joi from "joi";
import mongoose from "mongoose";

// Enums for validation
const appointmentTypes = [
  "consultation",
  "follow-up",
  "emergency",
  "routine-checkup",
  "procedure",
];

const appointmentStatuses = [
  "scheduled",
  "confirmed",
  "in-progress",
  "completed",
  "cancelled",
  "no-show",
];

const priorities = ["low", "medium", "high", "urgent"];

const bookingSources = [
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
];

const paymentStatuses = ["pending", "paid", "failed", "refunded"];

// ObjectId validation extension
const objectId = () =>
  Joi.string().custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error("any.invalid");
    }
    return value;
  }, "ObjectId validation");

// 🎯 Shared fields for reuse
const baseFields = {
  appointmentDateTime: Joi.date().iso(),
  duration: Joi.number().integer().min(5).max(180),
  appointmentType: Joi.string().valid(...appointmentTypes),
  status: Joi.string().valid(...appointmentStatuses),
  priority: Joi.string().valid(...priorities),
  bookingSource: Joi.string().valid(...bookingSources),
  symptoms: Joi.array().items(Joi.string()),
  notes: Joi.string().allow(""),
  specialRequirements: Joi.string().allow(""),
  remindersSent: Joi.number().integer().min(0),
  lastReminderSent: Joi.date().iso(),
  cancelledAt: Joi.date().iso(),
  paymentStatus: Joi.string().valid(...paymentStatuses),
  paymentAmount: Joi.number(),
  paymentMethod: Joi.string().allow(""),
  consultation: Joi.object({
    diagnosis: Joi.string().allow(""),
    prescription: Joi.string().allow(""),
    nextAppointment: Joi.date().iso().optional(),
    followUpRequired: Joi.boolean(),
  }).optional(),
  metadata: Joi.object({
    ipAddress: Joi.string().ip({ version: ["ipv4", "ipv6"] }),
    userAgent: Joi.string(),
    referralSource: Joi.string(),
    campaignId: Joi.string(),
  }),
};

// ✅ Create Appointment Schema
const create = Joi.object({
  patient: objectId().required(),
  doctor: objectId().required(),
  ...baseFields,
  appointmentDateTime: baseFields.appointmentDateTime.required(),
  duration: baseFields.duration.required(),
  appointmentType: baseFields.appointmentType.required(),
  bookingSource: baseFields.bookingSource.required(),
});

// ✅ Update Appointment Schema
const update = Joi.object({
  patient: objectId(),
  doctor: objectId(),
  ...baseFields,
});

export default {
  create,
  update,
};
