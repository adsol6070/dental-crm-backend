import { NextFunction, Request, Response } from "express";
import { AppError } from "../types/errors";
import Doctor from "../models/Doctor";
import jwt from "jsonwebtoken";

interface DecodedToken {
    doctorId: string;
    type: string;
    iat: number;
    exp: number;
}


declare global {
    namespace Express {
        interface Request {

            doctor?: {
                id: string;
                doctorId: string;
                email: string;
                isVerified: boolean;
                specialization: string;
            };
        }
    }
}

const doctorAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Get token from header
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            throw new AppError('No token provided. Please log in to access this resource.', 401);
        }

        const secret = process.env.JWT_SECRET;

        if (!secret) {
            throw new Error("JWT_SECRET is not defined in environment variables.");
        }

        // Verify token
        const decoded = jwt.verify(token, secret) as DecodedToken;

        // Check if token is for doctor
        if (decoded.type !== 'doctor') {
            throw new AppError('Invalid token type. Doctor access required.', 401);
        }

        // Check if doctor still exists and is active
        const doctor = await Doctor.findById(decoded.doctorId).select('+authentication.isVerified');

        if (!doctor) {
            throw new AppError('The doctor belonging to this token no longer exists.', 401);
        }

        if (!doctor.isActive) {
            throw new AppError('Your account has been deactivated. Please contact support.', 401);
        }

        if (!doctor.authentication.isVerified) {
            throw new AppError('Please verify your email before accessing this resource.', 401);
        }

        // Grant access to protected route
        req.doctor = {
            id: doctor._id.toString(),
            doctorId: doctor.doctorId,
            email: doctor.personalInfo.email,
            isVerified: doctor.authentication.isVerified,
            specialization: doctor.professionalInfo.specialization
        };

        next();

    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            next(new AppError('Invalid token. Please log in again.', 401));
        } else if (error.name === 'TokenExpiredError') {
            next(new AppError('Your token has expired. Please log in again.', 401));
        } else {
            next(error);
        }
    }
}

export default doctorAuthMiddleware