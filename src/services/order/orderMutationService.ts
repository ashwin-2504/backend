import { db } from '../../lib/firebase.js';
import { logger } from '../../utils/logger.js';
import { Order } from '../../types/models.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { COL, OrderStatus } from '../../utils/constants.js';

/** Statuses from which cancellation should restore stock. */
const STOCK_DECREMENT_STATUSES: ReadonlySet<string> = new Set([
  OrderStatus.PLACED,
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
]);

/**
 * Transitions an order to a new status within a transaction.
 * Propagates the change to all related seller orders and restores
 * stock if cancelling from a post-payment state.
 */
export async function updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
  try {
    await db.runTransaction(async (transaction) => {
      const orderRef = db.collection(COL.ORDERS).doc(orderId);
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists) throw new Error('Order not found');

      const order = orderDoc.data() as Order;
      const oldStatus = order.status;
      if (oldStatus === status) return;

      transaction.update(orderRef, { status, updatedAt: Timestamp.now() });

      // Propagate to seller orders
      for (const sellerId of (order.sellerIds || [])) {
        const sellerOrderRef = db.collection(COL.SELLER_ORDERS).doc(`${sellerId}_${orderId}`);
        const sellerDoc = await transaction.get(sellerOrderRef);
        if (sellerDoc.exists) {
          transaction.update(sellerOrderRef, { status });
        }
      }

      // Stock recovery on cancellation
      if (status === OrderStatus.CANCELLED && STOCK_DECREMENT_STATUSES.has(oldStatus)) {
        for (const item of (order.items || [])) {
          transaction.update(db.collection(COL.PRODUCTS).doc(item.productId), {
            stockQty: FieldValue.increment(item.qty),
          });
        }
      }
    });
  } catch (error: any) {
    logger.error(`Error updating order status for ${orderId}`, error);
    throw error;
  }
}

/**
 * Handles payment failure — placeholder for future implementation.
 */
export async function handlePaymentFailure(
  uid: string,
  orderId: string,
  reason: string
): Promise<void> {
  // Already stubbed in original — preserving interface
  logger.warn(`Payment failure for order ${orderId} by ${uid}: ${reason}`);
}

/**
 * Atomically increments the payment attempt counter for an order.
 */
export async function incrementPaymentAttempt(orderId: string): Promise<void> {
  try {
    const orderRef = db.collection(COL.ORDERS).doc(orderId);
    await orderRef.update({
      paymentAttempts: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });
    logger.info(`Incremented payment attempt for order ${orderId}`);
  } catch (error) {
    logger.error('Error incrementing payment attempts:', error);
  }
}
