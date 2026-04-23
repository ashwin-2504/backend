import { db } from '../../lib/firebase.js';
import { logger } from '../../utils/logger.js';
import { Order, SellerOrder } from '../../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';
import { COL, OrderStatus } from '../../utils/constants.js';

/**
 * Safely extracts a sortable timestamp from Firestore data.
 */
function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts._seconds) return ts._seconds * 1000;
  return new Date(ts).getTime() || 0;
}

/**
 * Fetches all orders for a seller, sorted newest-first.
 */
export async function getSellerOrders(sellerId: string): Promise<SellerOrder[]> {
  try {
    const snapshot = await db.collection(COL.SELLER_ORDERS)
      .where('sellerId', '==', sellerId)
      .get();

    return snapshot.docs
      .map(doc => doc.data() as SellerOrder)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    logger.error(`Error fetching orders for seller ${sellerId}`, error);
    throw error;
  }
}

/**
 * Fetches all orders for a buyer, sorted newest-first.
 */
export async function getBuyerOrders(buyerId: string): Promise<Order[]> {
  try {
    const snapshot = await db.collection(COL.ORDERS)
      .where('uid', '==', buyerId)
      .get();

    return snapshot.docs
      .map(doc => doc.data() as Order)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    logger.error(`Error fetching orders for buyer ${buyerId}`, error);
    throw error;
  }
}

/**
 * Calculates dashboard statistics for a seller.
 */
export async function getSellerStats(sellerId: string) {
  try {
    const [pSnapshot, oSnapshot] = await Promise.all([
      db.collection(COL.PRODUCTS).where('sellerId', '==', sellerId).get(),
      db.collection(COL.SELLER_ORDERS).where('sellerId', '==', sellerId).get(),
    ]);

    const orders = oSnapshot.docs.map(d => d.data() as SellerOrder);
    const revenue = orders.reduce((acc, order) => acc + (order.sellerTotal || 0), 0);
    const pendingOrdersCount = orders.filter(
      o => o.status === OrderStatus.PENDING_PAYMENT || o.status === OrderStatus.PLACED
    ).length;

    return {
      productsCount: pSnapshot.size,
      ordersCount: orders.length,
      revenue,
      pendingOrdersCount,
    };
  } catch (error) {
    logger.error(`Error calculating stats for seller ${sellerId}`, error);
    throw error;
  }
}

/**
 * Calculates dashboard statistics for a buyer.
 */
export async function getBuyerStats(buyerId: string) {
  try {
    const oSnapshot = await db.collection(COL.ORDERS)
      .where('uid', '==', buyerId)
      .get();

    const orders = oSnapshot.docs.map(d => d.data() as Order);
    const totalSpent = orders.reduce((acc, order) => acc + (order.totalAmount || 0), 0);
    const pendingOrdersCount = orders.filter(
      o => o.status === OrderStatus.PENDING_PAYMENT || o.status === OrderStatus.PLACED
    ).length;

    return {
      productsCount: 0,
      ordersCount: orders.length,
      revenue: totalSpent,
      pendingOrdersCount,
    };
  } catch (error) {
    logger.error(`Error calculating stats for buyer ${buyerId}`, error);
    throw error;
  }
}

/**
 * Fetches the active PENDING_PAYMENT order for a user (if any).
 */
export async function getActivePendingOrder(uid: string): Promise<Order | null> {
  try {
    const snapshot = await db.collection(COL.ORDERS)
      .where('uid', '==', uid)
      .get();

    if (snapshot.empty) return null;

    const pendingOrder = snapshot.docs.find(
      doc => doc.data().status === OrderStatus.PENDING_PAYMENT
    );
    return pendingOrder ? (pendingOrder.data() as Order) : null;
  } catch (error) {
    logger.error(`Error fetching active order for ${uid}:`, error);
    return null;
  }
}
