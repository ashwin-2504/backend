import { db } from '../lib/firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import { BIZ, COL, OrderStatus } from '../utils/constants.js';

export class CleanupService {
  private interval: NodeJS.Timeout | null = null;

  start() {
    if (this.interval) return;

    logger.info(`CleanupService started - polling for stale orders every ${BIZ.CLEANUP_POLL_INTERVAL_MS / 60_000} mins`);
    this.interval = setInterval(() => this.cleanupStaleOrders(), BIZ.CLEANUP_POLL_INTERVAL_MS);

    // Run once on start
    this.cleanupStaleOrders();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async cleanupStaleOrders() {
    try {
      const now = Date.now();
      const cutoff = new Date(now - BIZ.STALE_ORDER_TIMEOUT_MINS * 60 * 1000);

      // Fetch all PENDING_PAYMENT orders and filter by date in-memory
      // (avoids composite index requirement on status + createdAt)
      const pendingSnapshot = await db.collection(COL.ORDERS)
        .where('status', '==', OrderStatus.PENDING_PAYMENT)
        .get();

      const staleDocs = pendingSnapshot.docs.filter(doc => {
        const data = doc.data();
        const createdAt = data.createdAt;
        if (!createdAt) return false;

        const createdDate = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
        return createdDate < cutoff;
      });

      if (staleDocs.length === 0) {
        return;
      }

      logger.info(`Found ${staleDocs.length} stale pending orders. Cleaning up...`);

      const batch = db.batch();

      staleDocs.forEach(doc => {
        const data = doc.data();
        batch.update(doc.ref, {
          status: OrderStatus.FAILED,
          failureReason: 'STALE_PENDING_PAYMENT_TIMEOUT',
          updatedAt: Timestamp.now(),
          orderLogs: [
            ...(data.orderLogs || []),
            {
              event: 'AUTO_FAILED_CLEANUP',
              timestamp: new Date(),
              details: 'System timed out pending payment',
            },
          ],
        });
      });

      await batch.commit();
      logger.info(`Successfully cleaned up ${staleDocs.length} stale orders`);

    } catch (error) {
      // Intentional: background task swallows errors to avoid crashing the server.
      // Errors are logged for observability.
      logger.error('Error in cleanupStaleOrders:', error);
    }
  }
}

export const cleanupService = new CleanupService();
