import { db } from '../lib/firebase.js';
import { StockLock } from '../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import { COL } from '../utils/constants.js';

export class StockLockService {
  /**
   * Locks stock for a product during checkout.
   * Uses a transaction to ensure stock is available before locking.
   */
  async lockStock(productId: string, qty: number, orderId: string, uid: string, expiresAt: Date): Promise<boolean> {
    try {
      return await db.runTransaction(async (transaction) => {
        const productRef = db.collection(COL.PRODUCTS).doc(productId);
        const lockRef = db.collection(COL.STOCK_LOCKS).doc(`${productId}_${orderId}`);

        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          throw new Error('Product not found');
        }

        const productData = productDoc.data() as any;
        const currentStock = productData.stockQty || 0;

        // Check existing locks (in-memory filtering to avoid composite index)
        const allLocksForProduct = await db.collection(COL.STOCK_LOCKS)
          .where('productId', '==', productId)
          .get();

        const now = Timestamp.now();
        let totalLocked = 0;
        allLocksForProduct.forEach(doc => {
          const data = doc.data();
          if (data.expiresAt > now) {
            totalLocked += data.lockedQty || 0;
          }
        });

        if (currentStock - totalLocked < qty) {
          throw new Error(`Insufficient stock: ${currentStock} available, ${totalLocked} locked, ${qty} requested`);
        }

        const lockData: StockLock = {
          productId,
          lockedQty: qty,
          orderId,
          uid,
          expiresAt: Timestamp.fromDate(expiresAt),
        };

        transaction.set(lockRef, lockData, { merge: true });
        return true;
      });
    } catch (error) {
      // Intentional: returns false for graceful degradation rather than crashing checkout.
      logger.error(`Error locking stock for product ${productId}`, error);
      return false;
    }
  }

  /**
   * Releases stock lock if an order is cancelled or expires.
   */
  async releaseLock(productId: string, orderId: string): Promise<void> {
    try {
      const locksSnapshot = await db.collection(COL.STOCK_LOCKS)
        .where('orderId', '==', orderId)
        .get();

      const batch = db.batch();
      locksSnapshot.forEach(doc => {
        if (doc.data().productId === productId) {
          batch.delete(doc.ref);
        }
      });
      await batch.commit();
    } catch (error) {
      logger.error(`Error releasing lock for order ${orderId}`, error);
    }
  }

  /**
   * Cleanup task for expired locks.
   */
  async cleanupExpiredLocks(): Promise<number> {
    try {
      const expiredSnapshot = await db.collection(COL.STOCK_LOCKS)
        .where('expiresAt', '<=', Timestamp.now())
        .get();

      if (expiredSnapshot.empty) return 0;

      const batch = db.batch();
      expiredSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      return expiredSnapshot.size;
    } catch (error) {
      logger.error('Error cleaning up expired locks', error);
      return 0;
    }
  }
}

export const stockLockService = new StockLockService();
