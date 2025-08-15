// controllers/medicineController.ts
import { Request, Response, NextFunction } from "express";
import Medicine, { IMedicine, MedicineDocument } from "../models/Medicine";
import logger from "../utils/logger";
import { AppError } from "../types/errors";

// Types for request bodies
interface CreateMedicineBody {
  medicineName: string;
  genericName?: string;
  brandName?: string;
  category: string;
  dentalUse: string;
  dosageForm: string;
  strength: string;
  unit: string;
  manufacturer?: string;
  description?: string;
  dosageInstructions: string;
  prescriptionRequired?: boolean;
}

interface UpdateMedicineBody extends Partial<CreateMedicineBody> {}

interface UpdateMedicineStatusBody {
  status: string;
  isActive: boolean;
}

interface SearchMedicinesQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  dentalUse?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// Response types
interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class MedicineController {
  // ==================== BASIC CRUD OPERATIONS ====================

  // Get all medicines
  static async getAllMedicines(
    req: Request,
    res: Response<ApiResponse<{ medicines: MedicineDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.query as SearchMedicinesQuery;
      const {
        page = 1,
        limit = 10,
        search,
        category,
        dentalUse,
        status,
        sortBy = "medicineName",
        sortOrder = "asc",
      } = query;

      const filter: any = {};

      // Apply basic filters
      if (category) filter.category = category;
      if (dentalUse) filter.dentalUse = dentalUse;
      if (status) filter.status = status;

      // Simple search functionality
      if (search) {
        filter.$or = [
          { medicineName: { $regex: search, $options: "i" } },
          { genericName: { $regex: search, $options: "i" } },
          { brandName: { $regex: search, $options: "i" } },
          { manufacturer: { $regex: search, $options: "i" } },
        ];
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const medicines = await Medicine.find(filter)
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .populate("createdBy", "firstName lastName email")
        .populate("lastUpdatedBy", "firstName lastName email")
        .lean();

      const total = await Medicine.countDocuments(filter);

      res.json({
        success: true,
        data: { medicines: medicines as MedicineDocument[] },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get medicine by ID
  static async getMedicineById(
    req: Request,
    res: Response<ApiResponse<{ medicine: MedicineDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { medicineId } = req.params;

      const medicine = await Medicine.findById(medicineId)
        .populate("createdBy", "firstName lastName email")
        .populate("lastUpdatedBy", "firstName lastName email");

      if (!medicine) {
        throw new AppError("Medicine not found", 404);
      }

      res.json({
        success: true,
        data: { medicine },
      });
    } catch (error) {
      next(error);
    }
  }

  // Create new medicine
  static async createMedicine(
    req: Request,
    res: Response<ApiResponse<{ medicine: MedicineDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const medicineData = req.body as CreateMedicineBody;

      // Check if medicine with same name and strength already exists
      const existingMedicine = await Medicine.findOne({
        medicineName: {
          $regex: `^${medicineData.medicineName}$`,
          $options: "i",
        },
        strength: medicineData.strength,
        unit: medicineData.unit,
        isActive: true,
      });

      if (existingMedicine) {
        throw new AppError(
          "Medicine with the same name, strength, and unit already exists",
          409
        );
      }

      // Create new medicine
      const medicine = new Medicine({
        ...medicineData,
        createdBy: res.locals.user?.id,
        lastUpdatedBy: res.locals.user?.id,
      });

      await medicine.save();

      // Populate the created medicine
      await medicine.populate(
        "createdBy lastUpdatedBy",
        "firstName lastName email"
      );

      logger.info(`New medicine created: ${medicine.medicineName}`, {
        medicineId: medicine._id,
        medicineName: medicine.medicineName,
        category: medicine.category,
        createdBy: res.locals.user?.id,
      });

      res.status(201).json({
        success: true,
        message: "Medicine created successfully",
        data: { medicine },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update medicine
  static async updateMedicine(
    req: Request,
    res: Response<ApiResponse<{ medicine: MedicineDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { medicineId } = req.params;
      const updateData = req.body as UpdateMedicineBody;

      // Check if updating name/strength conflicts with existing medicine
      if (updateData.medicineName || updateData.strength || updateData.unit) {
        const conflictFilter: any = {
          _id: { $ne: medicineId },
          isActive: true,
        };

        if (updateData.medicineName) {
          conflictFilter.medicineName = {
            $regex: `^${updateData.medicineName}$`,
            $options: "i",
          };
        }
        if (updateData.strength) conflictFilter.strength = updateData.strength;
        if (updateData.unit) conflictFilter.unit = updateData.unit;

        const existingMedicine = await Medicine.findOne(conflictFilter);

        if (existingMedicine) {
          throw new AppError(
            "Medicine with the same name, strength, and unit already exists",
            409
          );
        }
      }

      const medicine = await Medicine.findByIdAndUpdate(
        medicineId,
        {
          ...updateData,
          lastUpdatedBy: res.locals.user?.id,
        },
        { new: true, runValidators: true }
      ).populate("createdBy lastUpdatedBy", "firstName lastName email");

      if (!medicine) {
        throw new AppError("Medicine not found", 404);
      }

      logger.info(`Medicine updated: ${medicine.medicineName}`, {
        medicineId: medicine._id,
        medicineName: medicine.medicineName,
        updatedFields: Object.keys(updateData),
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Medicine updated successfully",
        data: { medicine },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update medicine status
  static async updateMedicineStatus(
    req: Request,
    res: Response<ApiResponse<{ medicine: MedicineDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { medicineId } = req.params;
      const { status, isActive } = req.body as UpdateMedicineStatusBody;

      const medicine = await Medicine.findByIdAndUpdate(
        medicineId,
        {
          status,
          isActive,
          lastUpdatedBy: res.locals.user?.id,
        },
        { new: true, runValidators: true }
      ).populate("createdBy lastUpdatedBy", "firstName lastName email");

      if (!medicine) {
        throw new AppError("Medicine not found", 404);
      }

      logger.info(`Medicine status updated: ${medicine.medicineName}`, {
        medicineId: medicine._id,
        newStatus: status,
        isActive,
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Medicine status updated successfully",
        data: { medicine },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete medicine
  static async deleteMedicine(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { medicineId } = req.params;

      const medicine = await Medicine.findByIdAndDelete(medicineId);

      if (!medicine) {
        throw new AppError("Medicine not found", 404);
      }

      logger.info(`Medicine hard deleted: ${medicine.medicineName}`, {
        medicineId: medicine._id,
        deletedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Medicine deleted permanently",
      });
    } catch (error) {
      next(error);
    }
  }
}

export default MedicineController;
