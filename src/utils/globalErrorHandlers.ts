import logger from "./logger";

export const setupGlobalErrorHandlers = (): void => {
  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    logger.error("UNCAUGHT EXCEPTION! 💥 Shutting down...", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      type: "uncaughtException",
    });

    // Give winston time to write logs
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    logger.error("UNHANDLED REJECTION! 💥 Shutting down...", {
      reason: reason?.message || reason,
      stack: reason?.stack,
      timestamp: new Date().toISOString(),
      type: "unhandledRejection",
      promise: promise.toString(),
    });

    // Give winston time to write logs
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle SIGTERM gracefully
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Starting graceful shutdown...");
  });

  // Handle SIGINT gracefully
  process.on("SIGINT", () => {
    logger.info("SIGINT received. Starting graceful shutdown...");
  });

  logger.info("✅ Global error handlers configured");
};
