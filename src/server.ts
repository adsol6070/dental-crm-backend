import logger from "./utils/logger";
import { connectDatabase } from "./config/database";
import { setupScheduledJobs } from "./jobs";
import app from "./app";
import { config } from "./config/environment";
import { setupGlobalErrorHandlers } from "./utils/globalErrorHandlers";

setupGlobalErrorHandlers();

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDatabase();

    // Setup scheduled tasks
    setupScheduledJobs();

    // Start the server
    const server = app.listen(config.port, "0.0.0.0", () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 Health check: http://localhost:${config.port}/health`);
      logger.info(`🔗 API Documentation: http://localhost:${config.port}/`);
    });

    // Handle server errors 
    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`❌ Port ${config.port} is already in use`);
      } else {
        logger.error("❌ Server error:", error);
      }
      process.exit(1);
    });

    // Handle graceful shutdown signals
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async (err) => {
        if (err) {
          logger.error("❌ Error closing server:", err);
          process.exit(1);
        }

        try {
          // Close database connection
          const mongoose = await import("mongoose");
          await mongoose.connection.close();
          logger.info("✅ Database connection closed");
          process.exit(0);
        } catch (error) {
          logger.error("❌ Error during graceful shutdown:", error);
          process.exit(1);
        }
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the application
if (require.main === module) {
  startServer().catch((error) => {
    logger.error("❌ Unhandled error during server startup:", error);
    process.exit(1);
  });
}
