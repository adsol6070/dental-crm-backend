import express from "express";
import ImplantMaterialController from "../controllers/inventoryController";
import authMiddleware, {
  requireAdmin,
} from "../middleware/auth";
import {
  createImplantMaterialValidation,
  updateImplantMaterialValidation,
  implantMaterialSearchValidation,
  implantMaterialIdParamValidation,
  updateImplantMaterialStatusValidation,
  updateStockValidation,
  updatePaymentStatusValidation,
  bulkOperationValidation
} from "../validators/inventoryValidator";
import validateRequest from "../middleware/validateRequest";

const router = express.Router();

// Protected routes (authentication required)
router.use(authMiddleware);

// Basic CRUD Operations
router.get('/', validateRequest(implantMaterialSearchValidation), ImplantMaterialController.getAllItems);
router.get('/stats', ImplantMaterialController.getInventoryStats);
router.get('/low-stock', ImplantMaterialController.getLowStockItems);
router.get('/expired', ImplantMaterialController.getExpiredItems);
router.get('/pending-payments', ImplantMaterialController.getPendingPayments);
// NEW: Add route for partial payments
router.get('/partial-payments', ImplantMaterialController.getPartialPayments);
router.get('/:materialId', validateRequest(implantMaterialIdParamValidation), ImplantMaterialController.getItemById);

router.post('/', requireAdmin, validateRequest(createImplantMaterialValidation), ImplantMaterialController.createItem);
router.put('/:materialId', requireAdmin, validateRequest(implantMaterialIdParamValidation), validateRequest(updateImplantMaterialValidation), ImplantMaterialController.updateItem);

// Status and Stock Management
router.put('/:materialId/status', requireAdmin, validateRequest(implantMaterialIdParamValidation), validateRequest(updateImplantMaterialStatusValidation), ImplantMaterialController.updateItemStatus);
router.put('/:materialId/stock', requireAdmin, validateRequest(implantMaterialIdParamValidation), validateRequest(updateStockValidation), ImplantMaterialController.updateStock);
router.put('/:materialId/payment', requireAdmin, validateRequest(implantMaterialIdParamValidation), validateRequest(updatePaymentStatusValidation), ImplantMaterialController.updatePaymentStatus);

// Bulk Operations
router.post('/bulk', requireAdmin, validateRequest(bulkOperationValidation), ImplantMaterialController.bulkOperation);

// Delete
router.delete('/:materialId', requireAdmin, validateRequest(implantMaterialIdParamValidation), ImplantMaterialController.deleteItem);

// Reports and Analytics
router.get('/reports/summary', ImplantMaterialController.getInventorySummary);
router.get('/reports/category-wise', ImplantMaterialController.getCategoryWiseReport);
router.get('/reports/supplier-wise', ImplantMaterialController.getSupplierWiseReport);

export default router;
