// src/utils/errorTypeGuards.ts - Type guard functions

import {
  MongooseCastError,
  MongooseDuplicateError,
  MongooseValidationError,
  JWTError,
  JWTExpiredError,
  MongoNetworkError,
  MongoTimeoutError,
  MulterError,
} from "../types/errors";

export const isCastError = (err: any): err is MongooseCastError => {
  return err.name === "CastError";
};

export const isDuplicateError = (err: any): err is MongooseDuplicateError => {
  return err.code === 11000;
};

export const isValidationError = (err: any): err is MongooseValidationError => {
  return err.name === "ValidationError";
};

export const isJWTError = (err: any): err is JWTError => {
  return err.name === "JsonWebTokenError";
};

export const isJWTExpiredError = (err: any): err is JWTExpiredError => {
  return err.name === "TokenExpiredError";
};

export const isMongoNetworkError = (err: any): err is MongoNetworkError => {
  return (
    err.name === "MongoNetworkError" ||
    err.name === "MongooseServerSelectionError"
  );
};

export const isMongoTimeoutError = (err: any): err is MongoTimeoutError => {
  return (
    err.name === "MongoTimeoutError" || err.name === "MongoServerSelectionError"
  );
};

export const isMulterError = (err: any): err is MulterError => {
  return err.name === "MulterError";
};
