// middleware/validateRequest.ts
import Joi from "joi";
import { Request, Response, NextFunction } from "express";

// Enhanced Request interface to include validated data
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
      validatedQuery?: any;
        validatedParams?: any;
    }
  }
}

// Validation options interface
interface ValidationOptions {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  abortEarly?: boolean;
  allowUnknown?: boolean;
  stripUnknown?: boolean;
}

// Error response interface
interface ValidationErrorResponse {
  success: boolean;
  message: string;
  errors: Array<{
    field: string;
    message: string;
    value?: any;
    type: "body" | "query" | "params";
  }>;
}

/**
 * Main validateRequest middleware function
 * Can validate body, query parameters, and route parameters
 */
const validateRequest = (
  schema: Joi.ObjectSchema | ValidationOptions,
  options: ValidationOptions = {}
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    let validationConfig: ValidationOptions;

    // Handle both single schema and multiple schema configurations
    if (Joi.isSchema(schema)) {
      // If it's a single Joi schema, apply it to the request body
      validationConfig = {
        body: schema as Joi.ObjectSchema,
        ...options,
      };
    } else {
      // If it's a configuration object with multiple schemas
      validationConfig = { ...schema, ...options };
    }

    const {
      body: bodySchema,
      query: querySchema,
      params: paramsSchema,
      abortEarly = false,
      allowUnknown = false,
      stripUnknown = true,
    } = validationConfig;

    const errors: ValidationErrorResponse["errors"] = [];
    const joiOptions = { abortEarly, allowUnknown, stripUnknown };

    // Validate request body
    if (bodySchema && Object.keys(req.body || {}).length > 0) {
      let dataToValidate = req.body;

      // For PUT requests with ID parameters, include the ID in validation
      if (
        req.method === "PUT" &&
        req.params &&
        Object.keys(req.params).length > 0
      ) {
        dataToValidate = { ...req.body, ...req.params };
      }

      const { error, value } = bodySchema.validate(dataToValidate, joiOptions);

      if (error) {
        const bodyErrors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
          type: "body" as const,
        }));
        errors.push(...bodyErrors);
      } else {
        req.validatedData = value;
      }
    }

    // Validate query parameters
    if (querySchema && Object.keys(req.query || {}).length > 0) {
      const { error, value } = querySchema.validate(req.query, joiOptions);

      if (error) {
        const queryErrors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
          type: "query" as const,
        }));
        errors.push(...queryErrors);
      } else {
        req.validatedQuery = value;
      }
    }

    // Validate route parameters
    if (paramsSchema && Object.keys(req.params || {}).length > 0) {
      const { error, value } = paramsSchema.validate(req.params, joiOptions);

      if (error) {
        const paramErrors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
          value: detail.context?.value,
          type: "params" as const,
        }));
        errors.push(...paramErrors);
      } else {
        req.validatedParams = value;
      }
    }

    // If there are validation errors, return them
    if (errors.length > 0) {
      const response: ValidationErrorResponse = {
        success: false,
        message: "Validation error",
        errors,
      };

      res.status(400).json(response);
      return; // Important: return void, not the response object
    }

    // Continue to next middleware
    next();
  };
};

/**
 * Specialized middleware for different validation scenarios
 */

// Validate only request body (most common use case)
export const validateBody = (
  schema: Joi.ObjectSchema,
  options: Partial<ValidationOptions> = {}
) => {
  return validateRequest({ body: schema }, options);
};

// Validate only query parameters
export const validateQuery = (
  schema: Joi.ObjectSchema,
  options: Partial<ValidationOptions> = {}
) => {
  return validateRequest({ query: schema }, options);
};

// Validate only route parameters
export const validateParams = (
  schema: Joi.ObjectSchema,
  options: Partial<ValidationOptions> = {}
) => {
  return validateRequest({ params: schema }, options);
};

// Validate multiple parts of the request
export const validateMultiple = (config: ValidationOptions) => {
  return validateRequest(config);
};

/**
 * Common parameter validation schemas for reuse
 */
export const commonParams = {
  // MongoDB ObjectId validation
  objectId: Joi.object({
    id: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid ID format",
      }),
  }),

  // Patient ID validation
  patientId: Joi.object({
    patientId: Joi.string()
      .pattern(/^PAT-\d+-[a-z0-9]{9}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid patient ID format",
      }),
  }),

  // Appointment ID validation
  appointmentId: Joi.object({
    appointmentId: Joi.string()
      .pattern(/^APT-\d+-[a-z0-9]{9}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid appointment ID format",
      }),
  }),

  // Token validation
  token: Joi.object({
    token: Joi.string().required().messages({
      "string.empty": "Token is required",
    }),
  }),

  // Pagination parameters
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1).optional(),
    limit: Joi.number().integer().min(1).max(100).default(10).optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid("asc", "desc").default("desc").optional(),
  }),
};

/**
 * Utility functions for validation
 */
export const validationUtils = {
  // Create a validation middleware that handles both body and params
  createValidator: (
    bodySchema?: Joi.ObjectSchema,
    paramsSchema?: Joi.ObjectSchema
  ) => {
    const config: ValidationOptions = {};
    if (bodySchema) config.body = bodySchema;
    if (paramsSchema) config.params = paramsSchema;
    return validateRequest(config);
  },

  // Create a search/filter validator with pagination
  createSearchValidator: (customQuerySchema?: Joi.ObjectSchema) => {
    const baseQuerySchema = commonParams.pagination;
    const finalSchema = customQuerySchema
      ? baseQuerySchema.concat(customQuerySchema)
      : baseQuerySchema;

    return validateQuery(finalSchema);
  },

  // Merge multiple Joi schemas
  mergeSchemas: (...schemas: Joi.ObjectSchema[]) => {
    return schemas.reduce((merged, schema) => merged.concat(schema));
  },
};

/**
 * Express error handler for validation errors (optional)
 */
export const validationErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error.isJoi) {
    const validationError: ValidationErrorResponse = {
      success: false,
      message: "Validation error",
      errors: error.details.map((detail: any) => ({
        field: detail.path.join("."),
        message: detail.message,
        value: detail.context?.value,
        type: "body" as const,
      })),
    };

    res.status(400).json(validationError);
    return;
  }

  next(error);
};

// Export the main function as default
export default validateRequest;
