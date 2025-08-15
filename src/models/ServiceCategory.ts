import mongoose, { Document, Schema, Types } from "mongoose";

export interface IServiceCategory extends Document {
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  serviceCount: number;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const ServiceCategorySchema: Schema = new Schema<IServiceCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
      unique: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          return !v || /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
        },
        message: "Color must be a valid hex color code",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    serviceCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

const ServiceCategory = mongoose.model<IServiceCategory>(
  "ServiceCategory",
  ServiceCategorySchema
);

export default ServiceCategory;
