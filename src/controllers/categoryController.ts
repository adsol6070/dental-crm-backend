import { NextFunction, Request, Response } from "express";
import ServiceCategory from "../models/ServiceCategory";

class CategoryController {
  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, color, isActive } = req.body;
      const serviceCategory = new ServiceCategory({
        name,
        description,
        color,
        isActive,
      });
      await serviceCategory.save();
      res.status(201).json({
        success: true,
        message: "Service Category created successfully.",
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
    try {
    } catch (error) {
      next(error);
    }
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
