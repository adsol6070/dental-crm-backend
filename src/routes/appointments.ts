import express from "express";
const router = express.Router();

import AppointmentController from "../controllers/appointmentController";
import authMiddleware from "../middleware/auth";
import appointmentValidation from "../validators/appointmentValidator";
import validateRequest from "../middleware/validateRequest";

// Public routes (for booking)
router.post(
  "/book",
  validateRequest(appointmentValidation.create),
  AppointmentController.bookAppointment
);
// router.get(
//   "/availability/:doctorId",
//   AppointmentController.getDoctorAvailability
// );
// router.get("/slots/:doctorId/:date", AppointmentController.getAvailableSlots);

// // Protected routes
router.use(authMiddleware); // Apply auth middleware to all routes below

router.get("/", AppointmentController.getAllAppointments);
// router.get("/search", AppointmentController.searchAppointments);
router.get("/:id", AppointmentController.getAppointmentById);
// router.put(
//   "/:id",
//   validateRequest(appointmentValidation.update),
//   AppointmentController.updateAppointment
// );
// router.patch("/:id/status", AppointmentController.updateAppointmentStatus);
// router.delete("/:id", AppointmentController.cancelAppointment);

// Appointment management
// router.post("/:id/reschedule", AppointmentController.rescheduleAppointment);
// router.post("/:id/confirm", AppointmentController.confirmAppointment);
// router.post("/:id/complete", AppointmentController.completeAppointment);

// Reports
// router.get("/reports/daily", AppointmentController.getDailyReport);
// router.get("/reports/weekly", AppointmentController.getWeeklyReport);
// router.get("/reports/monthly", AppointmentController.getMonthlyReport);

export default router;
