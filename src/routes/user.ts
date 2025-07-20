import express from "express";
import UserController from "../controllers/adminController";
import authMiddleware, {
    requireSuperAdmin,
    requireAdmin,
    authRateLimit
} from "../middleware/auth";
import { changePasswordValidation, createUserValidation, disable2FAValidation, forcePasswordChangeValidation, loginValidation, paginationValidation, registerValidation, superAdminValidation, twoFactorValidation, updateProfileValidation, updateStatusValidation, userIdParamValidation } from "../validators/userValidator";
import validateRequest from "../middleware/validateRequest";

const router = express.Router();

// Public routes (no authentication required)
router.get('/check-super-admin', UserController.checkSuperAdminExists);
router.post('/register-super-admin', authRateLimit(3), validateRequest(superAdminValidation), UserController.registerSuperAdmin);
router.post('/register', authRateLimit(5), validateRequest(registerValidation), UserController.register);
router.post('/login', authRateLimit(5), validateRequest(loginValidation), UserController.login);
router.post('/force-password-change', authRateLimit(3), validateRequest(forcePasswordChangeValidation), UserController.forcePasswordChange);

// Protected routes (authentication required)
router.use(authMiddleware);

// Profile management
router.get('/profile', UserController.getProfile); // GET current user profile
router.put('/profile', validateRequest(updateProfileValidation), UserController.updateProfile);
router.put('/change-password', validateRequest(changePasswordValidation), UserController.changePassword);

// 2FA routes
router.post('/2fa/enable', UserController.enable2FA);
router.post('/2fa/verify', validateRequest(twoFactorValidation), UserController.verify2FA);
router.post('/2fa/disable', validateRequest(disable2FAValidation), UserController.disable2FA);

// Super Admin only routes
router.post('/create-admin', requireSuperAdmin, validateRequest(createUserValidation), UserController.createAdmin);
router.delete('/:userId', requireSuperAdmin, validateRequest(userIdParamValidation), UserController.deleteUser);


// Admin and Super Admin routes
router.post('/create-staff', requireAdmin, validateRequest(createUserValidation), UserController.createStaff);
router.get('/all', requireAdmin, validateRequest(paginationValidation), UserController.getAllUsers);
router.put('/:userId/status', requireAdmin, validateRequest(userIdParamValidation), validateRequest(updateStatusValidation), UserController.updateUserStatus);

export default router;