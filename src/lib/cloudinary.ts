import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a file buffer to Cloudinary using upload_stream
 * @param fileBuffer - The file buffer to upload
 * @param folder - The folder to store the image in Cloudinary
 * @returns Promise<UploadApiResponse>
 */
export const uploadToCloudinary = (fileBuffer: Buffer, folder: string = 'products'): Promise<UploadApiResponse> => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                quality: 'auto',
                fetch_format: 'auto',
            },
            (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
                if (error) {
                    logger.error('Cloudinary upload error:', error);
                    return reject(error);
                }
                if (!result) {
                    return reject(new Error('Cloudinary upload result is undefined'));
                }
                resolve(result);
            }
        );

        uploadStream.end(fileBuffer);
    });
};

export default cloudinary;
