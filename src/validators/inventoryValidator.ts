import Joi from "joi";

// Item category enum values for validation
const itemCategoryValues = [
  'Dental Implant',
  'Abutment',
  'Crown',
  'Bridge',
  'Dental Material',
  'Instrument',
  'Consumable',
  'Equipment'
];

// Item type enum values
const itemTypeValues = [
  'Straumann BLX',
  'Swiss',
  'Dentium',
  'Dentsply',
  'Nobel',
  'Osstem',
  'MIS',
  'Healing Abutment',
  'Impression Material',
  'Dental Cement',
  'Composite Resin',
  'Crown Material',
  'Surgical Kit',
  'Gloves',
  'Other'
];

// Supplier enum values
const supplierValues = [
  'The Dentist Shop',
  'International Dental Systems',
  'Vinit Enterprises',
  'Kumar Dental',
  'Sachdeva Gloves',
  'NEO ENDO',
  'Prashant Lab',
  'Shankar Lab',
  'Govind Lab'
];

// Unit enum values
const unitValues = ['pieces', 'boxes', 'kits', 'bottles', 'tubes', 'sets'];

// Status enum values
const statusValues = ['in-stock', 'low-stock', 'out-of-stock', 'expired'];

// Payment status enum values
const paymentStatusValues = ['paid', 'pending', 'partial'];

// Payment mode enum values
const paymentModeValues = ['Cash', 'Card', 'Bank Transfer', 'UPI', 'Cheque', 'Online', 'Other'];

// Create implant material validation
export const createImplantMaterialValidation = Joi.object({
  itemName: Joi.string().trim().min(2).max(200).required(),
  category: Joi.string().valid(...itemCategoryValues).required(),
  type: Joi.string().valid(...itemTypeValues).required(),
  implantBrand: Joi.string().trim().min(1).max(100).required(),
  supplier: Joi.string().valid(...supplierValues).required(),
  quantity: Joi.number().integer().min(0).required(),
  unit: Joi.string().valid(...unitValues).required(),
  unitPrice: Joi.number().min(0).required(),
  receivedDate: Joi.date().max('now').required(),
  expiryDate: Joi.date().min(Joi.ref('receivedDate')).optional(),
  batchNumber: Joi.string().trim().max(50).optional(),
  description: Joi.string().trim().max(1000).optional(),
  specifications: Joi.string().trim().max(1000).optional(),
  storageConditions: Joi.string().trim().max(500).optional(),
  minimumStock: Joi.number().integer().min(0).required(),
  paymentStatus: Joi.string().valid(...paymentStatusValues).required(),
  paymentMode: Joi.string().valid(...paymentModeValues).when('paymentStatus', {
    is: Joi.valid('paid', 'partial'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  paymentDate: Joi.date().optional(),
  invoiceNumber: Joi.string().trim().max(100).optional(),
  // New payment fields with conditional validation
  amountPaid: Joi.number().min(0).when('paymentStatus', {
    is: 'partial',
    then: Joi.required().custom((value, helpers) => {
      const { quantity, unitPrice } = helpers.state.ancestors[0];
      const totalCost = quantity * unitPrice;
      if (value >= totalCost) {
        return helpers.error('any.invalid', { message: 'Amount paid must be less than total cost for partial payments' });
      }
      return value;
    }),
    otherwise: Joi.when('paymentStatus', {
      is: 'paid',
      then: Joi.custom((value, helpers) => {
        const { quantity, unitPrice } = helpers.state.ancestors[0];
        const totalCost = quantity * unitPrice;
        if (value !== totalCost) {
          return helpers.error('any.invalid', { message: 'Amount paid must equal total cost for paid status' });
        }
        return value;
      }),
      otherwise: Joi.optional()
    })
  }),
  amountPending: Joi.number().min(0).when('paymentStatus', {
    is: 'partial',
    then: Joi.required().custom((value, helpers) => {
      const { quantity, unitPrice, amountPaid } = helpers.state.ancestors[0];
      const totalCost = quantity * unitPrice;
      if ((amountPaid + value) !== totalCost) {
        return helpers.error('any.invalid', { message: 'Amount paid + amount pending must equal total cost' });
      }
      return value;
    }),
    otherwise: Joi.optional()
  }),
  paymentNotes: Joi.string().trim().max(500).optional()
});

// Update implant material validation
export const updateImplantMaterialValidation = Joi.object({
  itemName: Joi.string().trim().min(2).max(200).optional(),
  category: Joi.string().valid(...itemCategoryValues).optional(),
  type: Joi.string().valid(...itemTypeValues).optional(),
  implantBrand: Joi.string().trim().min(1).max(100).optional(),
  supplier: Joi.string().valid(...supplierValues).optional(),
  quantity: Joi.number().integer().min(0).optional(),
  unit: Joi.string().valid(...unitValues).optional(),
  unitPrice: Joi.number().min(0).optional(),
  receivedDate: Joi.date().max('now').optional(),
  expiryDate: Joi.date().optional(),
  batchNumber: Joi.string().trim().max(50).optional(),
  description: Joi.string().trim().max(1000).optional(),
  specifications: Joi.string().trim().max(1000).optional(),
  storageConditions: Joi.string().trim().max(500).optional(),
  minimumStock: Joi.number().integer().min(0).optional(),
  paymentStatus: Joi.string().valid(...paymentStatusValues).optional(),
  paymentMode: Joi.string().valid(...paymentModeValues).optional(),
  paymentDate: Joi.date().optional(),
  invoiceNumber: Joi.string().trim().max(100).optional(),
  // New payment fields
  amountPaid: Joi.number().min(0).optional(),
  amountPending: Joi.number().min(0).optional(),
  paymentNotes: Joi.string().trim().max(500).optional()
});

// Implant material search validation
export const implantMaterialSearchValidation = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(10),
  search: Joi.string().trim().min(1).max(100).optional(),
  category: Joi.string().valid(...itemCategoryValues).optional(),
  supplier: Joi.string().valid(...supplierValues).optional(),
  status: Joi.string().valid(...statusValues).optional(),
  paymentStatus: Joi.string().valid(...paymentStatusValues).optional(),
  paymentMode: Joi.string().valid(...paymentModeValues).optional(),
  sortBy: Joi.string().valid('itemName', 'category', 'supplier', 'quantity', 'unitPrice', 'totalCost', 'receivedDate', 'expiryDate', 'amountPaid', 'amountPending', 'createdAt', 'updatedAt').optional().default('itemName'),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('asc')
});

// Implant material ID parameter validation
export const implantMaterialIdParamValidation = Joi.object({
  materialId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .message('Invalid MongoDB ObjectId')
    .required()
});

// Implant material status update validation
export const updateImplantMaterialStatusValidation = Joi.object({
  status: Joi.string().valid(...statusValues).required(),
  isActive: Joi.boolean().required()
});

// Stock update validation
export const updateStockValidation = Joi.object({
  quantity: Joi.number().integer().min(0).required(),
  operation: Joi.string().valid('add', 'subtract', 'set').required(),
  reason: Joi.string().trim().max(500).optional()
});

// Payment status update validation
export const updatePaymentStatusValidation = Joi.object({
  paymentStatus: Joi.string().valid(...paymentStatusValues).required(),
  paymentMode: Joi.string().valid(...paymentModeValues).when('paymentStatus', {
    is: Joi.valid('paid', 'partial'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  paymentDate: Joi.date().optional(),
  invoiceNumber: Joi.string().trim().max(100).optional(),
  amountPaid: Joi.number().min(0).when('paymentStatus', {
    is: 'partial',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  amountPending: Joi.number().min(0).when('paymentStatus', {
    is: 'partial',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  paymentNotes: Joi.string().trim().max(500).optional()
});

// Bulk operation validation
export const bulkOperationValidation = Joi.object({
  itemIds: Joi.array().items(
    Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
  ).min(1).max(50).required(),
  operation: Joi.string().valid('delete', 'activate', 'deactivate', 'updateStatus').required(),
  data: Joi.object().optional()
});
