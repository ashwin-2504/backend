import { db } from '../../lib/firebase.js';
import { logger } from '../../utils/logger.js';
import { Order } from '../../types/models.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { BIZ, COL, OrderStatus } from '../../utils/constants.js';

// ── Private Helpers ──────────────────────────────────────────────────

/**
 * Validates payment binding against the order.
 * Enforces ownership, amount lock, and replay protection.
 */
function verifyPaymentBinding(payment: any, order: Order, uid: string, orderId: string): void {
  if (payment.userId !== uid) throw new Error('PAYMENT_OWNERSHIP_MISMATCH');
  if (payment.userId !== order.uid) throw new Error('PAYMENT_ORDER_USER_MISMATCH');
  if (payment.orderId !== orderId) throw new Error('PAYMENT_ORDER_BINDING_ERROR');
  if (payment.amount !== order.lockedAmount) throw new Error('PAYMENT_AMOUNT_DRIFT_DETECTED');

  // Replay protection — payment must be created after the order
  const pCreated = typeof payment.createdAt?.toDate === 'function' ? payment.createdAt.toDate() : new Date(payment.createdAt);
  const oCreated = typeof (order.createdAt as any)?.toDate === 'function' ? (order.createdAt as any).toDate() : new Date(order.createdAt as any);
  if (pCreated < oCreated) throw new Error('PAYMENT_REPLAY_DETECTED');

  if (payment.status === 'FAILED') throw new Error('PAYMENT_FAILED_IN_PROVIDER');
}

/**
 * Performs atomic stock re-check against current product quantities.
 * Returns list of product names that have insufficient stock.
 */
function findStockFailures(orderItems: any[], productMap: Map<string, any>): string[] {
  const failures: string[] = [];
  for (const item of orderItems) {
    const product = productMap.get(item.productId);
    if (!product || product.stockQty < item.qty) {
      failures.push(item.productSnapshot.name);
    }
  }
  return failures;
}

/**
 * Creates seller order documents for each seller in the order.
 */
function createSellerOrders(
  transaction: FirebaseFirestore.Transaction,
  order: Order,
  buyerName: string,
  orderId: string
): void {
  const sellerGroups = new Map<string, any[]>();
  (order.items as any[]).forEach(item => {
    const group = sellerGroups.get(item.sellerId) || [];
    group.push(item);
    sellerGroups.set(item.sellerId, group);
  });

  for (const [sellerId, sItems] of sellerGroups.entries()) {
    const sellerOrderRef = db.collection(COL.SELLER_ORDERS).doc(`${sellerId}_${orderId}`);
    const subtotal = sItems.reduce((sum, i) => sum + i.priceAtPurchase * i.qty, 0);

    transaction.set(sellerOrderRef, {
      docId: `${sellerId}_${orderId}`,
      sellerId,
      orderId,
      buyerName,
      status: OrderStatus.PLACED,
      items: sItems,
      subtotal,
      earnings: subtotal, // MVP: earnings = subtotal
      createdAt: Timestamp.now(),
    });
  }
}

// ── Public Service ───────────────────────────────────────────────────

/**
 * T3: Confirm Order
 * Atomic finalization after payment success — verifies payment, re-checks stock,
 * decrements inventory, creates seller orders, and finalizes the order.
 */
export async function confirmOrder(
  uid: string,
  orderId: string,
  paymentId: string,
  idempotencyKey?: string
): Promise<Order> {
  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Confirmation idempotency check
      if (idempotencyKey) {
        const idemRef = db.collection(COL.IDEMPOTENCY_CONFIRM).doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists) {
          const data = idemSnap.data();
          if (data?.orderId === orderId) {
            const orderSnap = await transaction.get(db.collection(COL.ORDERS).doc(orderId));
            return orderSnap.data() as Order;
          }
        }
      }

      // 2. Fetch & guard order
      const orderRef = db.collection(COL.ORDERS).doc(orderId);
      const [orderSnap, userSnap] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(db.collection(COL.USER_PROFILES).doc(uid)),
      ]);

      if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');
      const order = orderSnap.data() as Order;
      const userData = userSnap.exists ? (userSnap.data() as any) : null;
      const buyerName = userData?.name || 'Customer';

      // Auth & state guards
      if (order.uid !== uid) throw new Error('UNAUTHORIZED_ORDER_ACCESS');
      if (order.status === OrderStatus.PLACED) return order; // Recovery path
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new Error(`INVALID_ORDER_STATE|${order.status}`);
      }

      // 3. Verify payment binding
      const paymentRef = db.collection(COL.PAYMENTS).doc(paymentId);
      const paymentSnap = await transaction.get(paymentRef);
      if (!paymentSnap.exists) throw new Error('PAYMENT_SESSION_NOT_FOUND');
      const payment = paymentSnap.data() as any;

      verifyPaymentBinding(payment, order, uid, orderId);

      // 4. Atomic stock re-check
      const productIds = Array.from(new Set(order.items.map(i => i.productId)));
      const productSnaps = await Promise.all(
        productIds.map((id: string) => transaction.get(db.collection(COL.PRODUCTS).doc(id)))
      );
      const productMap = new Map<string, any>();
      productSnaps.forEach(snap => {
        if (snap.exists) productMap.set(snap.id, snap.data());
      });

      const failedItems = findStockFailures(order.items as any[], productMap);

      // 5. Post-payment stock failure handling
      if (failedItems.length > 0) {
        const failureReason = `POST_PAYMENT_STOCK_FAILURE|${failedItems.join(',')}`;
        const updatedLogs = [
          ...(order.orderLogs || []),
          { event: 'STOCK_CHECK_FAILED', timestamp: new Date(), details: failureReason },
        ];

        transaction.update(orderRef, {
          status: OrderStatus.REFUND_REQUIRED,
          failureReason: 'POST_PAYMENT_STOCK_FAILURE',
          orderLogs: updatedLogs,
          updatedAt: Timestamp.now(),
        });
        transaction.update(paymentRef, { status: 'FAILED', updatedAt: Timestamp.now() });

        logger.warn(
          `Order ${orderId} marked for REFUND due to post-payment stock failure: ${failedItems.join(', ')}`
        );
        throw new Error(failureReason);
      }

      // 6. Success path — atomic finalization
      // A. Decrement stock
      for (const item of order.items as any[]) {
        transaction.update(db.collection(COL.PRODUCTS).doc(item.productId), {
          stockQty: FieldValue.increment(-item.qty),
        });
      }

      // B. Create seller orders
      createSellerOrders(transaction, order, buyerName, orderId);

      // C. Update order status
      const finalLogs = [...(order.orderLogs || []), { event: 'PLACED', timestamp: new Date() }];
      const updateData = {
        status: OrderStatus.PLACED,
        paymentStatus: 'PAID',
        paymentId,
        orderLogs: finalLogs,
        updatedAt: Timestamp.now(),
      };
      transaction.update(orderRef, updateData);

      // D. Update payment status
      transaction.update(paymentRef, { status: 'SUCCESS', updatedAt: Timestamp.now() });

      // E. Record idempotency
      if (idempotencyKey) {
        transaction.set(db.collection(COL.IDEMPOTENCY_CONFIRM).doc(idempotencyKey), {
          orderId,
          status: 'SUCCESS',
          createdAt: Timestamp.now(),
          expiresAt: new Date(Date.now() + BIZ.IDEMPOTENCY_TTL_MS),
        });
      }

      return { ...order, ...updateData } as Order;
    });
  } catch (error: any) {
    logger.error(`Error in confirmOrder for ${orderId}:`, error);
    throw error;
  }
}
