// src/middleware/errorHandler.ts - Clean error handling middleware

import { NextFunction, Request, Response } from "express";
import { config } from "../config/environment";
import { OperationalError } from "../types/errors";
import { sendErrorDev, sendErrorProd } from "../utils/errorResponses";
import {
  handleCastErrorDB,
  handleDuplicateFieldsDB,
  handleValidationErrorDB,
  handleJWTError,
  handleJWTExpiredError,
  handleMongoNetworkError,
  handleMongoTimeoutError,
  handleMulterError,
} from "../utils/errorHandlers";
import {
  isCastError,
  isDuplicateError,
  isValidationError,
  isJWTError,
  isJWTExpiredError,
  isMongoNetworkError,
  isMongoTimeoutError,
  isMulterError,
} from "../utils/errorTypeGuards";

// Main error handler middleware
const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (config.nodeEnv === "development") {
    sendErrorDev(err, req, res);
  } else {
    let error: OperationalError = { ...err };
    error.message = err.message;
    error.name = err.name;

    // Handle specific error types using type guards
    if (isCastError(err)) {
      error = handleCastErrorDB(err);
    } else if (isDuplicateError(err)) {
      error = handleDuplicateFieldsDB(err);
    } else if (isValidationError(err)) {
      error = handleValidationErrorDB(err);
    } else if (isJWTError(err)) {
      error = handleJWTError();
    } else if (isJWTExpiredError(err)) {
      error = handleJWTExpiredError();
    } else if (isMongoNetworkError(err)) {
      error = handleMongoNetworkError();
    } else if (isMongoTimeoutError(err)) {
      error = handleMongoTimeoutError();
    } else if (isMulterError(err)) {
      error = handleMulterError(err);
    }

    sendErrorProd(error, req, res);
  }
};

export default errorHandler;
