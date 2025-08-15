// validation/serviceCategoryValidation.ts
import Joi from "joi";

// Validation schema for creating a service category
export const createCategorySchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(50).required().messages({
      "string.empty": "Category name is required",
      "string.min": "Category name must be at least 2 characters long",
      "string.max": "Category name cannot exceed 50 characters",
    }),
    description: Joi.string().trim().min(10).max(500).required().messages({
      "string.empty": "Description is required",
      "string.min": "Description must be at least 10 characters long",
      "string.max": "Description cannot exceed 500 characters",
    }),
    color: Joi.string()
      .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Color must be a valid hex color code (e.g., #FF0000 or #F00)",
      }),
    isActive: Joi.boolean().optional().default(true),
  }),
};

// Validation schema for updating a service category
export const updateCategorySchema = {
  params: Joi.object({
    categoryId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid category ID format",
      }),
  }),
  body: Joi.object({
    name: Joi.string().trim().min(2).max(50).optional().messages({
      "string.min": "Category name must be at least 2 characters long",
      "string.max": "Category name cannot exceed 50 characters",
    }),
    description: Joi.string().trim().min(10).max(500).optional().messages({
      "string.min": "Description must be at least 10 characters long",
      "string.max": "Description cannot exceed 500 characters",
    }),
    color: Joi.string()
      .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Color must be a valid hex color code (e.g., #FF0000 or #F00)",
      }),
    isActive: Joi.boolean().optional(),
  }).min(1), // At least one field must be provided
};

// Validation schema for getting categories with filters
export const getCategoriesSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    search: Joi.string().trim().max(100).optional(),
    status: Joi.string()
      .valid("all", "active", "inactive")
      .optional()
      .default("all"),
    sortBy: Joi.string()
      .valid("name", "createdAt", "updatedAt", "serviceCount")
      .optional()
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").optional().default("desc"),
    includeInactive: Joi.boolean().optional().default(false),
  }),
};

// Validation schema for searching categories
export const searchCategoriesSchema = {
  query: Joi.object({
    q: Joi.string().trim().min(1).max(100).required().messages({
      "string.empty": "Search query is required",
      "string.min": "Search query must be at least 1 character long",
      "string.max": "Search query cannot exceed 100 characters",
    }),
    limit: Joi.number().integer().min(1).max(50).optional().default(10),
    activeOnly: Joi.boolean().optional().default(true),
  }),
};

// Validation schema for updating category status
export const updateCategoryStatusSchema = {
  params: Joi.object({
    categoryId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid category ID format",
      }),
  }),
  body: Joi.object({
    isActive: Joi.boolean().required(),
    reason: Joi.string().trim().max(200).optional(),
  }),
};

// Validation schema for bulk updating categories
export const bulkUpdateCategoriesSchema = {
  body: Joi.object({
    categoryIds: Joi.array()
      .items(
        Joi.string()
          .pattern(/^[0-9a-fA-F]{24}$/)
          .messages({
            "string.pattern.base": "Invalid category ID format",
          })
      )
      .min(1)
      .max(50)
      .required()
      .messages({
        "array.min": "At least one category ID is required",
        "array.max": "Cannot update more than 50 categories at once",
      }),
    updateData: Joi.object({
      isActive: Joi.boolean().optional(),
      color: Joi.string()
        .pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
        .optional()
        .messages({
          "string.pattern.base": "Color must be a valid hex color code",
        }),
    })
      .min(1)
      .required()
      .messages({
        "object.min": "At least one field to update is required",
      }),
  }),
};

// Validation schema for reordering categories
export const reorderCategoriesSchema = {
  body: Joi.object({
    categoryOrder: Joi.array()
      .items(
        Joi.object({
          categoryId: Joi.string()
            .pattern(/^[0-9a-fA-F]{24}$/)
            .required()
            .messages({
              "string.pattern.base": "Invalid category ID format",
            }),
          position: Joi.number().integer().min(1).optional(),
        })
      )
      .min(1)
      .max(100)
      .required()
      .messages({
        "array.min": "At least one category is required",
        "array.max": "Cannot reorder more than 100 categories at once",
      }),
  }),
};

// Validation schema for checking category name existence
export const checkCategoryNameSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(50).required().messages({
      "string.empty": "Category name is required",
      "string.min": "Category name must be at least 2 characters long",
      "string.max": "Category name cannot exceed 50 characters",
    }),
    excludeId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional()
      .messages({
        "string.pattern.base": "Invalid category ID format",
      }),
  }),
};

// Validation schema for category analytics
export const getCategoryAnalyticsSchema = {
  query: Joi.object({
    period: Joi.string()
      .valid("day", "week", "month")
      .optional()
      .default("month"),
    year: Joi.number()
      .integer()
      .min(2020)
      .max(new Date().getFullYear() + 1)
      .optional()
      .default(new Date().getFullYear()),
  }),
};

// Validation schema for exporting categories
export const exportCategoriesSchema = {
  query: Joi.object({
    format: Joi.string().valid("json", "csv").optional().default("json"),
    includeInactive: Joi.boolean().optional().default(false),
  }),
};

// Validation schema for category ID parameter
export const categoryIdSchema = {
  params: Joi.object({
    categoryId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid category ID format",
      }),
  }),
};
