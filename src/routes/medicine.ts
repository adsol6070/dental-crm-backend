// routes/medicine.ts
import express from "express";
import MedicineController from "../controllers/medicineController";
import authMiddleware, {
    requireAdmin,
} from "../middleware/auth";
import { 
    createMedicineValidation, 
    updateMedicineValidation,
    medicineSearchValidation,
    medicineIdParamValidation,
    updateMedicineStatusValidation
} from "../validators/medicineValidator";
import validateRequest from "../middleware/validateRequest";

const router = express.Router();

// Protected routes (authentication required)
router.use(authMiddleware);

// Basic CRUD Operations
router.get('/', validateRequest(medicineSearchValidation), MedicineController.getAllMedicines);
router.get('/:medicineId', validateRequest(medicineIdParamValidation), MedicineController.getMedicineById);
router.post('/', requireAdmin, validateRequest(createMedicineValidation), MedicineController.createMedicine);
router.put('/:medicineId', requireAdmin, validateRequest(medicineIdParamValidation), validateRequest(updateMedicineValidation), MedicineController.updateMedicine);
router.patch('/:medicineId/status', requireAdmin, validateRequest(medicineIdParamValidation), validateRequest(updateMedicineStatusValidation), MedicineController.updateMedicineStatus);
router.delete('/:medicineId', requireAdmin, validateRequest(medicineIdParamValidation), MedicineController.deleteMedicine);

export default router;
