// validators/medicineValidator.ts
import Joi from "joi";

// Medicine category enum values for validation
const medicineCategoryValues = [
    'Antibiotic',
    'Pain Relief', 
    'Anti-inflammatory',
    'Antiseptic',
    'Anesthetic',
    'Mouth Rinse',
    'Fluoride Treatment',
    'Vitamin/Supplement'
];

// Dental use category enum values
const dentalUseCategoryValues = [
    'Root Canal',
    'Tooth Extraction',
    'Dental Cleaning',
    'Dental Filling',
    'Gum Treatment',
    'Oral Surgery',
    'Preventive Care',
    'General Treatment'
];

// Dosage form enum values
const dosageFormValues = [
    'Tablet',
    'Capsule',
    'Liquid/Syrup',
    'Gel',
    'Ointment',
    'Mouthwash',
    'Drops'
];

// Unit enum values
const unitValues = ['mg', 'g', 'ml', 'mcg', 'IU', '%', 'units'];

// Status enum values
const statusValues = ['active', 'inactive', 'discontinued'];

// Create medicine validation
export const createMedicineValidation = Joi.object({
    medicineName: Joi.string().trim().min(2).max(100).required(),
    genericName: Joi.string().trim().max(100).optional(),
    brandName: Joi.string().trim().max(100).optional(),
    category: Joi.string().valid(...medicineCategoryValues).required(),
    dentalUse: Joi.string().valid(...dentalUseCategoryValues).required(),
    dosageForm: Joi.string().valid(...dosageFormValues).required(),
    strength: Joi.string().trim().min(1).max(50).required(),
    unit: Joi.string().valid(...unitValues).required(),
    manufacturer: Joi.string().trim().max(100).optional(),
    description: Joi.string().trim().max(1000).optional(),
    dosageInstructions: Joi.string().trim().min(5).max(500).required(),
    prescriptionRequired: Joi.boolean().optional().default(true)
});

// Update medicine validation
export const updateMedicineValidation = Joi.object({
    medicineName: Joi.string().trim().min(2).max(100).optional(),
    genericName: Joi.string().trim().max(100).optional(),
    brandName: Joi.string().trim().max(100).optional(),
    category: Joi.string().valid(...medicineCategoryValues).optional(),
    dentalUse: Joi.string().valid(...dentalUseCategoryValues).optional(),
    dosageForm: Joi.string().valid(...dosageFormValues).optional(),
    strength: Joi.string().trim().min(1).max(50).optional(),
    unit: Joi.string().valid(...unitValues).optional(),
    manufacturer: Joi.string().trim().max(100).optional(),
    description: Joi.string().trim().max(1000).optional(),
    dosageInstructions: Joi.string().trim().min(5).max(500).optional(),
    prescriptionRequired: Joi.boolean().optional()
});

// Medicine search validation
export const medicineSearchValidation = Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
    search: Joi.string().trim().min(1).max(100).optional(),
    category: Joi.string().valid(...medicineCategoryValues).optional(),
    dentalUse: Joi.string().valid(...dentalUseCategoryValues).optional(),
    status: Joi.string().valid(...statusValues).optional(),
    sortBy: Joi.string().valid('medicineName', 'category', 'dentalUse', 'createdAt', 'updatedAt').optional().default('medicineName'),
    sortOrder: Joi.string().valid('asc', 'desc').optional().default('asc')
});

// Medicine ID parameter validation
export const medicineIdParamValidation = Joi.object({
    medicineId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .message('Invalid MongoDB ObjectId')
        .required()
});

// Medicine status update validation
export const updateMedicineStatusValidation = Joi.object({
    status: Joi.string().valid(...statusValues).required(),
    isActive: Joi.boolean().required()
});
