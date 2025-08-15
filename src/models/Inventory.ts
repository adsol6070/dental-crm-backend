import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Type definitions for implant material management
type ItemCategory = "Dental Implant" | "Abutment" | "Crown" | "Bridge" | "Dental Material" | "Instrument" | "Consumable" | "Equipment";
type ItemType = "Straumann BLX" | "Swiss" | "Dentium" | "Dentsply" | "Nobel" | "Osstem" | "MIS" | "Healing Abutment" | "Impression Material" | "Dental Cement" | "Composite Resin" | "Crown Material" | "Surgical Kit" | "Gloves" | "Other";
type Supplier = "The Dentist Shop" | "International Dental Systems" | "Vinit Enterprises" | "Kumar Dental" | "Sachdeva Gloves" | "NEO ENDO" | "Prashant Lab" | "Shankar Lab" | "Govind Lab";
type MaterialStatus = "in-stock" | "low-stock" | "out-of-stock" | "expired";
type PaymentStatus = "paid" | "pending" | "partial";
type PaymentMode = "Cash" | "Card" | "Bank Transfer" | "UPI" | "Cheque" | "Online" | "Other";
type Unit = "pieces" | "boxes" | "kits" | "bottles" | "tubes" | "sets";

// Enums for better type safety
export enum ItemCategoryEnum {
  IMPLANT = "Dental Implant",
  ABUTMENT = "Abutment",
  CROWN = "Crown",
  BRIDGE = "Bridge",
  MATERIAL = "Dental Material",
  INSTRUMENT = "Instrument",
  CONSUMABLE = "Consumable",
  EQUIPMENT = "Equipment"
}

export enum ItemTypeEnum {
  STRAUMAN_BLX = "Straumann BLX",
  SWISS = "Swiss",
  DENTIUM = "Dentium",
  DENTSPLY = "Dentsply",
  NOBEL = "Nobel",
  OSSTEM = "Osstem",
  MIS = "MIS",
  HEALING_ABUTMENT = "Healing Abutment",
  IMPRESSION_MATERIAL = "Impression Material",
  CEMENT = "Dental Cement",
  COMPOSITE = "Composite Resin",
  CROWN_MATERIAL = "Crown Material",
  SURGICAL_KIT = "Surgical Kit",
  GLOVES = "Gloves",
  OTHER = "Other"
}

export enum SupplierEnum {
  // Shops
  DENTIST_SHOP = "The Dentist Shop",
  INTERNATIONAL_DENTAL = "International Dental Systems",
  VINIT_ENTERPRISES = "Vinit Enterprises",
  KUMAR_DENTAL = "Kumar Dental",
  SACHDEVA_GLOVES = "Sachdeva Gloves",
  NEO_ENDO = "NEO ENDO",
  // Labs
  PRASHANT_LAB = "Prashant Lab",
  SHANKAR_LAB = "Shankar Lab",
  GOVIND_LAB = "Govind Lab"
}

export enum PaymentModeEnum {
  CASH = "Cash",
  CARD = "Card",
  BANK_TRANSFER = "Bank Transfer",
  UPI = "UPI",
  CHEQUE = "Cheque",
  ONLINE = "Online",
  OTHER = "Other"
}

// Enhanced ImplantMaterial interface
export interface IImplantMaterial {
  itemName: string; // Required
  category: ItemCategory; // Required
  type: ItemType; // Required
  implantBrand: string; // Required
  supplier: Supplier; // Required
  quantity: number; // Required
  unit: Unit; // Required
  unitPrice: number; // Required
  totalCost: number; // Auto-calculated
  receivedDate: Date; // Required
  expiryDate?: Date; // Optional
  batchNumber?: string; // Optional
  isActive: boolean;
  status: MaterialStatus; // Auto-calculated based on quantity/minimumStock
  description?: string; // Optional
  specifications?: string; // Optional
  storageConditions?: string; // Optional
  minimumStock: number; // Required
  paymentStatus: PaymentStatus; // Required
  paymentMode?: PaymentMode; // Optional
  paymentDate?: Date; // Optional
  invoiceNumber?: string; // Optional
  // New payment-related fields
  amountPaid?: number; // Required when paymentStatus is "partial"
  amountPending?: number; // Required when paymentStatus is "partial"
  paymentNotes?: string; // Optional - for additional payment details
  // System fields
  createdBy?: Types.ObjectId;
  lastUpdatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// ImplantMaterial document interface
export interface ImplantMaterialDocument extends IImplantMaterial, Document {
  _id: Types.ObjectId;
  fullItemName: string; // Virtual property
  searchableText: string; // Virtual property
  isExpired(): boolean;
  isLowStock(): boolean;
  updateStatus(): MaterialStatus;
  getFormattedPrice(): string;
  calculateTotalCost(): number;
  getPaymentSummary(): string; // New method for payment summary
  validatePaymentAmounts(): boolean; // New method to validate payment amounts
}

// ImplantMaterial model interface
export interface ImplantMaterialModel extends Model<ImplantMaterialDocument> {
  findByName(name: string): Promise<ImplantMaterialDocument | null>;
  findByCategory(category: ItemCategory): Promise<ImplantMaterialDocument[]>;
  findBySupplier(supplier: Supplier): Promise<ImplantMaterialDocument[]>;
  findActiveItems(): Promise<ImplantMaterialDocument[]>;
  findLowStockItems(): Promise<ImplantMaterialDocument[]>;
  findExpiredItems(): Promise<ImplantMaterialDocument[]>;
  searchItems(searchTerm: string): Promise<ImplantMaterialDocument[]>;
  createItem(itemData: Partial<IImplantMaterial>): Promise<ImplantMaterialDocument>;
  getItemsByType(type: ItemType): Promise<ImplantMaterialDocument[]>;
  getInventoryStats(): Promise<any>;
  findPendingPayments(): Promise<ImplantMaterialDocument[]>;
  findPartialPayments(): Promise<ImplantMaterialDocument[]>; // New method
}

// Mongoose schema
const implantMaterialSchema = new Schema<ImplantMaterialDocument, ImplantMaterialModel>(
  {
    itemName: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: [200, "Item name cannot exceed 200 characters"],
      index: true,
    },
    category: {
      type: String,
      enum: {
        values: Object.values(ItemCategoryEnum),
        message: "Invalid item category",
      },
      required: [true, "Item category is required"],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: Object.values(ItemTypeEnum),
        message: "Invalid item type",
      },
      required: [true, "Item type is required"],
      index: true,
    },
    implantBrand: {
      type: String,
      required: [true, "Implant brand is required"],
      trim: true,
      maxlength: [100, "Implant brand cannot exceed 100 characters"],
      index: true,
    },
    supplier: {
      type: String,
      enum: {
        values: Object.values(SupplierEnum),
        message: "Invalid supplier",
      },
      required: [true, "Supplier is required"],
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
      index: true,
    },
    unit: {
      type: String,
      required: [true, "Unit is required"],
      enum: {
        values: ["pieces", "boxes", "kits", "bottles", "tubes", "sets"],
        message: "Invalid unit",
      },
      default: "pieces",
    },
    unitPrice: {
      type: Number,
      required: [true, "Unit price is required"],
      min: [0, "Unit price cannot be negative"],
    },
    totalCost: {
      type: Number,
      required: [true, "Total cost is required"],
      min: [0, "Total cost cannot be negative"],
    },
    receivedDate: {
      type: Date,
      required: [true, "Received date is required"],
      index: true,
    },
    expiryDate: {
      type: Date,
      index: true,
    },
    batchNumber: {
      type: String,
      trim: true,
      maxlength: [50, "Batch number cannot exceed 50 characters"],
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ["in-stock", "low-stock", "out-of-stock", "expired"],
        message: "Invalid status",
      },
      default: "in-stock",
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    specifications: {
      type: String,
      trim: true,
      maxlength: [1000, "Specifications cannot exceed 1000 characters"],
    },
    storageConditions: {
      type: String,
      trim: true,
      maxlength: [500, "Storage conditions cannot exceed 500 characters"],
    },
    minimumStock: {
      type: Number,
      required: [true, "Minimum stock is required"],
      min: [0, "Minimum stock cannot be negative"],
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: {
        values: ["paid", "pending", "partial"],
        message: "Invalid payment status",
      },
      required: [true, "Payment status is required"],
      default: "pending",
      index: true,
    },
    paymentMode: {
      type: String,
      enum: {
        values: Object.values(PaymentModeEnum),
        message: "Invalid payment mode",
      },
      required: function() { 
        return this.paymentStatus === 'paid' || this.paymentStatus === 'partial'; 
      },
    },
    paymentDate: {
      type: Date,
      index: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      maxlength: [100, "Invoice number cannot exceed 100 characters"],
      index: true,
    },
    // New payment-related fields
    amountPaid: {
      type: Number,
      min: [0, "Amount paid cannot be negative"],
      required: function() { 
        return this.paymentStatus === 'partial'; 
      },
      validate: {
        validator: function(value: number) {
          if (this.paymentStatus === 'partial') {
            return value > 0 && value < this.totalCost;
          }
          if (this.paymentStatus === 'paid') {
            return value === this.totalCost;
          }
          return true;
        },
        message: "Amount paid must be valid for the payment status"
      }
    },
    amountPending: {
      type: Number,
      min: [0, "Amount pending cannot be negative"],
      required: function() { 
        return this.paymentStatus === 'partial'; 
      },
      validate: {
        validator: function(value: number) {
          if (this.paymentStatus === 'partial') {
            return value > 0 && ((this.amountPaid ?? 0) + value) === (this.totalCost ?? 0);
          }
          return true;
        },
        message: "Amount pending must equal total cost minus amount paid"
      }
    },
    paymentNotes: {
      type: String,
      trim: true,
      maxlength: [500, "Payment notes cannot exceed 500 characters"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc: ImplantMaterialDocument, ret: any): any {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// Indexes
implantMaterialSchema.index({
  itemName: "text",
  implantBrand: "text",
  batchNumber: "text",
  description: "text"
});
implantMaterialSchema.index({ category: 1, supplier: 1 });
implantMaterialSchema.index({ status: 1, isActive: 1 });
implantMaterialSchema.index({ type: 1, category: 1 });
implantMaterialSchema.index({ paymentStatus: 1, receivedDate: 1 });
implantMaterialSchema.index({ expiryDate: 1 });
implantMaterialSchema.index({ quantity: 1, minimumStock: 1 });
implantMaterialSchema.index({ amountPaid: 1, amountPending: 1 }); // New index

// Compound index for common queries
implantMaterialSchema.index({
  category: 1,
  supplier: 1,
  isActive: 1,
  status: 1
});

// Virtual for full item name
implantMaterialSchema.virtual("fullItemName").get(function (this: ImplantMaterialDocument): string {
  return `${this.itemName} (${this.implantBrand})`.trim();
});

// Virtual for searchable text
implantMaterialSchema.virtual("searchableText").get(function (this: ImplantMaterialDocument): string {
  const searchFields = [
    this.itemName,
    this.implantBrand,
    this.batchNumber,
    this.category,
    this.type,
    this.supplier
  ].filter(Boolean);

  return searchFields.join(" ").toLowerCase();
});

// Pre-save middleware for auto-calculations
implantMaterialSchema.pre<ImplantMaterialDocument>("save", async function (next): Promise<void> {
  // Calculate total cost
  if (this.isModified("quantity") || this.isModified("unitPrice")) {
    this.totalCost = this.quantity * this.unitPrice;
  }

  // Auto-calculate payment amounts based on payment status
  if (this.isModified("paymentStatus")) {
    if (this.paymentStatus === 'paid') {
      this.amountPaid = this.totalCost;
      this.amountPending = 0;
    } else if (this.paymentStatus === 'pending') {
      this.amountPaid = 0;
      this.amountPending = this.totalCost;
    }
    // For partial, amounts should be set explicitly by user
  }

  // Update status based on stock levels and expiry
  this.status = this.updateStatus();

  // Set isActive to false if out of stock or expired
  if (this.status === "out-of-stock" || this.status === "expired") {
    if (this.isModified("status") && !this.isModified("isActive")) {
      this.isActive = false;
    }
  }

  next();
});

// Instance methods
implantMaterialSchema.methods.isExpired = function (this: ImplantMaterialDocument): boolean {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
};

implantMaterialSchema.methods.isLowStock = function (this: ImplantMaterialDocument): boolean {
  return this.quantity <= this.minimumStock && this.quantity > 0;
};

implantMaterialSchema.methods.updateStatus = function (this: ImplantMaterialDocument): MaterialStatus {
  if (this.isExpired()) return "expired";
  if (this.quantity === 0) return "out-of-stock";
  if (this.isLowStock()) return "low-stock";
  return "in-stock";
};

implantMaterialSchema.methods.getFormattedPrice = function (this: ImplantMaterialDocument): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(this.unitPrice);
};

implantMaterialSchema.methods.calculateTotalCost = function (this: ImplantMaterialDocument): number {
  return this.quantity * this.unitPrice;
};

// New method for payment summary
implantMaterialSchema.methods.getPaymentSummary = function (this: ImplantMaterialDocument): string {
  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  switch (this.paymentStatus) {
    case 'paid':
      return `Fully Paid: ${formatCurrency(this.totalCost)}`;
    case 'pending':
      return `Pending: ${formatCurrency(this.totalCost)}`;
    case 'partial':
      return `Paid: ${formatCurrency(this.amountPaid || 0)} | Pending: ${formatCurrency(this.amountPending || 0)}`;
    default:
      return 'Unknown Payment Status';
  }
};

// New method to validate payment amounts
implantMaterialSchema.methods.validatePaymentAmounts = function (this: ImplantMaterialDocument): boolean {
  if (this.paymentStatus === 'partial') {
    return (this.amountPaid || 0) + (this.amountPending || 0) === this.totalCost;
  }
  return true;
};

// Static methods (keeping all existing ones and adding new ones)
implantMaterialSchema.statics.findByName = function (
  this: ImplantMaterialModel,
  name: string
): Promise<ImplantMaterialDocument | null> {
  return this.findOne({
    itemName: new RegExp(name, "i"),
    isActive: true
  }).exec();
};

implantMaterialSchema.statics.findByCategory = function (
  this: ImplantMaterialModel,
  category: ItemCategory
): Promise<ImplantMaterialDocument[]> {
  return this.find({
    category,
    isActive: true
  }).sort({ itemName: 1 }).exec();
};

implantMaterialSchema.statics.findBySupplier = function (
  this: ImplantMaterialModel,
  supplier: Supplier
): Promise<ImplantMaterialDocument[]> {
  return this.find({
    supplier,
    isActive: true
  }).sort({ itemName: 1 }).exec();
};

implantMaterialSchema.statics.findActiveItems = function (this: ImplantMaterialModel): Promise<ImplantMaterialDocument[]> {
  return this.find({
    isActive: true
  }).sort({ itemName: 1 }).exec();
};

implantMaterialSchema.statics.findLowStockItems = function (this: ImplantMaterialModel): Promise<ImplantMaterialDocument[]> {
  return this.find({
    isActive: true,
    status: "low-stock"
  }).sort({ quantity: 1 }).exec();
};

implantMaterialSchema.statics.findExpiredItems = function (this: ImplantMaterialModel): Promise<ImplantMaterialDocument[]> {
  return this.find({
    isActive: true,
    status: "expired"
  }).sort({ expiryDate: 1 }).exec();
};

implantMaterialSchema.statics.searchItems = function (
  this: ImplantMaterialModel,
  searchTerm: string
): Promise<ImplantMaterialDocument[]> {
  return this.find({
    $and: [
      { isActive: true },
      {
        $or: [
          { itemName: new RegExp(searchTerm, "i") },
          { implantBrand: new RegExp(searchTerm, "i") },
          { batchNumber: new RegExp(searchTerm, "i") },
          { description: new RegExp(searchTerm, "i") }
        ]
      }
    ]
  }).sort({ itemName: 1 }).exec();
};

implantMaterialSchema.statics.createItem = async function (
  this: ImplantMaterialModel,
  itemData: Partial<IImplantMaterial>
): Promise<ImplantMaterialDocument> {
  const item = new this({
    ...itemData,
    isActive: itemData.isActive !== undefined ? itemData.isActive : true,
    totalCost: (itemData.quantity || 0) * (itemData.unitPrice || 0),
  });

  return item.save();
};

implantMaterialSchema.statics.getItemsByType = function (
  this: ImplantMaterialModel,
  type: ItemType
): Promise<ImplantMaterialDocument[]> {
  return this.find({
    type,
    isActive: true
  }).sort({ itemName: 1 }).exec();
};

implantMaterialSchema.statics.getInventoryStats = async function (this: ImplantMaterialModel): Promise<any> {
  const stats = await this.aggregate([
    {
      $match: { isActive: true }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        inStock: {
          $sum: { $cond: [{ $eq: ["$status", "in-stock"] }, 1, 0] }
        },
        lowStock: {
          $sum: { $cond: [{ $eq: ["$status", "low-stock"] }, 1, 0] }
        },
        outOfStock: {
          $sum: { $cond: [{ $eq: ["$status", "out-of-stock"] }, 1, 0] }
        },
        expired: {
          $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] }
        },
        totalValue: { $sum: "$totalCost" },
        pendingPayments: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, 1, 0] }
        },
        partialPayments: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "partial"] }, 1, 0] }
        },
        totalAmountPending: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "pending"] }, "$totalCost", "$amountPending"] }
        }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
    expired: 0,
    totalValue: 0,
    pendingPayments: 0,
    partialPayments: 0,
    totalAmountPending: 0
  };
};

implantMaterialSchema.statics.findPendingPayments = function (this: ImplantMaterialModel): Promise<ImplantMaterialDocument[]> {
  return this.find({
    paymentStatus: "pending",
    isActive: true
  }).sort({ receivedDate: 1 }).exec();
};

// New method to find partial payments
implantMaterialSchema.statics.findPartialPayments = function (this: ImplantMaterialModel): Promise<ImplantMaterialDocument[]> {
  return this.find({
    paymentStatus: "partial",
    isActive: true
  }).sort({ receivedDate: 1 }).exec();
};

// Create and export the model
const ImplantMaterial: ImplantMaterialModel = mongoose.model<ImplantMaterialDocument, ImplantMaterialModel>("ImplantMaterial", implantMaterialSchema);

export default ImplantMaterial;
