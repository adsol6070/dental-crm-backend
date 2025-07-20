import express from "express";
import { setupRoutes } from "./routes";
import { setupMiddleware } from "./middleware";
import logger from "./utils/logger";
import errorHandler from "./middleware/errorHandler";

const app = express();

setupMiddleware(app);

setupRoutes(app);

app.all(
  "*",
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.warn(`Route not found: ${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date().toISOString(),
    });

    const error = new Error(`Route ${req.originalUrl} not found`) as any;
    error.statusCode = 404;
    error.status = "fail";
    error.isOperational = true;

    next(error);
  }
);

app.use(errorHandler);

export default app;
