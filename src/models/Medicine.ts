// models/Medicine.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

// Type definitions for medicine management
type MedicineCategory = "Antibiotic" | "Pain Relief" | "Anti-inflammatory" | "Antiseptic" | "Anesthetic" | "Mouth Rinse" | "Fluoride Treatment" | "Vitamin/Supplement";
type DentalUseCategory = "Root Canal" | "Tooth Extraction" | "Dental Cleaning" | "Dental Filling" | "Gum Treatment" | "Oral Surgery" | "Preventive Care" | "General Treatment";
type DosageForm = "Tablet" | "Capsule" | "Liquid/Syrup" | "Gel" | "Ointment" | "Mouthwash" | "Drops";
type MedicineStatus = "active" | "inactive" | "discontinued";

// Enums for better type safety
export enum MedicineCategoryEnum {
    ANTIBIOTIC = "Antibiotic",
    PAIN_RELIEF = "Pain Relief",
    ANTI_INFLAMMATORY = "Anti-inflammatory",
    ANTISEPTIC = "Antiseptic",
    ANESTHETIC = "Anesthetic",
    MOUTH_RINSE = "Mouth Rinse",
    FLUORIDE_TREATMENT = "Fluoride Treatment",
    VITAMIN_SUPPLEMENT = "Vitamin/Supplement"
}

export enum DentalUseCategoryEnum {
    ROOT_CANAL = "Root Canal",
    TOOTH_EXTRACTION = "Tooth Extraction",
    DENTAL_CLEANING = "Dental Cleaning",
    DENTAL_FILLING = "Dental Filling",
    GUM_TREATMENT = "Gum Treatment",
    ORAL_SURGERY = "Oral Surgery",
    PREVENTIVE_CARE = "Preventive Care",
    GENERAL_TREATMENT = "General Treatment"
}

export enum DosageFormEnum {
    TABLET = "Tablet",
    CAPSULE = "Capsule",
    LIQUID_SYRUP = "Liquid/Syrup",
    GEL = "Gel",
    OINTMENT = "Ointment",
    MOUTHWASH = "Mouthwash",
    DROPS = "Drops"
}

// Enhanced Medicine interface - Updated to match modal fields exactly
export interface IMedicine {
    medicineName: string;           // Required field from modal
    genericName?: string;           // Optional field from modal
    brandName?: string;             // Optional field from modal
    category: MedicineCategory;     // Required field from modal
    dentalUse: DentalUseCategory;   // Required field from modal
    dosageForm: DosageForm;         // Required field from modal
    strength: string;               // Required field from modal
    unit: string;                   // Optional field from modal (defaults to 'mg')
    manufacturer?: string;          // Optional field from modal
    description?: string;           // Optional field from modal
    dosageInstructions: string;     // Required field from modal
    prescriptionRequired: boolean;  // Checkbox field from modal (defaults to true)
    status: MedicineStatus;
    isActive: boolean;
    // System fields
    createdBy?: Types.ObjectId;
    lastUpdatedBy?: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

// Medicine document interface
export interface MedicineDocument extends IMedicine, Document {
    _id: Types.ObjectId;
    fullMedicineName: string; // Virtual property
    searchableText: string; // Virtual property
    isExpiringSoon(): boolean;
    isAvailableForPrescription(): boolean;
    getFormattedStrength(): string;
}

// Medicine model interface
export interface MedicineModel extends Model<MedicineDocument> {
    findByName(name: string): Promise<MedicineDocument | null>;
    findByCategory(category: MedicineCategory): Promise<MedicineDocument[]>;
    findByDentalUse(dentalUse: DentalUseCategory): Promise<MedicineDocument[]>;
    findActiveMedicines(): Promise<MedicineDocument[]>;
    searchMedicines(searchTerm: string): Promise<MedicineDocument[]>;
    createMedicine(medicineData: Partial<IMedicine>): Promise<MedicineDocument>;
    getMedicinesByForm(dosageForm: DosageForm): Promise<MedicineDocument[]>;
    findSimilarMedicines(medicineId: string): Promise<MedicineDocument[]>;
}

// Mongoose schema - Updated validation to match modal requirements
const medicineSchema = new Schema<MedicineDocument, MedicineModel>(
    {
        medicineName: {
            type: String,
            required: [true, "Medicine name is required"],
            trim: true,
            maxlength: [100, "Medicine name cannot exceed 100 characters"],
            index: true,
        },
        genericName: {
            type: String,
            trim: true,
            maxlength: [100, "Generic name cannot exceed 100 characters"],
            index: true,
        },
        brandName: {
            type: String,
            trim: true,
            maxlength: [100, "Brand name cannot exceed 100 characters"],
            index: true,
        },
        category: {
            type: String,
            enum: {
                values: Object.values(MedicineCategoryEnum),
                message: "Invalid medicine category",
            },
            required: [true, "Medicine category is required"],
            index: true,
        },
        dentalUse: {
            type: String,
            enum: {
                values: Object.values(DentalUseCategoryEnum),
                message: "Invalid dental use category",
            },
            required: [true, "Dental use is required"],
            index: true,
        },
        dosageForm: {
            type: String,
            enum: {
                values: Object.values(DosageFormEnum),
                message: "Invalid dosage form",
            },
            required: [true, "Dosage form is required"],
            index: true,
        },
        strength: {
            type: String,
            required: [true, "Medicine strength is required"],
            trim: true,
            maxlength: [50, "Strength cannot exceed 50 characters"],
        },
        unit: {
            type: String,
            required: [true, "Medicine unit is required"],
            trim: true,
            maxlength: [20, "Unit cannot exceed 20 characters"],
            enum: {
                values: ["mg", "g", "ml", "mcg", "IU", "%", "units"],
                message: "Invalid unit",
            },
            default: "mg", // Default value as shown in modal
        },
        manufacturer: {
            type: String,
            trim: true,
            maxlength: [100, "Manufacturer name cannot exceed 100 characters"],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [1000, "Description cannot exceed 1000 characters"],
        },
        dosageInstructions: {
            type: String,
            required: [true, "Dosage instructions are required"],
            trim: true,
            maxlength: [500, "Dosage instructions cannot exceed 500 characters"],
        },
        prescriptionRequired: {
            type: Boolean,
            default: true, // Default to true as shown in modal
            index: true,
        },
        status: {
            type: String,
            enum: {
                values: ["active", "inactive", "discontinued"],
                message: "Invalid medicine status",
            },
            default: "active",
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
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
            transform: function (doc: MedicineDocument, ret: any): any {
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// All your existing indexes and methods remain the same...
medicineSchema.index({ 
    medicineName: "text", 
    genericName: "text", 
    brandName: "text",
    description: "text"
});
medicineSchema.index({ category: 1, dentalUse: 1 });
medicineSchema.index({ status: 1, isActive: 1 });
medicineSchema.index({ dosageForm: 1, category: 1 });
medicineSchema.index({ createdBy: 1 });
medicineSchema.index({ createdAt: 1 });
medicineSchema.index({ prescriptionRequired: 1 });

// Compound index for common queries
medicineSchema.index({ 
    category: 1, 
    dentalUse: 1, 
    isActive: 1, 
    status: 1 
});

// Virtual for full medicine name with strength
medicineSchema.virtual("fullMedicineName").get(function (this: MedicineDocument): string {
    return `${this.medicineName} ${this.strength}${this.unit}`.trim();
});

// Virtual for searchable text (combines all searchable fields)
medicineSchema.virtual("searchableText").get(function (this: MedicineDocument): string {
    const searchFields = [
        this.medicineName,
        this.genericName,
        this.brandName,
        this.manufacturer,
        this.category,
        this.dentalUse
    ].filter(Boolean);
    
    return searchFields.join(" ").toLowerCase();
});

// Pre-save middleware for data validation and formatting
medicineSchema.pre<MedicineDocument>("save", async function (next): Promise<void> {
    // Capitalize first letter of medicine name
    if (this.isModified("medicineName")) {
        this.medicineName = this.medicineName.charAt(0).toUpperCase() + this.medicineName.slice(1).toLowerCase();
    }

    // Set status to inactive if isActive is false
    if (this.isModified("isActive") && !this.isActive) {
        this.status = "inactive";
    }

    next();
});

// Instance methods
medicineSchema.methods.isExpiringSoon = function (this: MedicineDocument): boolean {
    return false;
};

medicineSchema.methods.isAvailableForPrescription = function (this: MedicineDocument): boolean {
    return this.isActive && this.status === "active";
};

medicineSchema.methods.getFormattedStrength = function (this: MedicineDocument): string {
    return `${this.strength} ${this.unit}`;
};

// All your existing static methods remain the same...
medicineSchema.statics.findByName = function (
    this: MedicineModel,
    name: string
): Promise<MedicineDocument | null> {
    return this.findOne({ 
        medicineName: new RegExp(name, "i"),
        isActive: true 
    }).exec();
};

medicineSchema.statics.findByCategory = function (
    this: MedicineModel,
    category: MedicineCategory
): Promise<MedicineDocument[]> {
    return this.find({ 
        category, 
        isActive: true,
        status: "active"
    }).sort({ medicineName: 1 }).exec();
};

medicineSchema.statics.findByDentalUse = function (
    this: MedicineModel,
    dentalUse: DentalUseCategory
): Promise<MedicineDocument[]> {
    return this.find({ 
        dentalUse, 
        isActive: true,
        status: "active"
    }).sort({ medicineName: 1 }).exec();
};

medicineSchema.statics.findActiveMedicines = function (this: MedicineModel): Promise<MedicineDocument[]> {
    return this.find({ 
        status: "active", 
        isActive: true 
    }).sort({ medicineName: 1 }).exec();
};

medicineSchema.statics.searchMedicines = function (
    this: MedicineModel,
    searchTerm: string
): Promise<MedicineDocument[]> {
    return this.find({
        $and: [
            { isActive: true },
            { status: "active" },
            {
                $or: [
                    { medicineName: new RegExp(searchTerm, "i") },
                    { genericName: new RegExp(searchTerm, "i") },
                    { brandName: new RegExp(searchTerm, "i") },
                    { manufacturer: new RegExp(searchTerm, "i") }
                ]
            }
        ]
    }).sort({ medicineName: 1 }).exec();
};

medicineSchema.statics.createMedicine = async function (
    this: MedicineModel,
    medicineData: Partial<IMedicine>
): Promise<MedicineDocument> {
    const medicine = new this({
        ...medicineData,
        status: medicineData.status || "active",
        isActive: medicineData.isActive !== undefined ? medicineData.isActive : true,
        prescriptionRequired: medicineData.prescriptionRequired !== undefined ? medicineData.prescriptionRequired : true,
    });

    return medicine.save();
};

medicineSchema.statics.getMedicinesByForm = function (
    this: MedicineModel,
    dosageForm: DosageForm
): Promise<MedicineDocument[]> {
    return this.find({ 
        dosageForm, 
        isActive: true,
        status: "active"
    }).sort({ medicineName: 1 }).exec();
};

medicineSchema.statics.findSimilarMedicines = function (
    this: MedicineModel,
    medicineId: string
): Promise<MedicineDocument[]> {
    return this.findById(medicineId).then((medicine) => {
        if (!medicine) return [];
        
        return this.find({
            $and: [
                { _id: { $ne: medicineId } },
                { isActive: true },
                { status: "active" },
                {
                    $or: [
                        { category: medicine.category },
                        { dentalUse: medicine.dentalUse },
                        { dosageForm: medicine.dosageForm }
                    ]
                }
            ]
        }).sort({ medicineName: 1 }).limit(5).exec();
    });
};

// Create and export the model
const Medicine: MedicineModel = mongoose.model<MedicineDocument, MedicineModel>("Medicine", medicineSchema);

export default Medicine;
