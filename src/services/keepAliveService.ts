import { db } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';

const KEEP_ALIVE_COLLECTIONS = ['products', 'orders', 'transactions'] as const;

export class KeepAliveService {
  async pingDatabase() {
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];

    for (const collection of KEEP_ALIVE_COLLECTIONS) {
      try {
        await db.collection(collection).limit(1).get();
        logger.info('Firebase Firestore keep-alive ping succeeded', { collection, checkedAt });
        return { ok: true, collection, checkedAt };
      } catch (error: any) {
        errors.push(`${collection}: ${error.message}`);
      }
    }

    const message = `Firestore keep-alive failed for all probe collections: ${errors.join('; ')}`;
    logger.error(message);
    throw new Error(message);
  }
}

export const keepAliveService = new KeepAliveService();
