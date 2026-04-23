import { uploadToCloudinary } from '../lib/cloudinary.js';
import fs from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Verification script for Cloudinary uploads.
 * Usage: npx ts-node src/scripts/verifyCloudinary.ts <path-to-image>
 */
async function verify() {
    const imagePath = process.argv[2];
    if (!imagePath) {
        logger.error('Usage: npx ts-node src/scripts/verifyCloudinary.ts <path-to-image>');
        process.exit(1);
    }

    try {
        logger.info('Testing Cloudinary upload...');
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image not found at ${imagePath}`);
        }

        const buffer = fs.readFileSync(imagePath);
        const result = await uploadToCloudinary(buffer, 'test_uploads');

        logger.info('Upload successful!');
        logger.info(`Public ID: ${result.public_id}`);
        logger.info(`URL: ${result.secure_url}`);

        process.exit(0);
    } catch (error) {
        logger.error('Upload failed:', error);
        process.exit(1);
    }
}

verify();
