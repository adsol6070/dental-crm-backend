// controllers/serviceCategoryController.ts
import { Request, Response, NextFunction } from "express";
import ServiceCategory, { IServiceCategory } from "../models/ServiceCategory";
import logger from "../utils/logger";
import { AppError } from "../types/errors";

// Types for request bodies
interface CreateCategoryBody {
  name: string;
  description: string;
  color?: string;
  isActive?: boolean;
}

interface UpdateCategoryBody {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
}

interface UpdateCategoryStatusBody {
  isActive: boolean;
  reason?: string;
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

class ServiceCategoryController {
  // Create new service category
  static async createCategory(
    req: Request,
    res: Response<ApiResponse<{ category: IServiceCategory }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = req.body as CreateCategoryBody;

      // Check if category with same name already exists
      const existingCategory = await ServiceCategory.findOne({
        name: { $regex: new RegExp(`^${data.name}$`, "i") },
      });

      if (existingCategory) {
        throw new AppError(
          "Service category with this name already exists",
          409
        );
      }

      // Create new category
      const category = new ServiceCategory({
        name: data.name.trim(),
        description: data.description.trim(),
        color: data.color || "#007bff",
        isActive: data.isActive ?? true,
        createdBy: res.locals.user?.id,
      });

      await category.save();

      logger.info(`New service category created: ${category.name}`, {
        categoryId: category._id,
        name: category.name,
        createdBy: res.locals.user?.id,
      });

      res.status(201).json({
        success: true,
        message: "Service category created successfully",
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all service categories
  static async getAllCategories(
    req: Request,
    res: Response<ApiResponse<{ categories: IServiceCategory[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.query || {};
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 20;
      const search = query.search ? String(query.search) : undefined;
      const status = query.status ? String(query.status) : "all";
      const sortBy = query.sortBy ? String(query.sortBy) : "createdAt";
      const sortOrder = query.sortOrder ? String(query.sortOrder) : "desc";
      const includeInactive = query.includeInactive === "true" || false;

      const filter: any = {};

      // Apply status filter
      if (status === "active") {
        filter.isActive = true;
      } else if (status === "inactive") {
        filter.isActive = false;
      } else if (!includeInactive) {
        filter.isActive = true; // Default to active only
      }

      // Search functionality
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const sort: Record<string, 1 | -1> = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1; // ✅ no TS error now

      const categories = await ServiceCategory.find(filter)
        .populate("createdBy", "personalInfo.firstName personalInfo.lastName")
        .populate("updatedBy", "personalInfo.firstName personalInfo.lastName")
        .sort(sort)
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      const total = await ServiceCategory.countDocuments(filter);

      res.json({
        success: true,
        data: { categories: categories as IServiceCategory[] },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get active categories (for public use)
  static async getActiveCategories(
    req: Request,
    res: Response<ApiResponse<{ categories: IServiceCategory[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const categories = await ServiceCategory.find({ isActive: true })
        .select("name description color serviceCount")
        .sort({ name: 1 })
        .lean();

      res.json({
        success: true,
        data: { categories: categories as IServiceCategory[] },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get category by ID
  static async getCategoryById(
    req: Request,
    res: Response<ApiResponse<{ category: IServiceCategory }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { categoryId } = req.params;

      const category = await ServiceCategory.findById(categoryId)
        .populate("createdBy", "personalInfo.firstName personalInfo.lastName")
        .populate("updatedBy", "personalInfo.firstName personalInfo.lastName");

      if (!category) {
        throw new AppError("Service category not found", 404);
      }

      res.json({
        success: true,
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update service category
  static async updateCategory(
    req: Request,
    res: Response<ApiResponse<{ category: IServiceCategory }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { categoryId } = req.params;
      const updateData = req.body as UpdateCategoryBody;

      // Check if name is being updated and if it conflicts with existing category
      if (updateData.name) {
        const existingCategory = await ServiceCategory.findOne({
          name: { $regex: new RegExp(`^${updateData.name}$`, "i") },
          _id: { $ne: categoryId },
        });

        if (existingCategory) {
          throw new AppError(
            "Service category with this name already exists",
            409
          );
        }
      }

      // Add updatedBy field
      const finalUpdateData = {
        ...updateData,
        updatedBy: res.locals.user?.id,
      };

      const category = await ServiceCategory.findByIdAndUpdate(
        categoryId,
        finalUpdateData,
        { new: true, runValidators: true }
      ).populate(
        "createdBy updatedBy",
        "personalInfo.firstName personalInfo.lastName"
      );

      if (!category) {
        throw new AppError("Service category not found", 404);
      }

      logger.info(`Service category updated: ${category.name}`, {
        categoryId: category._id,
        updatedFields: Object.keys(updateData),
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Service category updated successfully",
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update category status
  static async updateCategoryStatus(
    req: Request,
    res: Response<ApiResponse<{ category: IServiceCategory }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { categoryId } = req.params;
      const { isActive, reason } = req.body as UpdateCategoryStatusBody;

      const category = await ServiceCategory.findByIdAndUpdate(
        categoryId,
        {
          isActive,
          updatedBy: res.locals.user?.id,
          ...(reason && { statusUpdateReason: reason }),
          statusUpdatedAt: new Date(),
        } as any,
        { new: true, runValidators: true }
      ).populate(
        "createdBy updatedBy",
        "personalInfo.firstName personalInfo.lastName"
      );

      if (!category) {
        throw new AppError("Service category not found", 404);
      }

      logger.info(`Service category status updated: ${category.name}`, {
        categoryId: category._id,
        newStatus: isActive ? "active" : "inactive",
        reason,
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: `Service category ${
          isActive ? "activated" : "deactivated"
        } successfully`,
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete service category
  static async deleteCategory(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { categoryId } = req.params;

      const category = await ServiceCategory.findById(categoryId);

      if (!category) {
        throw new AppError("Service category not found", 404);
      }

      // Check if category has associated services
      if (category.serviceCount > 0) {
        throw new AppError(
          "Cannot delete category with associated services. Please move or delete services first.",
          400
        );
      }

      await ServiceCategory.findByIdAndDelete(categoryId);

      logger.info(`Service category deleted: ${category.name}`, {
        categoryId: category._id,
        deletedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Service category deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Search categories
  static async searchCategories(
    req: Request,
    res: Response<ApiResponse<{ categories: IServiceCategory[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { q, limit = 10, activeOnly = true } = req.query || {};

      if (!q) {
        throw new AppError("Search query is required", 400);
      }

      const filter: any = {
        $or: [
          { name: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
        ],
      };

      if (activeOnly) {
        filter.isActive = true;
      }

      const categories = await ServiceCategory.find(filter)
        .select("name description color serviceCount isActive")
        .limit(Number(limit))
        .sort({ name: 1 })
        .lean();

      res.json({
        success: true,
        data: { categories: categories as IServiceCategory[] },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get category statistics
  static async getCategoryStatistics(
    req: Request,
    res: Response<ApiResponse<{ statistics: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const stats = await ServiceCategory.aggregate([
        {
          $group: {
            _id: null,
            totalCategories: { $sum: 1 },
            activeCategories: {
              $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
            },
            inactiveCategories: {
              $sum: { $cond: [{ $eq: ["$isActive", false] }, 1, 0] },
            },
            totalServices: { $sum: "$serviceCount" },
            averageServicesPerCategory: { $avg: "$serviceCount" },
            categoriesWithServices: {
              $sum: { $cond: [{ $gt: ["$serviceCount", 0] }, 1, 0] },
            },
            categoriesWithoutServices: {
              $sum: { $cond: [{ $eq: ["$serviceCount", 0] }, 1, 0] },
            },
          },
        },
      ]);

      const statistics = stats[0] || {
        totalCategories: 0,
        activeCategories: 0,
        inactiveCategories: 0,
        totalServices: 0,
        averageServicesPerCategory: 0,
        categoriesWithServices: 0,
        categoriesWithoutServices: 0,
      };

      // Calculate utilization rate
      statistics.utilizationRate =
        statistics.totalCategories > 0
          ? (
              (statistics.categoriesWithServices / statistics.totalCategories) *
              100
            ).toFixed(1)
          : "0";

      // Round average
      statistics.averageServicesPerCategory =
        Math.round((statistics.averageServicesPerCategory || 0) * 100) / 100;

      res.json({
        success: true,
        data: { statistics },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get categories with service counts
  static async getCategoriesWithServiceCounts(
    req: Request,
    res: Response<ApiResponse<{ categories: any[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      // This would require a services collection to get actual counts
      // For now, using the serviceCount field from the category model
      const categories = await ServiceCategory.find({ isActive: true })
        .select("name description color serviceCount")
        .sort({ serviceCount: -1, name: 1 })
        .lean();

      res.json({
        success: true,
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk update categories
  static async bulkUpdateCategories(
    req: Request,
    res: Response<ApiResponse<{ updatedCount: number }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { categoryIds, updateData } = req.validatedData;

      if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
        throw new AppError("Category IDs array is required", 400);
      }

      const finalUpdateData = {
        ...updateData,
        updatedBy: res.locals.user?.id,
      };

      const result = await ServiceCategory.updateMany(
        { _id: { $in: categoryIds } },
        finalUpdateData
      );

      logger.info(
        `Bulk update performed on ${result.modifiedCount} categories`,
        {
          categoryIds,
          updateData,
          updatedBy: res.locals.user?.id,
        }
      );

      res.json({
        success: true,
        message: `${result.modifiedCount} categories updated successfully`,
        data: { updatedCount: result.modifiedCount },
      });
    } catch (error) {
      next(error);
    }
  }

  // Reorder categories (for display order)
  static async reorderCategories(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { categoryOrder } = req.validatedData;

      if (!Array.isArray(categoryOrder)) {
        throw new AppError("Category order array is required", 400);
      }

      // Update display order for each category
      const updatePromises = categoryOrder.map((item: any, index: number) => {
        return ServiceCategory.findByIdAndUpdate(item.categoryId, {
          displayOrder: index + 1,
          updatedBy: res.locals.user?.id,
        } as any);
      });

      await Promise.all(updatePromises);

      logger.info(`Categories reordered`, {
        categoryCount: categoryOrder.length,
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Categories reordered successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Check if category name exists
  static async checkCategoryNameExists(
    req: Request,
    res: Response<ApiResponse<{ exists: boolean }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { name, excludeId } = req.validatedData;

      const filter: any = {
        name: { $regex: new RegExp(`^${name}$`, "i") },
      };

      if (excludeId) {
        filter._id = { $ne: excludeId };
      }

      const category = await ServiceCategory.findOne(filter);

      res.json({
        success: true,
        data: { exists: !!category },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get category usage analytics
  static async getCategoryAnalytics(
    req: Request,
    res: Response<ApiResponse<{ analytics: any }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { period = "month", year = new Date().getFullYear() } =
        req.validatedQuery || {};

      // Get category creation trends
      let groupBy: any;
      if (period === "month") {
        groupBy = { $month: "$createdAt" };
      } else if (period === "week") {
        groupBy = { $week: "$createdAt" };
      } else {
        groupBy = { $dayOfYear: "$createdAt" };
      }

      const dateRange = {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`),
      };

      const creationTrends = await ServiceCategory.aggregate([
        { $match: { createdAt: dateRange } },
        {
          $group: {
            _id: groupBy,
            count: { $sum: 1 },
            activeCount: {
              $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Get most popular categories by service count
      const popularCategories = await ServiceCategory.find()
        .select("name serviceCount")
        .sort({ serviceCount: -1 })
        .limit(10)
        .lean();

      const analytics = {
        creationTrends,
        popularCategories,
        period,
        year,
      };

      res.json({
        success: true,
        data: { analytics },
      });
    } catch (error) {
      next(error);
    }
  }

  // Export categories data
  static async exportCategories(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { format = "json", includeInactive = false } = req.body || {};

      const filter: any = {};
      if (!includeInactive) {
        filter.isActive = true;
      }

      const categories = await ServiceCategory.find(filter)
        .populate("createdBy", "personalInfo.firstName personalInfo.lastName")
        .populate("updatedBy", "personalInfo.firstName personalInfo.lastName")
        .select("-__v")
        .sort({ name: 1 })
        .lean();

      const exportData = {
        categories,
        exportedAt: new Date().toISOString(),
        totalCount: categories.length,
        exportedBy: res.locals.user?.id,
      };

      logger.info(`Categories data exported`, {
        format,
        count: categories.length,
        exportedBy: res.locals.user?.id,
      });

      if (format === "csv") {
        // Convert to CSV format (you might want to use a CSV library)
        const csvData = categories.map((cat) => ({
          name: cat.name,
          description: cat.description,
          color: cat.color,
          isActive: cat.isActive,
          serviceCount: cat.serviceCount,
          createdAt: cat.createdAt,
        }));

        res.json({
          success: true,
          message: "Categories exported successfully",
          data: { categories: csvData, format: "csv" },
        });
      } else {
        res.json({
          success: true,
          message: "Categories exported successfully",
          data: exportData,
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

export default ServiceCategoryController;
