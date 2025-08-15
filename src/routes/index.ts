import { Application, Request, Response } from "express";
import healthRoutes from "./health";
import patientRoutes from "./patients";
import appointmentRoutes from "./appointments";
import medicineRoutes from "./medicine";
import inventoryRoutes from "./inventory";
import doctorRoutes from "./doctors";
import userRoutes from "./user";
import serviceRoutes from "./services";
import serviceCategoryRoutes from "./category";

export const setupRoutes = (app: Application): void => {
  app.use("/health", healthRoutes);

  app.get("/", (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: "Dental CRM API Server",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      endpoints: {
        health: "/health",
        patients: "/api/patients",
        appointments: "/api/appointments",
        doctors: "/api/doctors",
      },
    });
  });

  app.use("/api/patients", patientRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/doctors", doctorRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/services", serviceRoutes);
  app.use("/api/service-categories", serviceCategoryRoutes);
  // app.use("/api/webhooks", webhookRoutes);
  // app.use("/api/analytics", authMiddleware, analyticsRoutes);
  // app.use("/api/notifications", authMiddleware, notificationRoutes);
};
