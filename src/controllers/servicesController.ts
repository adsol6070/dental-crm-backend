import { NextFunction, Request, Response } from "express";
import logger from "../utils/logger";
import { AppError } from "../types/errors";

class ServiceController {
  static async createService(req: Request, res: Response, next: NextFunction) {
    try {
      const {} = req.body;
    } catch (error) {
      next(error);
    }
  }
}

export default ServiceController;
