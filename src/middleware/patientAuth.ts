import { NextFunction, Request, Response } from "express";
import { AppError } from "../types/errors";
import jwt from "jsonwebtoken"
import Patient from "../models/Patient";

interface DecodedToken {
    patientId: string;
    type: string;
    iat: number;
    exp: number;
}

const patientAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
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

        const decoded = jwt.verify(token, secret) as DecodedToken;

        if (decoded.type !== 'patient') {
            throw new AppError('Invalid token type. Patient access required.', 401);
        }

        // Check if patient still exists and is active
        const patient = await Patient.findById(decoded.patientId).select('+authentication.isVerified');

        if (!patient) {
            throw new AppError('The patient belonging to this token no longer exists.', 401);
        }

        if (!patient.isActive) {
            throw new AppError('Your account has been deactivated. Please contact support.', 401);
        }

        if (!patient.authentication || !patient.authentication.isVerified) {
            throw new AppError('Please verify your email before accessing this resource.', 401);
        }

        // Grant access to protected route
        res.locals.patient = {
            id: patient._id.toString(),
            patientId: patient.patientId,
            email: patient.contactInfo.email,
            isVerified: patient.authentication.isVerified
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

export default patientAuthMiddleware;