// src/utils/errorUtils.ts - Error utility functions

import { Request, Response, NextFunction } from "express";
import { AppError } from "../types/errors";

// Async error wrapper utility
export const catchAsync = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};

// Validation error utility
export const createValidationError = (message: string): AppError => {
  return new AppError(message, 400);
};

// Not found error utility
export const createNotFoundError = (
  resource: string = "Resource"
): AppError => {
  return new AppError(`${resource} not found`, 404);
};

// Unauthorized error utility
export const createUnauthorizedError = (
  message: string = "Unauthorized access"
): AppError => {
  return new AppError(message, 401);
};

// Forbidden error utility
export const createForbiddenError = (
  message: string = "Access forbidden"
): AppError => {
  return new AppError(message, 403);
};

// Conflict error utility
export const createConflictError = (message: string): AppError => {
  return new AppError(message, 409);
};

// Bad request error utility
export const createBadRequestError = (message: string): AppError => {
  return new AppError(message, 400);
};

// Internal server error utility
export const createInternalServerError = (
  message: string = "Internal server error"
): AppError => {
  return new AppError(message, 500);
};

// Service unavailable error utility
export const createServiceUnavailableError = (
  message: string = "Service temporarily unavailable"
): AppError => {
  return new AppError(message, 503);
};
