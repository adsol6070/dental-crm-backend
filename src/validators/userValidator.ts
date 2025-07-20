import Joi from "joi";

export const registerValidation = Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().optional().pattern(/^[\s\S]*$/).message('Valid phone number required'),
    password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .message('Password must contain uppercase, lowercase, number, and special character')
        .required(),
    role: Joi.string().valid('staff', 'doctor', 'nurse', 'receptionist').optional(),
});

export const loginValidation = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    twoFactorCode: Joi.string().length(6).optional()
});

export const superAdminValidation = Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().optional().pattern(/^[\s\S]*$/).message('Valid phone number required'),
    password: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .message('Password must contain uppercase, lowercase, number, and special character')
        .required(),
    setupKey: Joi.string().required()
});

export const createUserValidation = Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().optional().pattern(/^[\s\S]*$/).message('Valid phone number required'),
    sendCredentials: Joi.boolean().optional()
});

export const updateProfileValidation = Joi.object({
    firstName: Joi.string().trim().min(2).max(50).optional(),
    lastName: Joi.string().trim().min(2).max(50).optional(),
    phone: Joi.string()
        .pattern(/^[\s\S]*$/)
        .message('Valid phone number required')
        .optional()

});

export const changePasswordValidation = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .message('New password must contain uppercase, lowercase, number, and special character')
        .required()
});

export const forcePasswordChangeValidation = Joi.object({
    newPassword: Joi.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .message('New password must contain uppercase, lowercase, number, and special character')
        .required(),
    tempToken: Joi.string().required()
});

export const twoFactorValidation = Joi.object({
    token: Joi.string().length(6).required()
});

export const disable2FAValidation = Joi.object({
    password: Joi.string().required(),
    twoFactorCode: Joi.string().length(6).required()
});

export const updateStatusValidation = Joi.object({
    status: Joi.string().valid('active', 'inactive', 'suspended').required(),
    isActive: Joi.boolean().required()
});

export const paginationValidation = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    role: Joi.string().valid('super_admin', 'admin', 'staff', 'doctor', 'nurse', 'receptionist').optional(),
    status: Joi.string().valid('active', 'inactive', 'suspended').optional(),
    search: Joi.string().min(1).max(100).optional()
});

export const userIdParamValidation = Joi.object({
    userId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .message('Invalid MongoDB ObjectId')
        .required()
});
