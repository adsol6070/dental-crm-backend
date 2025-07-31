import mongoose, { Schema, Document, Model, Types } from "mongoose";
import bcrypt from "bcryptjs";

// Simple type definitions
type UserRole = "super_admin" | "admin" | "moderator" | "staff" | "doctor" | "nurse" | "receptionist";
type UserStatus = "active" | "inactive" | "suspended";

// Simple permissions for dental clinic
export enum Permission {
    // Patient management
    PATIENTS_VIEW = "patients.view",
    PATIENTS_CREATE = "patients.create",
    PATIENTS_EDIT = "patients.edit",
    PATIENTS_DELETE = "patients.delete",

    // Doctor management
    DOCTORS_VIEW = "doctors.view",
    DOCTORS_CREATE = "doctors.create",
    DOCTORS_EDIT = "doctors.edit",
    DOCTORS_DELETE = "doctors.delete",

    // Appointment management
    APPOINTMENTS_VIEW = "appointments.view",
    APPOINTMENTS_CREATE = "appointments.create",
    APPOINTMENTS_EDIT = "appointments.edit",
    APPOINTMENTS_DELETE = "appointments.delete",

    // Reports
    REPORTS_VIEW = "reports.view",
    REPORTS_EXPORT = "reports.export",

    // System settings
    SETTINGS_MANAGE = "settings.manage",
    USERS_MANAGE = "users.manage",
}

// Enhanced User interface
export interface IUser {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role: UserRole;
    status: UserStatus;
    permissions: Permission[];
    password: string;
    lastLogin?: Date;
    isActive: boolean;
    // New fields for enhanced functionality
    mustChangePassword: boolean;
    tempPassword: boolean;
    twoFactorEnabled: boolean;
    twoFactorSecret?: string;
    createdBy?: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

// User document interface
export interface UserDocument extends IUser, Document {
    _id: Types.ObjectId;
    fullName: string; // Virtual property
    comparePassword(candidatePassword: string): Promise<boolean>;
    hasPermission(permission: Permission): boolean;
}

// User model interface
export interface UserModel extends Model<UserDocument> {
    findByEmail(email: string): Promise<UserDocument | null>;
    findByRole(role: UserRole): Promise<UserDocument[]>;
    findActiveUsers(): Promise<UserDocument[]>;
    createUser(userData: Partial<IUser>): Promise<UserDocument>;
    getDefaultPermissions(role: UserRole): Permission[];
}

// Mongoose schema
const userSchema = new Schema<UserDocument, UserModel>(
    {
        firstName: {
            type: String,
            required: [true, "First name is required"],
            trim: true,
            maxlength: [50, "First name cannot exceed 50 characters"],
        },
        lastName: {
            type: String,
            required: [true, "Last name is required"],
            trim: true,
            maxlength: [50, "Last name cannot exceed 50 characters"],
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            validate: {
                validator: (email: string): boolean => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(email);
                },
                message: "Please provide a valid email address",
            },
        },
        phone: {
            type: String,
            trim: true,
            validate: {
                validator: function (phone: string): boolean {
                    if (!phone) return true;
                    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,15}$/;
                    return phoneRegex.test(phone);
                },
                message: "Please provide a valid phone number",
            },
        },
        role: {
            type: String,
            enum: {
                values: ["super_admin", "admin", "moderator", "staff", "doctor", "nurse", "receptionist"],
                message: "Invalid user role",
            },
            required: [true, "User role is required"],
            default: "staff",
        },
        status: {
            type: String,
            enum: {
                values: ["active", "inactive", "suspended"],
                message: "Invalid user status",
            },
            default: "active",
        },
        permissions: {
            type: [String],
            enum: {
                values: Object.values(Permission),
                message: "Invalid permission",
            },
            default: [],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
            select: false, // Don't include in queries by default
        },
        lastLogin: {
            type: Date,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // New fields for enhanced functionality
        mustChangePassword: {
            type: Boolean,
            default: false,
            index: true,
        },
        tempPassword: {
            type: Boolean,
            default: false,
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false,
            index: true,
        },
        twoFactorSecret: {
            type: String,
            select: false, // Don't include in queries by default
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: function (doc: UserDocument, ret: any): any {
                delete ret.password;
                delete ret.twoFactorSecret;
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// Indexes
userSchema.index({ role: 1, status: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdBy: 1 });
userSchema.index({ createdAt: 1 });

// Virtual for full name
userSchema.virtual("fullName").get(function (this: UserDocument): string {
    return `${this.firstName} ${this.lastName}`.trim();
});

// Pre-save middleware to hash password
userSchema.pre<UserDocument>("save", async function (next): Promise<void> {
    if (this.isModified("password")) {
        this.password = await bcrypt.hash(this.password, 12);
    }

    // Set default permissions based on role
    if (this.isModified("role") && this.permissions.length === 0) {
        this.permissions = User.getDefaultPermissions(this.role);
    }

    next();
});

// Instance methods
userSchema.methods.comparePassword = async function (
    this: UserDocument,
    candidatePassword: string
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.hasPermission = function (
    this: UserDocument,
    permission: Permission
): boolean {
    if (this.role === "super_admin") return true;
    return this.permissions.includes(permission);
};

// Static methods
userSchema.statics.findByEmail = function (
    this: UserModel,
    email: string
): Promise<UserDocument | null> {
    return this.findOne({ email: email.toLowerCase() }).exec();
};

userSchema.statics.findByRole = function (
    this: UserModel,
    role: UserRole
): Promise<UserDocument[]> {
    return this.find({ role, isActive: true }).exec();
};

userSchema.statics.findActiveUsers = function (this: UserModel): Promise<UserDocument[]> {
    return this.find({ status: "active", isActive: true }).exec();
};

userSchema.statics.createUser = async function (
    this: UserModel,
    userData: Partial<IUser>
): Promise<UserDocument> {
    const user = new this({
        ...userData,
        permissions: userData.permissions || this.getDefaultPermissions(userData.role || "staff"),
    });

    return user.save();
};

userSchema.statics.getDefaultPermissions = function (
    this: UserModel,
    role: UserRole
): Permission[] {
    const defaultPermissions: Record<UserRole, Permission[]> = {
        super_admin: [], // Super admin gets all permissions automatically
        admin: [
            Permission.PATIENTS_VIEW,
            Permission.PATIENTS_CREATE,
            Permission.PATIENTS_EDIT,
            Permission.PATIENTS_DELETE,
            Permission.DOCTORS_VIEW,
            Permission.DOCTORS_CREATE,
            Permission.DOCTORS_EDIT,
            Permission.DOCTORS_DELETE,
            Permission.APPOINTMENTS_VIEW,
            Permission.APPOINTMENTS_CREATE,
            Permission.APPOINTMENTS_EDIT,
            Permission.APPOINTMENTS_DELETE,
            Permission.REPORTS_VIEW,
            Permission.REPORTS_EXPORT,
            Permission.USERS_MANAGE,
        ],
        moderator: [
            Permission.PATIENTS_VIEW,
            Permission.PATIENTS_EDIT,
            Permission.DOCTORS_VIEW,
            Permission.DOCTORS_EDIT,
            Permission.APPOINTMENTS_VIEW,
            Permission.APPOINTMENTS_EDIT,
            Permission.REPORTS_VIEW,
        ],
        staff: [
            Permission.PATIENTS_VIEW,
            Permission.DOCTORS_VIEW,
            Permission.APPOINTMENTS_VIEW,
            Permission.APPOINTMENTS_CREATE,
            Permission.REPORTS_VIEW,
        ],
        doctor: [
            Permission.PATIENTS_VIEW,
            Permission.PATIENTS_CREATE,
            Permission.PATIENTS_EDIT,
            Permission.DOCTORS_VIEW,
            Permission.APPOINTMENTS_VIEW,
            Permission.APPOINTMENTS_CREATE,
            Permission.APPOINTMENTS_EDIT,
            Permission.REPORTS_VIEW,
        ],
        nurse: [
            Permission.PATIENTS_VIEW,
            Permission.PATIENTS_EDIT,
            Permission.DOCTORS_VIEW,
            Permission.APPOINTMENTS_VIEW,
            Permission.APPOINTMENTS_CREATE,
            Permission.REPORTS_VIEW,
        ],
        receptionist: [
            Permission.PATIENTS_VIEW,
            Permission.PATIENTS_CREATE,
            Permission.PATIENTS_EDIT,
            Permission.DOCTORS_VIEW,
            Permission.APPOINTMENTS_VIEW,
            Permission.APPOINTMENTS_CREATE,
            Permission.APPOINTMENTS_EDIT,
        ],
    };

    return defaultPermissions[role] || [];
};

// Create and export the model
const User: UserModel = mongoose.model<UserDocument, UserModel>("User", userSchema);

export default User;