// routes/serviceCategoryRoutes.ts
import { Router } from "express";
import ServiceCategoryController from "../controllers/categoryController";
import authMiddleware from "../middleware/auth";
import validateRequest from "../middleware/validateRequest";
import {
  createCategorySchema,
  updateCategorySchema,
  getCategoriesSchema,
  searchCategoriesSchema,
  updateCategoryStatusSchema,
  bulkUpdateCategoriesSchema,
  reorderCategoriesSchema,
  checkCategoryNameSchema,
  getCategoryAnalyticsSchema,
  exportCategoriesSchema,
} from "../validators/serviceCategoryValidator";

const router = Router();

// ==================== PUBLIC ROUTES ====================

/**
 * @route   GET /api/service-categories/active
 * @desc    Get all active service categories (public)
 * @access  Public
 */
router.get("/active", ServiceCategoryController.getActiveCategories);

/**
 * @route   GET /api/service-categories/search
 * @desc    Search service categories (public)
 * @access  Public
 */
router.get(
  "/search",
  validateRequest(searchCategoriesSchema),
  ServiceCategoryController.searchCategories
);

// ==================== AUTHENTICATED ROUTES ====================

// Apply authentication middleware to all routes below
router.use(authMiddleware);

/**
 * @route   GET /api/service-categories/statistics
 * @desc    Get service category statistics
 * @access  Private (Admin/Staff)
 */
router.get("/statistics", ServiceCategoryController.getCategoryStatistics);

/**
 * @route   GET /api/service-categories/analytics
 * @desc    Get service category analytics
 * @access  Private (Admin/Staff)
 */
router.get(
  "/analytics",
  validateRequest(getCategoryAnalyticsSchema),
  ServiceCategoryController.getCategoryAnalytics
);

/**
 * @route   GET /api/service-categories/with-counts
 * @desc    Get categories with service counts
 * @access  Private (Admin/Staff)
 */
router.get(
  "/with-counts",
  ServiceCategoryController.getCategoriesWithServiceCounts
);

/**
 * @route   GET /api/service-categories/export
 * @desc    Export service categories data
 * @access  Private (Admin)
 */
router.get(
  "/export",
  validateRequest(exportCategoriesSchema),
  ServiceCategoryController.exportCategories
);

/**
 * @route   POST /api/service-categories/check-name
 * @desc    Check if category name exists
 * @access  Private (Admin/Staff)
 */
router.post(
  "/check-name",
  validateRequest(checkCategoryNameSchema),
  ServiceCategoryController.checkCategoryNameExists
);

/**
 * @route   POST /api/service-categories/bulk-update
 * @desc    Bulk update service categories
 * @access  Private (Admin)
 */
router.post(
  "/bulk-update",
  validateRequest(bulkUpdateCategoriesSchema),
  ServiceCategoryController.bulkUpdateCategories
);

/**
 * @route   POST /api/service-categories/reorder
 * @desc    Reorder service categories
 * @access  Private (Admin/Staff)
 */
router.post(
  "/reorder",
  validateRequest(reorderCategoriesSchema),
  ServiceCategoryController.reorderCategories
);

/**
 * @route   GET /api/service-categories
 * @desc    Get all service categories with pagination and filtering
 * @access  Private (Admin/Staff)
 */
router.get(
  "/",
  validateRequest(getCategoriesSchema),
  ServiceCategoryController.getAllCategories
);

/**
 * @route   POST /api/service-categories
 * @desc    Create new service category
 * @access  Private (Admin/Staff)
 */
router.post(
  "/",
  validateRequest(createCategorySchema),
  ServiceCategoryController.createCategory
);

/**
 * @route   GET /api/service-categories/:categoryId
 * @desc    Get service category by ID
 * @access  Private (Admin/Staff)
 */
router.get("/:categoryId", ServiceCategoryController.getCategoryById);

/**
 * @route   PUT /api/service-categories/:categoryId
 * @desc    Update service category
 * @access  Private (Admin/Staff)
 */
router.put(
  "/:categoryId",
  validateRequest(updateCategorySchema),
  ServiceCategoryController.updateCategory
);

/**
 * @route   PATCH /api/service-categories/:categoryId/status
 * @desc    Update service category status
 * @access  Private (Admin)
 */
router.patch(
  "/:categoryId/status",
  validateRequest(updateCategoryStatusSchema),
  ServiceCategoryController.updateCategoryStatus
);

/**
 * @route   DELETE /api/service-categories/:categoryId
 * @desc    Delete service category
 * @access  Private (Admin)
 */
router.delete("/:categoryId", ServiceCategoryController.deleteCategory);

export default router;
