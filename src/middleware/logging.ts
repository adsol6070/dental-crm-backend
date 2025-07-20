import { Application, Request, Response } from "express";
import morgan from "morgan";
import { config } from "../config/environment";
import logger from "../utils/logger";

export const setupLogging = (app: Application): void => {
  // Skip logging for health checks in production
  const skip = (req: Request, res: Response) => {
    if (config.nodeEnv === "production" && req.originalUrl === "/health") {
      return true;
    }
    return false;
  };

  // Development logging format
  if (config.nodeEnv === "development") {
    // Development logging format
    app.use(
      morgan("dev", {
        skip,
        stream: {
          write: (message: string) => {
            // Remove the newline and log through winston
            logger.info(message.trim());
          },
        },
      })
    );
  } else {
    // Production logging format
    app.use(
      morgan(
        ':remote-addr - :user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time-formatted',
        {
          skip,
          stream: {
            write: (message: string) => {
              logger.info(message.trim());
            },
          },
        }
      )
    );
  }

  logger.info("✅ Logging middleware configured");
};
