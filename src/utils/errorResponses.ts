// src/utils/errorResponses.ts - Error response formatting

import { Request, Response } from "express";
import { OperationalError, ErrorResponse } from "../types/errors";
import logger from "./logger";

// Enhanced development error response
export const sendErrorDev = (
  err: OperationalError,
  req: Request,
  res: Response
): void => {
  const errorResponse: ErrorResponse = {
    success: false,
    status: err.status || "error",
    statusCode: err.statusCode || 500,
    message: err.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    stack: err.stack,
    details: {
      name: err.name,
      code: err.code,
      path: err.path,
      value: err.value,
      keyValue: err.keyValue,
      errors: err.errors,
    },
    requestId: getRequestId(req),
  };

  // Log detailed error information
  logger.error("Development Error:", {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query,
      body: sanitizeBody(req.body),
      headers: sanitizeHeaders(req.headers),
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    },
  });

  res.status(err.statusCode || 500).json(errorResponse);
};

// Enhanced production error response
export const sendErrorProd = (
  err: OperationalError,
  req: Request,
  res: Response
): void => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const errorResponse: ErrorResponse = {
      success: false,
      status: err.status || "error",
      statusCode: err.statusCode || 500,
      message: err.message,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
      requestId: getRequestId(req),
    };

    // Log operational errors for monitoring
    logger.warn("Operational Error:", {
      message: err.message,
      statusCode: err.statusCode,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
      requestId: getRequestId(req),
    });

    res.status(err.statusCode || 500).json(errorResponse);
  } else {
    // Programming or other unknown error: don't leak error details
    const errorResponse: ErrorResponse = {
      success: false,
      status: "error",
      statusCode: 500,
      message: "Something went wrong on our end. Please try again later.",
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method,
      requestId: getRequestId(req),
    };

    // Log unexpected errors for debugging
    logger.error("Unexpected Production Error:", {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        requestId: getRequestId(req),
      },
    });

    res.status(500).json(errorResponse);
  }
};

// Helper functions
const getRequestId = (req: Request): string | undefined => {
  return (
    (req.headers["x-request-id"] as string) || (req as any).id || undefined
  );
};

const sanitizeBody = (body: any): any => {
  if (!body) return body;

  const sanitized = { ...body };
  const sensitiveFields = ["password", "token", "secret", "key", "auth"];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
};

const sanitizeHeaders = (headers: any): any => {
  const sanitized = { ...headers };
  const sensitiveHeaders = ["authorization", "cookie", "x-api-key"];

  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = "[REDACTED]";
    }
  }

  return sanitized;
};
