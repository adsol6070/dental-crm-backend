import Joi from "joi";

// Define custom validation schemas for enums
const genderSchema = Joi.string().valid("male", "female", "other").required();

const bloodGroupSchema = Joi.string()
  .valid("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
  .optional();

const communicationMethodSchema = Joi.string()
  .valid("email", "sms", "whatsapp", "phone")
  .default("email");

const registrationSourceSchema = Joi.string()
  .valid(
    "website",
    "mobile-app",
    "whatsapp",
    "phone-call",
    "in-person",
    "referral"
  )
  .required();

// Address validation schema
const addressSchema = Joi.object({
  street: Joi.string().trim().min(5).max(200).optional(),
  city: Joi.string().trim().min(2).max(100).optional(),
  state: Joi.string().trim().min(2).max(100).optional(),
  zipCode: Joi.string()
    .trim()
    .pattern(/^[0-9]{6}$/)
    .optional(), // Indian PIN code format
  country: Joi.string().trim().min(2).max(100).default("India").optional(),
}).optional();

// Emergency contact validation schema
const emergencyContactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  relationship: Joi.string().trim().min(2).max(50).optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^(\+91[-\s]?)?[6-9]\d{9}$/) // Indian mobile number format
    .optional(),
}).optional();

// Personal info validation schema
const personalInfoSchema = Joi.object({
  firstName: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      "string.pattern.base":
        "First name should contain only alphabets and spaces",
      "string.min": "First name must be at least 2 characters long",
      "string.max": "First name cannot exceed 50 characters",
    }),

  lastName: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      "string.pattern.base":
        "Last name should contain only alphabets and spaces",
      "string.min": "Last name must be at least 2 characters long",
      "string.max": "Last name cannot exceed 50 characters",
    }),

  dateOfBirth: Joi.date().max("now").min("1900-01-01").required().messages({
    "date.max": "Date of birth cannot be in the future",
    "date.min": "Please enter a valid date of birth",
  }),

  gender: genderSchema,
  bloodGroup: bloodGroupSchema,
}).required();

// Contact info validation schema
const contactInfoSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .trim()
    .required()
    .messages({
      "string.email": "Please enter a valid email address",
    }),

  phone: Joi.string()
    .trim()
    .pattern(/^(\+91[-\s]?)?[6-9]\d{9}$/)
    .required()
    .messages({
      "string.pattern.base": "Please enter a valid Indian mobile number",
    }),

  alternatePhone: Joi.string()
    .trim()
    .pattern(/^(\+91[-\s]?)?[6-9]\d{9}$/)
    .optional()
    .messages({
      "string.pattern.base":
        "Please enter a valid Indian mobile number for alternate phone",
    }),

  address: addressSchema,
}).required();

// Medical info validation schema
const medicalInfoSchema = Joi.object({
  allergies: Joi.array()
    .items(Joi.string().trim().min(2).max(100))
    .max(20)
    .optional()
    .messages({
      "array.max": "Cannot have more than 20 allergies listed",
    }),

  chronicConditions: Joi.array()
    .items(Joi.string().trim().min(2).max(100))
    .max(20)
    .optional()
    .messages({
      "array.max": "Cannot have more than 20 chronic conditions listed",
    }),

  currentMedications: Joi.array()
    .items(Joi.string().trim().min(2).max(200))
    .max(50)
    .optional()
    .messages({
      "array.max": "Cannot have more than 50 current medications listed",
    }),

  emergencyContact: emergencyContactSchema,
}).optional();

// Reminder settings validation schema
const reminderSettingsSchema = Joi.object({
  enableReminders: Joi.boolean().default(true).optional(),
  reminderTime: Joi.number()
    .integer()
    .min(1)
    .max(168) // Maximum 1 week (168 hours) before appointment
    .default(24)
    .optional()
    .messages({
      "number.min": "Reminder time must be at least 1 hour",
      "number.max": "Reminder time cannot exceed 168 hours (1 week)",
    }),
}).optional();

// Preferences validation schema
const preferencesSchema = Joi.object({
  preferredLanguage: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .default("english")
    .optional(),

  communicationMethod: communicationMethodSchema.optional(),
  reminderSettings: reminderSettingsSchema,
}).optional();

// Authentication validation schema
const authenticationSchema = Joi.object({
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .optional()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
    }),

  isVerified: Joi.boolean().default(false).optional(),
  verificationToken: Joi.string().optional(),
  passwordResetToken: Joi.string().optional(),
  passwordResetExpires: Joi.date().optional(),
}).optional();

// Statistics validation schema (usually read-only, but included for completeness)
const statisticsSchema = Joi.object({
  totalAppointments: Joi.number().integer().min(0).default(0).optional(),
  completedAppointments: Joi.number().integer().min(0).default(0).optional(),
  cancelledAppointments: Joi.number().integer().min(0).default(0).optional(),
  noShowCount: Joi.number().integer().min(0).default(0).optional(),
  lastVisit: Joi.date().optional(),
}).optional();

// Main patient validation schemas - MATCHING YOUR ROUTES USAGE
export const patientValidation = {
  create: Joi.object({
    personalInfo: personalInfoSchema,
    contactInfo: contactInfoSchema,
    medicalInfo: medicalInfoSchema,
    preferences: preferencesSchema,
    authentication: authenticationSchema,
    registrationSource: registrationSourceSchema,
    isActive: Joi.boolean().default(true).optional(),
  }).options({ stripUnknown: true }),

  // Login validation - matches router.post("/login")
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Email validation for password reset - matches router.post("/forgot-password")
  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Password reset validation - matches router.post("/reset-password")
  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters long",
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      }),
  }),

  // Resend verification email - matches router.post("/resend-verification")
  resendVerification: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Check email exists - matches router.post("/check-email")
  checkEmail: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Check phone exists - matches router.post("/check-phone")
  checkPhone: Joi.object({
    phone: Joi.string()
      .pattern(/^(\+91[-\s]?)?[6-9]\d{9}$/)
      .required(),
  }),

  // Update profile validation - matches router.put("/profile")
  updateProfile: Joi.object({
    personalInfo: personalInfoSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
    medicalInfo: medicalInfoSchema,
    preferences: preferencesSchema,
  }).options({ stripUnknown: true }),

  // Update preferences validation - matches router.patch("/profile/preferences")
  updatePreferences: Joi.object({
    preferredLanguage: Joi.string().trim().min(2).max(50).optional(),
    communicationMethod: communicationMethodSchema.optional(),
    reminderSettings: reminderSettingsSchema,
  }).options({ stripUnknown: true }),

  // Update medical info validation - matches router.patch("/profile/medical-info")
  updateMedicalInfo: medicalInfoSchema,

  // Update contact info validation - matches router.patch("/profile/contact-info")
  updateContactInfo: contactInfoSchema,

  // Change password validation - matches router.post("/change-password")
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters long",
        "string.pattern.base":
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      }),
  }),

  // Notification preferences - matches router.patch("/notifications/preferences")
  notificationPreferences: Joi.object({
    emailNotifications: Joi.boolean().optional(),
    smsNotifications: Joi.boolean().optional(),
    whatsappNotifications: Joi.boolean().optional(),
    pushNotifications: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    healthTips: Joi.boolean().optional(),
    promotionalEmails: Joi.boolean().optional(),
  }).options({ stripUnknown: true }),

  // Admin update validation - matches router.put("/admin/:patientId")
  adminUpdate: Joi.object({
    personalInfo: personalInfoSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
    medicalInfo: medicalInfoSchema,
    preferences: preferencesSchema,
    isActive: Joi.boolean().optional(),
    statistics: statisticsSchema,
  }).options({ stripUnknown: true }),

  // Patient search/filter validation - for admin routes
  search: Joi.object({
    query: Joi.string().trim().min(1).max(100).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string()
      .pattern(/^(\+91[-\s]?)?[6-9]\d{9}$/)
      .optional(),
    patientId: Joi.string().optional(),
    registrationSource: registrationSourceSchema.optional(),
    isActive: Joi.boolean().optional(),
    page: Joi.number().integer().min(1).default(1).optional(),
    limit: Joi.number().integer().min(1).max(100).default(10).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "firstName", "lastName", "lastVisit")
      .default("createdAt")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").default("desc").optional(),
  }).options({ stripUnknown: true }),
};

// Create the validateRequest middleware function that your routes are using
export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    // Determine what to validate based on the HTTP method and route
    let dataToValidate;

    if (req.method === "GET") {
      // For GET requests, validate query parameters
      dataToValidate = req.query;
    } else if (req.method === "PUT" && req.params.patientId) {
      // For PUT requests with patientId, include it in validation
      dataToValidate = { ...req.body, patientId: req.params.patientId };
    } else {
      // For POST, PATCH, etc., validate request body
      dataToValidate = req.body;
    }

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false, // Return all validation errors, not just the first one
      allowUnknown: false, // Remove unknown fields
      stripUnknown: true, // Strip unknown fields instead of throwing error
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
        })),
      });
    }

    // Attach validated data to request object
    if (req.method === "GET") {
      req.validatedQuery = value;
    } else {
      req.validatedData = value;
    }

    next();
  };
};

// Additional utility validators
export const patientValidationUtils = {
  // Validate patient ID format
  validatePatientId: (patientId: string): boolean => {
    const patternSchema = Joi.string().pattern(/^PAT-\d+-[a-z0-9]{9}$/);
    const { error } = patternSchema.validate(patientId);
    return !error;
  },

  // Validate age range
  validateAge: (
    dateOfBirth: Date,
    minAge: number = 0,
    maxAge: number = 120
  ): boolean => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    return age >= minAge && age <= maxAge;
  },

  // Validate phone number format
  validateIndianPhone: (phone: string): boolean => {
    const phonePattern = /^(\+91[-\s]?)?[6-9]\d{9}$/;
    return phonePattern.test(phone);
  },

  // Custom validation for duplicate contact info
  validateUniqueContact: Joi.object({
    email: Joi.string().email().required(),
    phone: Joi.string()
      .pattern(/^(\+91[-\s]?)?[6-9]\d{9}$/)
      .required(),
    excludePatientId: Joi.string().optional(), // For update operations
  }),
};

// Export default for backward compatibility
export default { patientValidation, validateRequest, patientValidationUtils };
