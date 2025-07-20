import express, { Application } from "express";
import { config } from "../config/environment";
import logger from "../utils/logger";

export const setupBodyParsing = (app: Application): void => {
  // JSON body parsing with error handling
  app.use(
    express.json({
      limit: config.maxFileSize,
      // Custom JSON parsing with error handling
      verify: (req: any, res: any, buf: Buffer, encoding: string) => {
        try {
          // Attempt to parse JSON to validate it
          JSON.parse(buf.toString((encoding || "utf8") as BufferEncoding));
        } catch (err) {
          logger.error("JSON parsing error:", {
            error: err,
            body: buf
              .toString((encoding || "utf8") as BufferEncoding)
              .substring(0, 200), // Log first 200 chars
            ip: req.ip,
            userAgent: req.get("User-Agent"),
          });

          const error = new Error("Invalid JSON format") as any;
          error.statusCode = 400;
          error.type = "entity.parse.failed";
          throw error;
        }
      },
    })
  );
  // URL-encoded body parsing
  app.use(
    express.urlencoded({
      extended: true,
      limit: config.maxFileSize,
      // Parameter limit to prevent DoS attacks
      parameterLimit: 1000,
    })
  );

  logger.info("✅ Body parsing middleware configured");
};
