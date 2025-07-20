import { Request, Response, Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import logger from "../utils/logger";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Check database connection
      const dbStatus =
        mongoose.connection.readyState === 1 ? "connected" : "disconnected";

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryInMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      };

      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        database: dbStatus,
        memory: memoryInMB,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
      });
    } catch (error) {
      logger.error("Health check failed:", error);
      res.status(500).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      });
    }
  })
);

export default router;
