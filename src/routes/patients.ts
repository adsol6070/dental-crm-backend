import express from "express";
const router = express.Router();
import PatientController from "../controllers/patientController";
import patientAuthMiddleware from "../middleware/patientAuth";
import { patientValidation } from "../validators/patientValidator";
import upload from "../middleware/upload";
import rateLimit from "express-rate-limit";
import validateRequest from "../middleware/validateRequest";
import authMiddleware from "../middleware/auth";

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many registration attempts, `please try again later.",
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
  validateRequest(patientValidation.create),
  PatientController.registerPatient
);
router.post(
  "/login",
  loginLimiter,
  validateRequest(patientValidation.login),
  PatientController.loginPatient
);
router.post(
  "/forgot-password",
  validateRequest(patientValidation.forgotPassword),
  PatientController.forgotPassword
);
router.post(
  "/reset-password",
  validateRequest(patientValidation.resetPassword),
  PatientController.resetPassword
);
router.get("/verify-email/:token", PatientController.verifyEmail);
router.post(
  "/resend-verification",
  validateRequest(patientValidation.resendVerification),
  PatientController.resendVerificationEmail
);

// Check if email exists (for registration validation)
router.post(
  "/check-email",
  validateRequest(patientValidation.checkEmail),
  PatientController.checkEmailExists
);
router.post(
  "/check-phone",
  validateRequest(patientValidation.checkPhone),
  PatientController.checkPhoneExists
);

// Patient authentication required routes
// Admin routes (requires admin authentication)
router.use("/admin", authMiddleware); // Admin auth for routes below

// Admin patient management
router.get("/admin/all", PatientController.getAllPatients);
router.get("/admin/search", PatientController.searchPatients);
router.get("/admin/:patientId", PatientController.getPatientByAdmin);
router.put(
  "/admin/:patientId",
  validateRequest(patientValidation.adminUpdate),
  PatientController.updatePatientByAdmin
);
router.patch("/admin/:patientId/status", PatientController.updatePatientStatus);
router.delete("/admin/:patientId", PatientController.deletePatientByAdmin);

// Admin analytics
// router.get(
//   "/admin/analytics/registration-trends",
//   PatientController.getRegistrationTrends
// );
// router.get(
//   "/admin/analytics/demographics",
//   PatientController.getPatientDemographics
// );
// router.get(
//   "/admin/analytics/engagement",
//   PatientController.getPatientEngagement
// );

router.use(patientAuthMiddleware); // Apply patient auth middleware to routes below

// Patient profile management
router.get("/profile", PatientController.getPatientProfile);
router.put(
  "/profile",
  validateRequest(patientValidation.updateProfile),
  PatientController.updatePatientProfile
);
router.patch(
  "/profile/preferences",
  validateRequest(patientValidation.updatePreferences),
  PatientController.updatePatientPreferences
);
router.patch(
  "/profile/medical-info",
  validateRequest(patientValidation.updateMedicalInfo),
  PatientController.updateMedicalInfo
);
router.patch(
  "/profile/contact-info",
  validateRequest(patientValidation.updateContactInfo),
  PatientController.updateContactInfo
);

// Password management
router.post(
  "/change-password",
  validateRequest(patientValidation.changePassword),
  PatientController.changePassword
);

// File uploads
router.post(
  "/upload/profile-picture",
  upload.single("profilePicture"),
  PatientController.uploadProfilePicture
);
router.post(
  "/upload/medical-documents",
  upload.array("documents", 5),
  PatientController.uploadMedicalDocuments
);

// Patient's appointments
router.get("/appointments", PatientController.getPatientAppointments);
router.get("/appointments/upcoming", PatientController.getUpcomingAppointments);
router.get("/appointments/history", PatientController.getAppointmentHistory);
router.get(
  "/appointments/:appointmentId",
  PatientController.getAppointmentDetails
);

// Patient's medical records
router.get("/medical-records", PatientController.getMedicalRecords);
router.get("/prescriptions", PatientController.getPrescriptions);
router.get("/lab-reports", PatientController.getLabReports);

// Patient dashboard data
router.get("/dashboard", PatientController.getDashboardData);
router.get("/statistics", PatientController.getPatientStatistics);

// Notification preferences
router.get(
  "/notifications/preferences",
  PatientController.getNotificationPreferences
);
router.patch(
  "/notifications/preferences",
  validateRequest(patientValidation.notificationPreferences),
  PatientController.updateNotificationPreferences
);
router.get("/notifications/history", PatientController.getNotificationHistory);

// Account management
router.post("/deactivate-account", PatientController.deactivateAccount);
router.post("/delete-account", PatientController.requestAccountDeletion);
router.post("/export-data", PatientController.exportPatientData);

export default router;
