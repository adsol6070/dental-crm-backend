import multer, { FileFilterCallback, StorageEngine } from "multer";
import { Request } from "express";
import path from "path";
import { AppError } from "../types/errors";

// Define custom file interface extending Express.Multer.File
interface MulterFile extends Express.Multer.File {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

// Configure storage
const storage: StorageEngine = multer.diskStorage({
  destination: function (
    req: Request,
    file: MulterFile,
    cb: (error: Error | null, destination: string) => void
  ): void {
    let uploadPath: string = "uploads/";

    if (file.fieldname === "profilePicture") {
      uploadPath += "profile-pictures/";
    } else if (file.fieldname === "documents") {
      uploadPath += "medical-documents/";
    } else {
      uploadPath += "general/";
    }

    cb(null, uploadPath);
  },
  filename: function (
    req: Request,
    file: MulterFile,
    cb: (error: Error | null, filename: string) => void
  ): void {
    // Generate unique filename
    const uniqueSuffix: string =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName: string =
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
    cb(null, fileName);
  },
});

// File filter
const fileFilter = (
  req: Request,
  file: MulterFile,
  cb: FileFilterCallback
): void => {
  if (file.fieldname === "profilePicture") {
    // Allow only image files for profile pictures
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(
        new AppError("Only image files are allowed for profile pictures", 400)
      );
    }
  } else if (file.fieldname === "documents") {
    // Allow various document types
    const allowedTypes: string[] = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError("Only PDF, DOC, DOCX, and image files are allowed", 400));
    }
  } else {
    cb(null, true);
  }
};

// Multer limits interface
interface MulterLimits {
  fileSize: number;
  files: number;
}

// Create multer instance
const upload: multer.Multer = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5, // Maximum 5 files
  } as MulterLimits,
});

export default upload;
