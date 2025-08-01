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

interface DoctorAuthPayload {
    id: string;
    doctorId: string;
    email: string;
    isVerified: boolean;
    specialization: string;
}

const doctorAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let token;
        if (req.headers.authorization?.startsWith('Bearer')) {
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

        if (decoded.type !== 'doctor') {
            throw new AppError('Invalid token type. Doctor access required.', 401);
        }

        const doctor = await Doctor.findById(decoded.doctorId).select('+authentication.isVerified');
        if (!doctor || !doctor.isActive || !doctor.authentication.isVerified) {
            throw new AppError('Invalid or inactive doctor account.', 401);
        }

        const authPayload: DoctorAuthPayload = {
            id: doctor._id.toString(),
            doctorId: doctor.doctorId,
            email: doctor.personalInfo.email,
            isVerified: doctor.authentication.isVerified,
            specialization: doctor.professionalInfo.specialization
        }

        res.locals.doctor = authPayload;

        next();

    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            next(new AppError('Invalid token. Please log in again.', 401));
        } else if (error.name === 'TokenExpiredError') {
            next(new AppError('Token expired. Please log in again.', 401));
        } else {
            next(error);
        }
    }
}

export default doctorAuthMiddleware