// src/types/errors.ts - All error-related type definitions

// Base interfaces for different error types
export interface MongooseCastError extends Error {
  name: "CastError";
  path: string;
  value: any;
  kind: string;
}

export interface MongooseDuplicateError extends Error {
  code: 11000;
  errmsg: string;
  keyValue?: Record<string, any>;
}

export interface MongooseValidationError extends Error {
  name: "ValidationError";
  errors: Record<string, { message: string; path: string; value: any }>;
}

export interface JWTError extends Error {
  name: "JsonWebTokenError";
}

export interface JWTExpiredError extends Error {
  name: "TokenExpiredError";
}

export interface MongoNetworkError extends Error {
  name: "MongoNetworkError" | "MongooseServerSelectionError";
}

export interface MongoTimeoutError extends Error {
  name: "MongoTimeoutError" | "MongoServerSelectionError";
}

export interface MulterError extends Error {
  name: "MulterError";
  code: string;
  field?: string;
}

// Extended Error interface for operational errors
export interface OperationalError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: string | number;
  path?: string;
  value?: any;
  keyValue?: Record<string, any>;
  errors?: Record<string, any>;
}

// Standardized error response interface
export interface ErrorResponse {
  success: false;
  status: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  stack?: string;
  details?: any;
  requestId?: string;
}

// Custom Application Error class
export class AppError extends Error {
  public statusCode: number;
  public status: string;
  public isOperational: boolean;
  public code?: string | number;
  public path?: string;
  public value?: any;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}