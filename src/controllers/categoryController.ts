import { NextFunction, Request, Response } from "express";
import ServiceCategory from "../models/ServiceCategory";

class CategoryController {
  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const categoryData = req.body;
      const userId = res.locals.user?.id;

      const category = new ServiceCategory({
        ...categoryData,
        createdBy: userId,
      });
      await category.save();
      res.status(201).json({
        success: true,
        message: "Service Category created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  static async readAllCategories(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // try {
    //   const {
    //     page = 1,
    //     limit = 10,
    //     search,
    //     isActive,
    //     sortBy = "sortOrder",
    //     sortOrder = "asc",
    //   } = req.query;

    //   const sort: any = {};
    //   sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    //   const skip = (page - 1) * limit;

    //   const categories = await ServiceCategory.find()
    //     .sort(sort)
    //     .skip(skip)
    //     .limit(limit)
    //     .populate("createdBy", "name email")
    //     .lean();
    //   const totalCount = await ServiceCategory.countDocuments();
    //   const stats = await ServiceCategory.aggregate([
    //     {
    //       $group: {
    //         _id: null,
    //         totalActive: { $sum: { $cond: ["$isActive", 1, 0] } },
    //         totalInactive: { $sum: { $cond: ["$isActive", 0, 1] } },
    //         totalServices: { $sum: "$serviceCount" },
    //       },
    //     },
    //   ]);

    //   const totalPages;
    // } catch (error) {
    //   next(error);
    // }
  }

  static async readCategory(req: Request, res: Response, next: NextFunction) {
    try {
    } catch (error) {
      next(error);
    }
  }

  static async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
    } catch (error) {
      next(error);
    }
  }

  static async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
    } catch (error) {
      next(error);
    }
  }
}

export default CategoryController;
