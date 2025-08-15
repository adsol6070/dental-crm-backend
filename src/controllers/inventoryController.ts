import { Request, Response, NextFunction } from "express";
import ImplantMaterial, { IImplantMaterial, ImplantMaterialDocument } from "../models/Inventory";
import logger from "../utils/logger";
import { AppError } from "../types/errors";

// Updated Types for request bodies with new payment fields
interface CreateImplantMaterialBody {
  itemName: string;
  category: string;
  type: string;
  implantBrand: string;
  supplier: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  receivedDate: string;
  expiryDate?: string;
  batchNumber?: string;
  description?: string;
  specifications?: string;
  storageConditions?: string;
  minimumStock: number;
  paymentStatus: string;
  paymentMode?: string; // NEW
  paymentDate?: string;
  invoiceNumber?: string;
  amountPaid?: number; // NEW
  amountPending?: number; // NEW
  paymentNotes?: string; // NEW
}

interface UpdateImplantMaterialBody extends Partial<CreateImplantMaterialBody> {}

interface UpdateStatusBody {
  status: string;
  isActive: boolean;
}

interface UpdateStockBody {
  quantity: number;
  operation: "add" | "subtract" | "set";
  reason?: string;
}

// Updated payment status interface
interface UpdatePaymentStatusBody {
  paymentStatus: string;
  paymentMode?: string; // NEW
  paymentDate?: string;
  invoiceNumber?: string;
  amountPaid?: number; // NEW
  amountPending?: number; // NEW
  paymentNotes?: string; // NEW
}

// Updated search query interface
interface SearchItemsQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  supplier?: string;
  status?: string;
  paymentStatus?: string;
  paymentMode?: string; // NEW
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

interface BulkOperationBody {
  itemIds: string[];
  operation: "delete" | "activate" | "deactivate" | "updateStatus";
  data?: any;
}

// Response types
interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

class ImplantMaterialController {
  // ==================== BASIC CRUD OPERATIONS ====================

  // Updated getAllItems with paymentMode filter
  static async getAllItems(
    req: Request,
    res: Response<ApiResponse<{ items: ImplantMaterialDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = req.query as SearchItemsQuery;
      const {
        page = 1,
        limit = 10,
        search,
        category,
        supplier,
        status,
        paymentStatus,
        paymentMode, // NEW
        sortBy = "itemName",
        sortOrder = "asc",
      } = query;

      const filter: any = {};

      // Apply basic filters
      if (category) filter.category = category;
      if (supplier) filter.supplier = supplier;
      if (status) filter.status = status;
      if (paymentStatus) filter.paymentStatus = paymentStatus;
      if (paymentMode) filter.paymentMode = paymentMode; // NEW

      // Search functionality
      if (search) {
        filter.$or = [
          { itemName: { $regex: search, $options: "i" } },
          { implantBrand: { $regex: search, $options: "i" } },
          { batchNumber: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const sort: any = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const items = await ImplantMaterial.find(filter)
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .populate("createdBy", "firstName lastName email")
        .populate("lastUpdatedBy", "firstName lastName email")
        .lean();

      const total = await ImplantMaterial.countDocuments(filter);

      res.json({
        success: true,
        data: { items: items as ImplantMaterialDocument[] },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get item by ID (unchanged)
  static async getItemById(
    req: Request,
    res: Response<ApiResponse<{ item: ImplantMaterialDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { materialId } = req.params;

      const item = await ImplantMaterial.findById(materialId)
        .populate("createdBy", "firstName lastName email")
        .populate("lastUpdatedBy", "firstName lastName email");

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      res.json({
        success: true,
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // Updated createItem with new payment fields
  static async createItem(
    req: Request,
    res: Response<ApiResponse<{ item: ImplantMaterialDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const itemData = req.body as CreateImplantMaterialBody;

      // Validate partial payment amounts
      if (itemData.paymentStatus === 'partial') {
        const totalCost = itemData.quantity * itemData.unitPrice;
        const amountPaid = itemData.amountPaid || 0;
        const amountPending = itemData.amountPending || 0;

        if (amountPaid + amountPending !== totalCost) {
          throw new AppError("Amount paid + amount pending must equal total cost for partial payments", 400);
        }

        if (amountPaid <= 0 || amountPending <= 0) {
          throw new AppError("Both amount paid and amount pending must be greater than 0 for partial payments", 400);
        }
      }

      // Check if item with same name, brand and batch already exists
      const existingItem = await ImplantMaterial.findOne({
        itemName: { $regex: `^${itemData.itemName}$`, $options: "i" },
        implantBrand: itemData.implantBrand,
        batchNumber: itemData.batchNumber || null,
        isActive: true,
      });

      if (existingItem) {
        throw new AppError(
          "Item with the same name, brand, and batch number already exists",
          409
        );
      }

      // Create new item with all fields including payment fields
      const item = new ImplantMaterial({
        ...itemData,
        createdBy: res.locals.user?.id,
        lastUpdatedBy: res.locals.user?.id,
      });

      await item.save();

      // Populate the created item
      await item.populate(
        "createdBy lastUpdatedBy",
        "firstName lastName email"
      );

      logger.info(`New inventory item created: ${item.itemName}`, {
        itemId: item._id,
        itemName: item.itemName,
        category: item.category,
        supplier: item.supplier,
        paymentStatus: item.paymentStatus,
        createdBy: res.locals.user?.id,
      });

      res.status(201).json({
        success: true,
        message: "Item created successfully",
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // Updated updateItem with payment fields validation
  static async updateItem(
    req: Request,
    res: Response<ApiResponse<{ item: ImplantMaterialDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { materialId } = req.params;
      const updateData = req.body as UpdateImplantMaterialBody;

      // Validate partial payment amounts if updating payment fields
      if (updateData.paymentStatus === 'partial' || 
          (updateData.amountPaid !== undefined || updateData.amountPending !== undefined)) {
        
        // Get current item to calculate total cost if needed
        const currentItem = await ImplantMaterial.findById(materialId);
        if (!currentItem) {
          throw new AppError("Item not found", 404);
        }

        const quantity = updateData.quantity !== undefined ? updateData.quantity : currentItem.quantity;
        const unitPrice = updateData.unitPrice !== undefined ? updateData.unitPrice : currentItem.unitPrice;
        const totalCost = quantity * unitPrice;
        
        const amountPaid = updateData.amountPaid !== undefined ? updateData.amountPaid : (currentItem.amountPaid || 0);
        const amountPending = updateData.amountPending !== undefined ? updateData.amountPending : (currentItem.amountPending || 0);

        if (updateData.paymentStatus === 'partial') {
          if (amountPaid + amountPending !== totalCost) {
            throw new AppError("Amount paid + amount pending must equal total cost for partial payments", 400);
          }

          if (amountPaid <= 0 || amountPending <= 0) {
            throw new AppError("Both amount paid and amount pending must be greater than 0 for partial payments", 400);
          }
        }
      }

      // Check for conflicts if updating identifying fields
      if (updateData.itemName || updateData.implantBrand || updateData.batchNumber) {
        const conflictFilter: any = {
          _id: { $ne: materialId },
          isActive: true,
        };

        if (updateData.itemName) {
          conflictFilter.itemName = {
            $regex: `^${updateData.itemName}$`,
            $options: "i",
          };
        }
        if (updateData.implantBrand) conflictFilter.implantBrand = updateData.implantBrand;
        if (updateData.batchNumber) conflictFilter.batchNumber = updateData.batchNumber;

        const existingItem = await ImplantMaterial.findOne(conflictFilter);

        if (existingItem) {
          throw new AppError(
            "Item with the same name, brand, and batch number already exists",
            409
          );
        }
      }

      const item = await ImplantMaterial.findByIdAndUpdate(
        materialId,
        {
          ...updateData,
          lastUpdatedBy: res.locals.user?.id,
        },
        { new: true, runValidators: true }
      ).populate("createdBy lastUpdatedBy", "firstName lastName email");

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      logger.info(`Inventory item updated: ${item.itemName}`, {
        itemId: item._id,
        itemName: item.itemName,
        updatedFields: Object.keys(updateData),
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Item updated successfully",
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update item status (unchanged)
  static async updateItemStatus(
    req: Request,
    res: Response<ApiResponse<{ item: ImplantMaterialDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { materialId } = req.params;
      const { status, isActive } = req.body as UpdateStatusBody;

      const item = await ImplantMaterial.findByIdAndUpdate(
        materialId,
        {
          status,
          isActive,
          lastUpdatedBy: res.locals.user?.id,
        },
        { new: true, runValidators: true }
      ).populate("createdBy lastUpdatedBy", "firstName lastName email");

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      logger.info(`Item status updated: ${item.itemName}`, {
        itemId: item._id,
        newStatus: status,
        isActive,
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Item status updated successfully",
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // Update stock (unchanged)
  static async updateStock(
    req: Request,
    res: Response<ApiResponse<{ item: ImplantMaterialDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { materialId } = req.params;
      const { quantity, operation, reason } = req.body as UpdateStockBody;

      const item = await ImplantMaterial.findById(materialId);

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      let newQuantity: number;

      switch (operation) {
        case "add":
          newQuantity = item.quantity + quantity;
          break;
        case "subtract":
          newQuantity = Math.max(0, item.quantity - quantity);
          break;
        case "set":
          newQuantity = quantity;
          break;
        default:
          throw new AppError("Invalid operation", 400);
      }

      item.quantity = newQuantity;
      item.lastUpdatedBy = res.locals.user?.id;
      await item.save();

      await item.populate("createdBy lastUpdatedBy", "firstName lastName email");

      logger.info(`Stock updated for item: ${item.itemName}`, {
        itemId: item._id,
        operation,
        oldQuantity: operation === "set" ? "N/A" : item.quantity,
        newQuantity,
        reason,
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Stock updated successfully",
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // Updated updatePaymentStatus with new payment fields
  static async updatePaymentStatus(
    req: Request,
    res: Response<ApiResponse<{ item: ImplantMaterialDocument }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { materialId } = req.params;
      const { 
        paymentStatus, 
        paymentMode, 
        paymentDate, 
        invoiceNumber, 
        amountPaid, 
        amountPending, 
        paymentNotes 
      } = req.body as UpdatePaymentStatusBody;

      // Get current item to validate partial payments
      const currentItem = await ImplantMaterial.findById(materialId);
      if (!currentItem) {
        throw new AppError("Item not found", 404);
      }

      // Validate partial payment amounts
      if (paymentStatus === 'partial') {
        if (!amountPaid || !amountPending) {
          throw new AppError("Amount paid and amount pending are required for partial payments", 400);
        }

        if (amountPaid + amountPending !== currentItem.totalCost) {
          throw new AppError("Amount paid + amount pending must equal total cost", 400);
        }

        if (amountPaid <= 0 || amountPending <= 0) {
          throw new AppError("Both amount paid and amount pending must be greater than 0", 400);
        }

        if (!paymentMode) {
          throw new AppError("Payment mode is required for partial payments", 400);
        }
      }

      // Validate payment mode for paid status
      if (paymentStatus === 'paid' && !paymentMode) {
        throw new AppError("Payment mode is required for paid status", 400);
      }

      const updateData: any = {
        paymentStatus,
        lastUpdatedBy: res.locals.user?.id,
      };

      // Set payment mode
      if (paymentMode) updateData.paymentMode = paymentMode;
      
      // Set payment date
      if (paymentDate) updateData.paymentDate = new Date(paymentDate);
      
      // Set invoice number
      if (invoiceNumber) updateData.invoiceNumber = invoiceNumber;
      
      // Set payment notes
      if (paymentNotes) updateData.paymentNotes = paymentNotes;

      // Handle payment amounts based on status
      if (paymentStatus === 'paid') {
        updateData.amountPaid = currentItem.totalCost;
        updateData.amountPending = 0;
      } else if (paymentStatus === 'pending') {
        updateData.amountPaid = 0;
        updateData.amountPending = currentItem.totalCost;
      } else if (paymentStatus === 'partial') {
        updateData.amountPaid = amountPaid;
        updateData.amountPending = amountPending;
      }

      const item = await ImplantMaterial.findByIdAndUpdate(
        materialId,
        updateData,
        { new: true, runValidators: true }
      ).populate("createdBy lastUpdatedBy", "firstName lastName email");

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      logger.info(`Payment status updated for item: ${item.itemName}`, {
        itemId: item._id,
        paymentStatus,
        paymentMode,
        amountPaid: updateData.amountPaid,
        amountPending: updateData.amountPending,
        updatedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Payment status updated successfully",
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete item (unchanged)
  static async deleteItem(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { materialId } = req.params;

      const item = await ImplantMaterial.findByIdAndDelete(materialId);

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      logger.info(`Inventory item deleted: ${item.itemName}`, {
        itemId: item._id,
        deletedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: "Item deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== INVENTORY MANAGEMENT ====================

  // Get inventory stats (unchanged)
  static async getInventoryStats(
    req: Request,
    res: Response<ApiResponse<any>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const stats = await ImplantMaterial.getInventoryStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get low stock items (unchanged)
  static async getLowStockItems(
    req: Request,
    res: Response<ApiResponse<{ items: ImplantMaterialDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const items = await ImplantMaterial.findLowStockItems();

      res.json({
        success: true,
        data: { items },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get expired items (unchanged)
  static async getExpiredItems(
    req: Request,
    res: Response<ApiResponse<{ items: ImplantMaterialDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const items = await ImplantMaterial.findExpiredItems();

      res.json({
        success: true,
        data: { items },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get pending payments (unchanged)
  static async getPendingPayments(
    req: Request,
    res: Response<ApiResponse<{ items: ImplantMaterialDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const items = await ImplantMaterial.findPendingPayments();

      res.json({
        success: true,
        data: { items },
      });
    } catch (error) {
      next(error);
    }
  }

  // NEW: Get partial payments
  static async getPartialPayments(
    req: Request,
    res: Response<ApiResponse<{ items: ImplantMaterialDocument[] }>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const items = await ImplantMaterial.findPartialPayments();

      res.json({
        success: true,
        data: { items },
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk operations (unchanged)
  static async bulkOperation(
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const { itemIds, operation, data } = req.body as BulkOperationBody;

      let result: any;

      switch (operation) {
        case "delete":
          result = await ImplantMaterial.deleteMany({
            _id: { $in: itemIds }
          });
          break;
        case "activate":
          result = await ImplantMaterial.updateMany(
            { _id: { $in: itemIds } },
            { isActive: true, lastUpdatedBy: res.locals.user?.id }
          );
          break;
        case "deactivate":
          result = await ImplantMaterial.updateMany(
            { _id: { $in: itemIds } },
            { isActive: false, lastUpdatedBy: res.locals.user?.id }
          );
          break;
        case "updateStatus":
          if (!data?.status) {
            throw new AppError("Status is required for status update operation", 400);
          }
          result = await ImplantMaterial.updateMany(
            { _id: { $in: itemIds } },
            { status: data.status, lastUpdatedBy: res.locals.user?.id }
          );
          break;
        default:
          throw new AppError("Invalid bulk operation", 400);
      }

      logger.info(`Bulk operation performed: ${operation}`, {
        itemCount: itemIds.length,
        operation,
        performedBy: res.locals.user?.id,
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed successfully`,
        data: { affectedCount: result.modifiedCount || result.deletedCount },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== REPORTS AND ANALYTICS ====================

  // Get inventory summary (unchanged)
  static async getInventorySummary(
    req: Request,
    res: Response<ApiResponse<any>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const summary = await ImplantMaterial.aggregate([
        {
          $match: { isActive: true }
        },
        {
          $group: {
            _id: "$category",
            totalItems: { $sum: 1 },
            totalQuantity: { $sum: "$quantity" },
            totalValue: { $sum: "$totalCost" },
            lowStockItems: {
              $sum: { $cond: [{ $eq: ["$status", "low-stock"] }, 1, 0] }
            },
            avgUnitPrice: { $avg: "$unitPrice" }
          }
        },
        {
          $sort: { totalValue: -1 }
        }
      ]);

      res.json({
        success: true,
        data: { summary },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get category-wise report (unchanged)
  static async getCategoryWiseReport(
    req: Request,
    res: Response<ApiResponse<any>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const report = await ImplantMaterial.aggregate([
        {
          $match: { isActive: true }
        },
        {
          $group: {
            _id: {
              category: "$category",
              status: "$status"
            },
            count: { $sum: 1 },
            totalValue: { $sum: "$totalCost" }
          }
        },
        {
          $group: {
            _id: "$_id.category",
            statusBreakdown: {
              $push: {
                status: "$_id.status",
                count: "$count",
                totalValue: "$totalValue"
              }
            },
            totalItems: { $sum: "$count" },
            totalValue: { $sum: "$totalValue" }
          }
        },
        {
          $sort: { totalValue: -1 }
        }
      ]);

      res.json({
        success: true,
        data: { report },
      });
    } catch (error) {
      next(error);
    }
  }

  // Updated supplier-wise report with enhanced payment information
  static async getSupplierWiseReport(
    req: Request,
    res: Response<ApiResponse<any>>,
    next: NextFunction
  ): Promise<void> {
    try {
      const report = await ImplantMaterial.aggregate([
        {
          $match: { isActive: true }
        },
        {
          $group: {
            _id: "$supplier",
            totalItems: { $sum: 1 },
            totalValue: { $sum: "$totalCost" },
            pendingPayments: {
              $sum: { 
                $cond: [
                  { $eq: ["$paymentStatus", "pending"] }, 
                  "$totalCost", 
                  0
                ]
              }
            },
            // NEW: Add partial payments tracking
            partialPayments: {
              $sum: { 
                $cond: [
                  { $eq: ["$paymentStatus", "partial"] }, 
                  "$amountPending", 
                  0
                ]
              }
            },
            totalOutstanding: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "pending"] },
                  "$totalCost",
                  {
                    $cond: [
                      { $eq: ["$paymentStatus", "partial"] },
                      "$amountPending",
                      0
                    ]
                  }
                ]
              }
            },
            lastPurchaseDate: { $max: "$receivedDate" },
            categories: { $addToSet: "$category" }
          }
        },
        {
          $sort: { totalValue: -1 }
        }
      ]);

      res.json({
        success: true,
        data: { report },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default ImplantMaterialController;
