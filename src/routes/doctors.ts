import express from "express";
const router = express.Router();
import DoctorController from "../controllers/doctorController";
import authMiddleware from "../middleware/auth";
import validateRequest from "../middleware/validateRequest";
import { doctorValidation } from "../validators/doctorValidator";
import upload from "../middleware/upload";
import rateLimit from "express-rate-limit";
import doctorAuthMiddleware from "../middleware/doctorAuth";

// Rate limiting for registration and login
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many registration attempts, please try again later.",
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts, please try again later.",
});

// Public routes (no authentication required)
router.post(
  "/register",
  registrationLimiter,
  validateRequest(doctorValidation.register),
  DoctorController.registerDoctor
);
router.post(
  "/login",
  loginLimiter,
  validateRequest(doctorValidation.login),
  DoctorController.loginDoctor
);
router.post(
  "/forgot-password",
  validateRequest(doctorValidation.forgotPassword),
  DoctorController.forgotPassword
);
router.post(
  "/reset-password",
  validateRequest(doctorValidation.resetPassword),
  DoctorController.resetPassword
);
router.get("/verify-email/:token", DoctorController.verifyEmail);
router.post(
  "/resend-verification",
  validateRequest(doctorValidation.resendVerification),
  DoctorController.resendVerificationEmail
);

// Public doctor discovery routes
router.get("/search", DoctorController.searchDoctors);
router.get("/list", DoctorController.getPublicDoctorList);
router.get("/specializations", DoctorController.getSpecializations);
router.get(
  "/by-specialization/:specialization",
  DoctorController.getDoctorsBySpecialization
);
router.get("/public/:doctorId", DoctorController.getPublicDoctorProfile);

// Check availability
router.post(
  "/check-email",
  validateRequest(doctorValidation.checkEmail),
  DoctorController.checkEmailExists
);
router.post(
  "/check-license",
  validateRequest(doctorValidation.checkLicense),
  DoctorController.checkLicenseExists
);

// Doctor authentication required routes
router.use("/doctor", doctorAuthMiddleware); // Apply doctor auth middleware

// Doctor profile management
router.get("/doctor/profile", DoctorController.getDoctorProfile);
router.put(
  "/doctor/profile",
  validateRequest(doctorValidation.updateProfile),
  DoctorController.updateDoctorProfile
);
router.patch(
  "/doctor/professional-info",
  validateRequest(doctorValidation.updateProfessionalInfo),
  DoctorController.updateProfessionalInfo
);
router.patch(
  "/doctor/contact-info",
  validateRequest(doctorValidation.updateContactInfo),
  DoctorController.updateContactInfo
);

// Schedule management
router.get("/doctor/schedule", DoctorController.getDoctorSchedule);
router.put(
  "/doctor/schedule",
  validateRequest(doctorValidation.updateSchedule),
  DoctorController.updateDoctorSchedule
);
router.patch(
  "/doctor/availability",
  validateRequest(doctorValidation.updateAvailability),
  DoctorController.updateAvailability
);
router.post(
  "/doctor/schedule/break",
  validateRequest(doctorValidation.addBreak),
  DoctorController.addBreakTime
);
router.delete(
  "/doctor/schedule/break/:breakId",
  DoctorController.removeBreakTime
);

// Unavailable dates management
router.get("/doctor/unavailable-dates", DoctorController.getUnavailableDates);
router.post(
  "/doctor/unavailable-dates",
  validateRequest(doctorValidation.addUnavailableDate),
  DoctorController.addUnavailableDate
);
router.delete(
  "/doctor/unavailable-dates/:date",
  DoctorController.removeUnavailableDate
);

// Fee management
router.get("/doctor/fees", DoctorController.getDoctorFees);
router.put(
  "/doctor/fees",
  validateRequest(doctorValidation.updateFees),
  DoctorController.updateDoctorFees
);

// Password management
router.post(
  "/doctor/change-password",
  validateRequest(doctorValidation.changePassword),
  DoctorController.changePassword
);

// File uploads
router.post(
  "/doctor/upload/profile-picture",
  upload.single("profilePicture"),
  DoctorController.uploadProfilePicture
);
router.post(
  "/doctor/upload/documents",
  upload.array("documents", 5),
  DoctorController.uploadDocuments
);

// Doctor's appointments
router.get("/doctor/appointments", DoctorController.getDoctorAppointments);
router.get("/doctor/appointments/today", DoctorController.getTodayAppointments);
router.get(
  "/doctor/appointments/upcoming",
  DoctorController.getUpcomingAppointments
);
router.get(
  "/doctor/appointments/:appointmentId",
  DoctorController.getAppointmentDetails
);
router.patch(
  "/doctor/appointments/:appointmentId/status",
  validateRequest(doctorValidation.updateAppointmentStatus),
  DoctorController.updateAppointmentStatus
);
router.post(
  "/doctor/appointments/:appointmentId/consultation",
  validateRequest(doctorValidation.addConsultation),
  DoctorController.addConsultationNotes
);

// Doctor dashboard
router.get("/doctor/dashboard", DoctorController.getDoctorDashboard);
router.get("/doctor/statistics", DoctorController.getDoctorStatistics);
router.get(
  "/doctor/calendar/:month/:year",
  DoctorController.getMonthlyCalendar
);

// Patient management by doctor
router.get("/doctor/patients", DoctorController.getDoctorPatients);
router.get(
  "/doctor/patients/:patientId/history",
  DoctorController.getPatientHistory
);
router.get("/doctor/patients/search", DoctorController.searchDoctorPatients);

// Reviews and ratings
router.get("/doctor/reviews", DoctorController.getDoctorReviews);
router.get("/doctor/rating-summary", DoctorController.getRatingSummary);

// Notifications
router.get("/doctor/notifications", DoctorController.getDoctorNotifications);
router.patch(
  "/doctor/notifications/:notificationId/read",
  DoctorController.markNotificationRead
);
router.patch(
  "/doctor/notifications/mark-all-read",
  DoctorController.markAllNotificationsRead
);

// Account management
router.post("/doctor/deactivate-account", DoctorController.deactivateAccount);
router.post("/doctor/export-data", DoctorController.exportDoctorData);

// Admin routes (requires admin authentication)
router.use("/admin", authMiddleware); // Admin auth for routes below

// Admin doctor management
router.get("/admin/all", DoctorController.getAllDoctors);
router.get(
  "/admin/pending-verification",
  DoctorController.getPendingVerificationDoctors
);
router.get("/admin/search", DoctorController.searchDoctorsAdmin);
router.get("/admin/:doctorId", DoctorController.getDoctorByAdmin);
router.put(
  "/admin/:doctorId",
  validateRequest(doctorValidation.adminUpdate),
  DoctorController.updateDoctorByAdmin
);
router.patch("/admin/:doctorId/status", DoctorController.updateDoctorStatus);
router.patch("/admin/:doctorId/verify", DoctorController.verifyDoctor);
router.delete("/admin/:doctorId", DoctorController.deleteDoctorByAdmin);

// Admin analytics
router.get(
  "/admin/analytics/performance",
  DoctorController.getDoctorPerformanceAnalytics
);
router.get(
  "/admin/analytics/specialization-stats",
  DoctorController.getSpecializationStats
);
router.get(
  "/admin/analytics/appointment-trends",
  DoctorController.getAppointmentTrends
);

// module.exports = router;
export default router;
