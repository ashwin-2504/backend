import dotenv from 'dotenv';
import os from 'os';
import { logger } from './logger.js';

dotenv.config();

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

export const validateEnv = () => {
  // Critical — app cannot function without these
  const required = [
    'FIREBASE_CONFIG',
    'FIREBASE_PROJECT_ID',
  ];

  // Important — specific features break without these
  const recommended = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
  ];

  // Firebase auth needs at least one credential source
  const hasFirebaseCreds =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

  const missingRequired = required.filter(key => !process.env[key]);
  const missingRecommended = recommended.filter(key => !process.env[key]);

  if (missingRequired.length > 0) {
    logger.error(`FATAL: Missing required environment variables: ${missingRequired.join(', ')}`);
    throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  }

  if (!hasFirebaseCreds) {
    logger.error('FATAL: No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY');
    throw new Error('No Firebase credentials configured');
  }

  if (missingRecommended.length > 0) {
    logger.warn(`Missing recommended env vars (some features may not work): ${missingRecommended.join(', ')}`);
  }

  logger.info('Environment validation passed');
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  apiUrl: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `http://${getLocalIp()}:${process.env.PORT || 3000}`,
  localIp: getLocalIp()
};
