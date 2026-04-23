import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const parseServiceAccount = () => {
  // Priority 1: Full JSON string in env
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    logger.info('Using FIREBASE_SERVICE_ACCOUNT_JSON env var');
    return JSON.parse(rawJson);
  }

  // Priority 2: JSON file path (GOOGLE_APPLICATION_CREDENTIALS)
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath) {
    try {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        const content = fs.readFileSync(resolved, 'utf8');
        logger.info(`Loaded service account from file: ${resolved}`);
        return JSON.parse(content);
      }
    } catch (e) {
      logger.warn(`Failed to load service account file: ${filePath}`, e);
    }
  }

  // Priority 3: Individual env vars (legacy)
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;

  if (clientEmail && privateKey && projectId) {
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    return {
      projectId,
      clientEmail,
      privateKey: formattedKey,
    };
  }

  return null;
};

const initializeFirebase = (): admin.app.App => {
  if (admin.apps.length) {
    return admin.apps[0]!;
  }

  const serviceAccount = parseServiceAccount();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  const firebaseConfig = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};

  // Try service account credentials first, fall back to ADC if PEM is malformed
  if (serviceAccount) {
    try {
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.projectId || projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
      logger.info(`Firebase Admin Initialized successfully for project: ${app.options.projectId || projectId}`);
      return app;
    } catch (certError) {
      logger.warn('Service account cert failed. Falling back to Application Default Credentials.', certError);
    }
  }

  // Fallback: Application Default Credentials
  const app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
    storageBucket: firebaseConfig.storageBucket,
  });

  logger.warn(`Firebase Admin using Application Default Credentials for project: ${app.options.projectId || projectId}`);
  return app;
};

// Initialize once — errors now propagate properly instead of
// silently failing then crashing on auth()/firestore() calls.
const app = initializeFirebase();

export const firebaseAdmin = admin;
export const auth = app.auth();
export const db = app.firestore();
