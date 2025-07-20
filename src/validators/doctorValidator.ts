// validators/doctorValidator.ts
import Joi from "joi";

// Enum values for validation
const dayOfWeekValues = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Common validation schemas
const timeSchema = Joi.string()
  .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
  .required()
  .messages({
    "string.pattern.base": "Time must be in HH:MM format (24-hour)",
    "any.required": "Time is required",
  });

const emailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  });

const phoneSchema = Joi.string()
  .pattern(/^[\+]?[1-9][\d]{0,15}$/)
  .required()
  .messages({
    "string.pattern.base": "Please provide a valid phone number",
    "any.required": "Phone number is required",
  });

const licenseNumberSchema = Joi.string()
  .trim()
  .uppercase()
  .min(3)
  .max(20)
  .required()
  .messages({
    "string.min": "License number must be at least 3 characters",
    "string.max": "License number cannot exceed 20 characters",
    "any.required": "License number is required",
  });

// Personal information schema
const personalInfoSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(50).required().messages({
    "string.min": "First name is required",
    "string.max": "First name cannot exceed 50 characters",
    "any.required": "First name is required",
  }),
  lastName: Joi.string().trim().min(1).max(50).required().messages({
    "string.min": "Last name is required",
    "string.max": "Last name cannot exceed 50 characters",
    "any.required": "Last name is required",
  }),
  email: emailSchema,
  phone: phoneSchema,
});

// Professional information schema
const professionalInfoSchema = Joi.object({
  specialization: Joi.string().trim().min(2).max(100).required().messages({
    "string.min": "Specialization must be at least 2 characters",
    "string.max": "Specialization cannot exceed 100 characters",
    "any.required": "Specialization is required",
  }),
  qualifications: Joi.array()
    .items(Joi.string().trim().min(1))
    .min(1)
    .required()
    .messages({
      "array.min": "At least one qualification is required",
      "any.required": "Qualifications are required",
    }),
  experience: Joi.number().integer().min(0).max(50).required().messages({
    "number.min": "Experience cannot be negative",
    "number.max": "Experience cannot exceed 50 years",
    "any.required": "Experience is required",
  }),
  licenseNumber: licenseNumberSchema,
  department: Joi.string().trim().max(100).optional().messages({
    "string.max": "Department cannot exceed 100 characters",
  }),
});

// Working day schema
const workingDaySchema = Joi.object({
  day: Joi.string()
    .valid(...dayOfWeekValues)
    .required()
    .messages({
      "any.only": "Invalid day of week",
      "any.required": "Day is required",
    }),
  startTime: timeSchema,
  endTime: timeSchema,
  isWorking: Joi.boolean().default(true),
})
  .custom((value, helpers) => {
    if (value.isWorking) {
      const start = new Date(`1970-01-01T${value.startTime}:00`);
      const end = new Date(`1970-01-01T${value.endTime}:00`);
      if (end <= start) {
        return helpers.error("custom.timeOrder");
      }
    }
    return value;
  }, "Time validation")
  .messages({
    "custom.timeOrder": "End time must be after start time for working days",
  });

// Break time schema
const breakTimeSchema = Joi.object({
  startTime: timeSchema,
  endTime: timeSchema,
  description: Joi.string().trim().max(200).optional().messages({
    "string.max": "Description cannot exceed 200 characters",
  }),
})
  .custom((value, helpers) => {
    const start = new Date(`1970-01-01T${value.startTime}:00`);
    const end = new Date(`1970-01-01T${value.endTime}:00`);
    if (end <= start) {
      return helpers.error("custom.breakTimeOrder");
    }
    return value;
  }, "Break time validation")
  .messages({
    "custom.breakTimeOrder": "Break end time must be after start time",
  });

// Schedule schema
const scheduleSchema = Joi.object({
  workingDays: Joi.array().items(workingDaySchema).default([]).messages({
    "array.base": "Working days must be an array",
  }),
  slotDuration: Joi.number().integer().min(15).max(120).default(30).messages({
    "number.min": "Slot duration cannot be less than 15 minutes",
    "number.max": "Slot duration cannot exceed 120 minutes",
  }),
  breakTimes: Joi.array().items(breakTimeSchema).default([]).messages({
    "array.base": "Break times must be an array",
  }),
});

// Availability schema
const availabilitySchema = Joi.object({
  isAvailable: Joi.boolean().default(true),
  unavailableDates: Joi.array().items(Joi.date()).default([]).messages({
    "array.base": "Unavailable dates must be an array of dates",
  }),
  maxAppointmentsPerDay: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .messages({
      "number.min": "Maximum appointments per day must be at least 1",
      "number.max": "Maximum appointments per day cannot exceed 100",
    }),
});

// Fees schema
const feesSchema = Joi.object({
  consultationFee: Joi.number().min(0).required().messages({
    "number.min": "Consultation fee cannot be negative",
    "any.required": "Consultation fee is required",
  }),
  followUpFee: Joi.number().min(0).optional().messages({
    "number.min": "Follow-up fee cannot be negative",
  }),
  emergencyFee: Joi.number().min(0).optional().messages({
    "number.min": "Emergency fee cannot be negative",
  }),
});

// Statistics schema (for admin updates)
const statisticsSchema = Joi.object({
  totalAppointments: Joi.number().integer().min(0).default(0).messages({
    "number.min": "Total appointments cannot be negative",
  }),
  completedAppointments: Joi.number().integer().min(0).default(0).messages({
    "number.min": "Completed appointments cannot be negative",
  }),
  cancelledAppointments: Joi.number().integer().min(0).default(0).messages({
    "number.min": "Cancelled appointments cannot be negative",
  }),
  rating: Joi.number().min(0).max(5).default(0).messages({
    "number.min": "Rating cannot be less than 0",
    "number.max": "Rating cannot exceed 5",
  }),
  reviewCount: Joi.number().integer().min(0).default(0).messages({
    "number.min": "Review count cannot be negative",
  }),
})
  .custom((value, helpers) => {
    if (value.completedAppointments > value.totalAppointments) {
      return helpers.error("custom.appointmentLogic");
    }
    return value;
  }, "Statistics validation")
  .messages({
    "custom.appointmentLogic":
      "Completed appointments cannot exceed total appointments",
  });

const authenticationSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
    })
});

// Main doctor validation schemas
export const doctorValidation = {
  // Registration validation
  register: Joi.object({
    personalInfo: personalInfoSchema.required(),
    professionalInfo: professionalInfoSchema.required(),
    schedule: scheduleSchema.optional(),
    availability: availabilitySchema.optional(),
    fees: feesSchema.required(),
    authentication: authenticationSchema.required()
  }),

  // Login validation
  login: Joi.object({
    email: emailSchema,
    password: Joi.string().min(6).max(128).required().messages({
      "string.min": "Password must be at least 6 characters",
      "string.max": "Password cannot exceed 128 characters",
      "any.required": "Password is required",
    }),
  }),

  // Forgot password validation
  forgotPassword: Joi.object({
    email: emailSchema,
  }),

  // Reset password validation
  resetPassword: Joi.object({
    token: Joi.string().required().messages({
      "any.required": "Reset token is required",
    }),
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
        "string.max": "Password cannot exceed 128 characters",
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        "any.required": "New password is required",
      }),
  }),

  // Resend verification validation
  resendVerification: Joi.object({
    email: emailSchema,
  }),

  // Check email validation
  checkEmail: Joi.object({
    email: emailSchema,
  }),

  // Check license validation
  checkLicense: Joi.object({
    licenseNumber: licenseNumberSchema,
  }),

  // Update profile validation
  updateProfile: Joi.object({
    personalInfo: personalInfoSchema.optional(),
    professionalInfo: professionalInfoSchema.optional(),
    schedule: scheduleSchema.optional(),
    availability: availabilitySchema.optional(),
    fees: feesSchema.optional(),
  })
    .min(1)
    .messages({
      "object.min": "At least one field must be provided for update",
    }),

  // Update professional info validation
  updateProfessionalInfo: professionalInfoSchema,

  // Update contact info validation
  updateContactInfo: personalInfoSchema,

  // Update schedule validation
  updateSchedule: scheduleSchema,

  // Update availability validation
  updateAvailability: availabilitySchema,

  // Add break time validation
  addBreak: Joi.object({
    startTime: timeSchema,
    endTime: timeSchema,
    description: Joi.string().trim().max(200).optional().messages({
      "string.max": "Description cannot exceed 200 characters",
    }),
  })
    .custom((value, helpers) => {
      const start = new Date(`1970-01-01T${value.startTime}:00`);
      const end = new Date(`1970-01-01T${value.endTime}:00`);
      if (end <= start) {
        return helpers.error("custom.breakTimeOrder");
      }
      return value;
    }, "Break time validation")
    .messages({
      "custom.breakTimeOrder": "Break end time must be after start time",
    }),

  // Add unavailable date validation
  addUnavailableDate: Joi.object({
    date: Joi.date().min("now").required().messages({
      "date.min": "Cannot add past dates as unavailable",
      "any.required": "Date is required",
    }),
    reason: Joi.string().trim().max(500).optional().messages({
      "string.max": "Reason cannot exceed 500 characters",
    }),
  }),

  // Update fees validation
  updateFees: feesSchema,

  // Change password validation
  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      "any.required": "Current password is required",
    }),
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
        "string.max": "Password cannot exceed 128 characters",
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
        "any.required": "New password is required",
      }),
  })
    .custom((value, helpers) => {
      if (value.currentPassword === value.newPassword) {
        return helpers.error("custom.samePassword");
      }
      return value;
    }, "Password validation")
    .messages({
      "custom.samePassword":
        "New password must be different from current password",
    }),

  // Update appointment status validation
  updateAppointmentStatus: Joi.object({
    status: Joi.string()
      .valid(
        "scheduled",
        "confirmed",
        "in-progress",
        "completed",
        "cancelled",
        "no-show"
      )
      .required()
      .messages({
        "any.only":
          "Status must be one of: scheduled, confirmed, in-progress, completed, cancelled, no-show",
        "any.required": "Status is required",
      }),
    reason: Joi.string().trim().max(500).optional().messages({
      "string.max": "Reason cannot exceed 500 characters",
    }),
  }),

  // Add consultation notes validation
  addConsultation: Joi.object({
    diagnosis: Joi.string().trim().min(1).max(2000).required().messages({
      "string.min": "Diagnosis is required",
      "string.max": "Diagnosis cannot exceed 2000 characters",
      "any.required": "Diagnosis is required",
    }),
    prescription: Joi.string().trim().max(2000).optional().messages({
      "string.max": "Prescription cannot exceed 2000 characters",
    }),
    notes: Joi.string().trim().max(2000).optional().messages({
      "string.max": "Notes cannot exceed 2000 characters",
    }),
    followUpRequired: Joi.boolean().default(false),
    followUpDate: Joi.date().min("now").optional().messages({
      "date.min": "Follow-up date cannot be in the past",
    }),
    recommendations: Joi.string().trim().max(1000).optional().messages({
      "string.max": "Recommendations cannot exceed 1000 characters",
    }),
  }),

  // Admin update validation
  adminUpdate: Joi.object({
    personalInfo: personalInfoSchema.optional(),
    professionalInfo: professionalInfoSchema.optional(),
    schedule: scheduleSchema.optional(),
    availability: availabilitySchema.optional(),
    fees: feesSchema.optional(),
    statistics: statisticsSchema.optional(),
    isActive: Joi.boolean().optional(),
  })
    .min(1)
    .messages({
      "object.min": "At least one field must be provided for update",
    }),

  // Query validations for listing and searching
  listQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1).messages({
      "number.min": "Page must be at least 1",
    }),
    limit: Joi.number().integer().min(1).max(100).default(10).messages({
      "number.min": "Limit must be at least 1",
      "number.max": "Limit cannot exceed 100",
    }),
    search: Joi.string().trim().min(1).max(100).optional().messages({
      "string.min": "Search term must be at least 1 character",
      "string.max": "Search term cannot exceed 100 characters",
    }),
    specialization: Joi.string().trim().max(100).optional().messages({
      "string.max": "Specialization cannot exceed 100 characters",
    }),
    status: Joi.string()
      .valid("all", "active", "inactive")
      .default("all")
      .messages({
        "any.only": "Status must be one of: all, active, inactive",
      }),
    sortBy: Joi.string()
      .valid(
        "createdAt",
        "personalInfo.firstName",
        "personalInfo.lastName",
        "professionalInfo.experience",
        "statistics.rating"
      )
      .default("createdAt")
      .messages({
        "any.only": "Invalid sort field",
      }),
    sortOrder: Joi.string().valid("asc", "desc").default("desc").messages({
      "any.only": "Sort order must be asc or desc",
    }),
  }),

  // Search query validation
  searchQuery: Joi.object({
    q: Joi.string().trim().min(1).max(100).optional().messages({
      "string.min": "Search query must be at least 1 character",
      "string.max": "Search query cannot exceed 100 characters",
    }),
    specialization: Joi.string().trim().max(100).optional(),
    experience: Joi.number().integer().min(0).max(50).optional().messages({
      "number.min": "Experience cannot be negative",
      "number.max": "Experience cannot exceed 50 years",
    }),
    rating: Joi.number().min(0).max(5).optional().messages({
      "number.min": "Rating cannot be less than 0",
      "number.max": "Rating cannot exceed 5",
    }),
    availableToday: Joi.string().valid("true", "false").optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string()
      .valid(
        "statistics.rating",
        "professionalInfo.experience",
        "personalInfo.firstName"
      )
      .default("statistics.rating"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),

  // Admin analytics query validation
  analyticsQuery: Joi.object({
    period: Joi.string()
      .valid("month", "week", "day")
      .default("month")
      .messages({
        "any.only": "Period must be one of: month, week, day",
      }),
    year: Joi.string()
      .pattern(/^\d{4}$/)
      .default(new Date().getFullYear().toString())
      .messages({
        "string.pattern.base": "Year must be a 4-digit number",
      }),
  }),

  // Doctor status update validation
  updateStatus: Joi.object({
    isActive: Joi.boolean().required().messages({
      "any.required": "Status is required",
    }),
    reason: Joi.string().trim().min(1).max(500).required().messages({
      "string.min": "Reason is required",
      "string.max": "Reason cannot exceed 500 characters",
      "any.required": "Reason is required",
    }),
  }),

  // Doctor verification validation
  verifyDoctor: Joi.object({
    verificationStatus: Joi.string()
      .valid("verified", "rejected", "pending")
      .required()
      .messages({
        "any.only":
          "Verification status must be one of: verified, rejected, pending",
        "any.required": "Verification status is required",
      }),
    reason: Joi.string().trim().max(1000).optional().messages({
      "string.max": "Reason cannot exceed 1000 characters",
    }),
  }),
};

// Export individual schemas for reuse
export {
  personalInfoSchema,
  professionalInfoSchema,
  scheduleSchema,
  availabilitySchema,
  feesSchema,
  workingDaySchema,
  breakTimeSchema,
  statisticsSchema,
  timeSchema,
  emailSchema,
  phoneSchema,
  licenseNumberSchema,
};
