// middleware/authMiddleware.ts - Admin authentication middleware
import { NextFunction, Request, Response } from "express";
import { AppError } from "../types/errors";
import jwt from "jsonwebtoken";
import User from "../models/User";

// Extend Request interface to include admin user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                role: string;
                permissions: string[];
                isActive: boolean;
            };
        }
    }
}

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            throw new AppError("Access token is required", 401);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

        const user = await User.findById(decoded.userId).select('-password');
        if (!user) {
            throw new AppError("User not found", 401);
        }

        if (!user.isActive || user.status !== "active") {
            throw new AppError("Account is inactive or suspended", 401);
        }

        req.user = {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            permissions: user.permissions,
            isActive: user.isActive
        };

        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            next(new AppError("Invalid token", 401));
        } else {
            next(error);
        }
    }
};

export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== "super_admin") {
        throw new AppError("Super admin access required", 403);
    }
    next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !["super_admin", "admin"].includes(req.user.role)) {
        throw new AppError("Admin access required", 403);
    }
    next();
};

export const authRateLimit = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
    const attempts = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
        const identifier = req.ip + req.body.email;
        const now = Date.now();

        // Clean up expired entries
        const entry = attempts.get(identifier);
        if (entry && now > entry.resetTime) {
            attempts.delete(identifier);
        }

        const current = attempts.get(identifier) || { count: 0, resetTime: now + windowMs };

        if (current.count >= maxAttempts) {
            const resetIn = Math.ceil((current.resetTime - now) / 1000);
            throw new AppError(`Too many attempts. Try again in ${resetIn} seconds`, 429);
        }

        // Increment attempt count
        current.count++;
        attempts.set(identifier, current);

        // Reset count on successful request (you'd call this in your success handler)
        res.locals.resetAttempts = () => attempts.delete(identifier);

        next();
    };
};

export default authMiddleware;