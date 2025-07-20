// src/utils/errorHandlers.ts - Specific error transformation logic

import {
  AppError,
  MongooseCastError,
  MongooseDuplicateError,
  MongooseValidationError,
  MulterError,
} from "../types/errors";

export const handleCastErrorDB = (err: MongooseCastError): AppError => {
  const message = `Invalid ${err.path}: ${err.value}. Please provide a valid ${err.kind}.`;
  return new AppError(message, 400);
};

export const handleDuplicateFieldsDB = (
  err: MongooseDuplicateError
): AppError => {
  let field = "field";
  let value = "value";

  if (err.keyValue) {
    // New MongoDB driver format
    field = Object.keys(err.keyValue)[0];
    value = Object.values(err.keyValue)[0] as string;
  } else {
    // Old format - extract from errmsg
    const match = err.errmsg.match(/(["'])(\\?.)*?\1/);
    value = match ? match[0] : "unknown value";

    // Try to extract field name
    const fieldMatch = err.errmsg.match(/index: (\w+)_/);
    if (fieldMatch) {
      field = fieldMatch[1];
    }
  }

  const message = `Duplicate ${field}: ${value}. This ${field} is already taken. Please use another value.`;
  return new AppError(message, 400);
};

export const handleValidationErrorDB = (
  err: MongooseValidationError
): AppError => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

export const handleJWTError = (): AppError =>
  new AppError("Invalid authentication token. Please log in again!", 401);

export const handleJWTExpiredError = (): AppError =>
  new AppError("Your session has expired. Please log in again.", 401);

export const handleMongoNetworkError = (): AppError =>
  new AppError("Database connection failed. Please try again later.", 503);

export const handleMongoTimeoutError = (): AppError =>
  new AppError("Database operation timed out. Please try again.", 504);

export const handleMulterError = (err: MulterError): AppError => {
  let message: string;

  switch (err.code) {
    case "LIMIT_FILE_SIZE":
      message = "File size too large. Please upload a smaller file.";
      break;
    case "LIMIT_FILE_COUNT":
      message = "Too many files. Please upload fewer files.";
      break;
    case "LIMIT_UNEXPECTED_FILE":
      message = `Unexpected field: ${err.field}. Please check your file upload field.`;
      break;
    case "LIMIT_PART_COUNT":
      message = "Too many parts in the multipart form.";
      break;
    default:
      message = "File upload error. Please try again.";
  }

  return new AppError(message, 400);
};
