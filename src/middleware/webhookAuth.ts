import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { AppError } from "../types/errors";

const webhookAuth = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const signature: string | string[] | undefined =
      req.headers["x-webhook-signature"];
    const timestamp: string | string[] | undefined =
      req.headers["x-webhook-timestamp"];
    const webhookSecret: string | undefined = process.env.WEBHOOK_SECRET;

    if (!webhookSecret) {
      return next(); // Skip verification if no secret is set (development only)
    }

    if (
      !signature ||
      !timestamp ||
      Array.isArray(signature) ||
      Array.isArray(timestamp)
    ) {
      throw new AppError(
        "Missing or invalid webhook signature or timestamp",
        401
      );
    }

    // Check timestamp (prevent replay attacks)
    const currentTime: number = Math.floor(Date.now() / 1000);
    const timestampNumber: number = parseInt(timestamp as string, 10);

    if (isNaN(timestampNumber)) {
      throw new AppError("Invalid timestamp format", 401);
    }

    if (Math.abs(currentTime - timestampNumber) > 300) {
      // 5 minutes tolerance
      throw new AppError("Webhook timestamp too old", 401);
    }

    // Verify signature
    const payload: string = JSON.stringify(req.body);
    const expectedSignature: string = crypto
      .createHmac("sha256", webhookSecret)
      .update(timestamp + "." + payload)
      .digest("hex");

    if (signature !== expectedSignature) {
      throw new AppError("Invalid webhook signature", 401);
    }

    next();
  } catch (error: unknown) {
    next(error);
  }
};

export default webhookAuth;
