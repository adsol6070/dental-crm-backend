// src/jobs/index.ts
import cron from "node-cron";
import { config } from "../config/environment";
import NotificationService from "../services/notificationService";
import AppointmentService from "../services/appointmentService";
import logger from "../utils/logger";

export const setupScheduledJobs = (): void => {
  try {
    // Daily appointment reminders (9 AM every day)
    cron.schedule(
      "0 9 * * *",
      async () => {
        try {
          logger.info("🔔 Running daily appointment reminders");
          await NotificationService.sendDailyReminders();
          logger.info("✅ Daily appointment reminders completed");
        } catch (error) {
          logger.error("❌ Error in daily appointment reminders:", error);
          // Don't throw here - we want the application to continue running
        }
      },
      {
        timezone: config.timezone,
      }
    );

    // Check upcoming appointments (every 2 hours)
    cron.schedule(
      "0 */2 * * *",
      async () => {
        try {
          logger.info("⏰ Checking for upcoming appointments");
          await AppointmentService.checkUpcomingAppointments();
          logger.info("✅ Upcoming appointments check completed");
        } catch (error) {
          logger.error("❌ Error checking upcoming appointments:", error);
          // Don't throw here - we want the application to continue running
        }
      },
      {
        timezone: config.timezone,
      }
    );

    // Weekly cleanup job (Sunday at 2 AM)
    cron.schedule(
      "0 2 * * 0",
      async () => {
        try {
          logger.info("🧹 Running weekly cleanup job");
          // Add your cleanup logic here
          // await CleanupService.cleanExpiredTokens();
          // await CleanupService.archiveOldLogs();
          logger.info("✅ Weekly cleanup completed");
        } catch (error) {
          logger.error("❌ Error in weekly cleanup:", error);
        }
      },
      {
        timezone: config.timezone,
      }
    );

    logger.info("📅 Scheduled jobs initialized successfully");
  } catch (error) {
    logger.error("❌ Error setting up scheduled jobs:", error);
    // Don't throw here - continue without scheduled tasks
  }
};
