import mongoose, { Document, Schema } from "mongoose";

export interface IServiceCategory extends Document {
  name: string;
  description: string;
  color: string;
  isActive: boolean;
}

const ServiceCategorySchema: Schema = new Schema<IServiceCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
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
