import { db } from '../../lib/firebase.js';
import { logger } from '../../utils/logger.js';
import { Order, OrderItem } from '../../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';
import { isWithinDeliveryRange } from '../../utils/distance.js';
import { BIZ, COL } from '../../utils/constants.js';

// ── Helper Types ─────────────────────────────────────────────────────

interface ProcessedSellerOrder {
  sellerId: string;
  items: OrderItem[];
  subtotal: number;
  delivery_charge: number;
  delivery_mode: string;
}

// ── Private Helpers ──────────────────────────────────────────────────

/**
 * Groups items by sellerId for multi-seller order processing.
 */
function buildSellerGroups(items: Partial<OrderItem>[]): Map<string, Partial<OrderItem>[]> {
  const groups = new Map<string, Partial<OrderItem>[]>();
  for (const item of items) {
    const group = groups.get(item.sellerId!) || [];
    group.push(item);
    groups.set(item.sellerId!, group);
  }
  return groups;
}

/**
 * Validates a single order item against the authoritative product data.
 * Returns the validated item with server-computed price.
 */
function validateAndPriceItem(
  item: Partial<OrderItem>,
  product: any,
  userLoc: any,
  userPincode: string | undefined
): OrderItem {
  if (!product) throw new Error(`Product ${item.productId} not found`);

  // Quantity validation
  if (item.qty! < (product.minQty || BIZ.DEFAULT_MIN_QTY)) {
    throw new Error(`MIN_QTY_NOT_MET|${product.name}`);
  }
  if (item.qty! > (product.maxQty || BIZ.MAX_STOCK_QTY_FALLBACK)) {
    throw new Error(`MAX_QTY_EXCEEDED|${product.name}`);
  }

  // Stock evaluation
  if (product.stockQty < item.qty!) {
    throw new Error(`INSUFFICIENT_STOCK|${product.name}`);
  }

  // Distance validation
  const isDeliverable = checkDeliverability(product, userLoc, userPincode);
  if (!isDeliverable) throw new Error(`OUT_OF_RADIUS|${product.name}`);

  // Bulk price evaluation
  let unitPrice = product.price;
  if (product.bulkPricing && Array.isArray(product.bulkPricing)) {
    const tier = product.bulkPricing.find(
      (t: any) => item.qty! >= t.min && (!t.max || item.qty! <= t.max)
    );
    if (tier) unitPrice = tier.price;
  }

  return {
    productId: item.productId!,
    sellerId: item.sellerId!,
    productSnapshot: {
      name: product.name,
      unit: product.unit || 'kg',
      imageUrl: product.imageUrls?.[0] || '',
    },
    qty: item.qty!,
    priceAtPurchase: unitPrice,
    itemStatus: 'PENDING',
  } as any;
}

/**
 * Checks whether a product is deliverable to the user's location.
 */
function checkDeliverability(product: any, userLoc: any, userPincode: string | undefined): boolean {
  const sellerLoc = product.sellerLocation;

  if (userLoc && sellerLoc) {
    return isWithinDeliveryRange(
      userLoc.lat, userLoc.lng,
      sellerLoc.lat, sellerLoc.lng,
      product.deliveryRadius || BIZ.DEFAULT_DELIVERY_RADIUS_KM
    );
  }

  if (userPincode && product.sellerSnapshot?.pincode) {
    return userPincode === product.sellerSnapshot.pincode;
  }

  throw new Error(`LOCATION_REQUIRED|${product.name}`);
}

// ── Public Service ───────────────────────────────────────────────────

/**
 * T1: Initiate Order
 * Validates items, re-fetches authoritative prices, and creates a PENDING_PAYMENT order.
 */
export async function initiateOrder(
  orderData: Partial<Order>,
  items: Partial<OrderItem>[]
): Promise<Order> {
  try {
    const idempotencyKey = orderData.idempotency_key;

    return await db.runTransaction(async (transaction) => {
      // 1. Idempotency Check
      if (idempotencyKey) {
        const idemRef = db.collection(COL.IDEMPOTENCY_KEYS).doc(idempotencyKey);
        const idemSnap = await transaction.get(idemRef);
        if (idemSnap.exists) {
          const existingOrderId = idemSnap.data()?.orderId;
          if (existingOrderId) {
            const orderSnap = await transaction.get(db.collection(COL.ORDERS).doc(existingOrderId));
            if (orderSnap.exists) return orderSnap.data() as Order;
          }
          throw new Error('DUPLICATE_ORDER');
        }
      }

      // 2. Fetch authoritative product & seller data
      const productIds = Array.from(new Set(items.map(i => i.productId!)));
      const productSnaps = await Promise.all(
        productIds.map(id => transaction.get(db.collection(COL.PRODUCTS).doc(id)))
      );
      const productMap = new Map<string, any>();
      productSnaps.forEach(snap => {
        if (snap.exists) productMap.set(snap.id, snap.data());
      });

      const sellerIds = Array.from(new Set(items.map(i => i.sellerId!)));
      const [sellerSnaps, userSnap] = await Promise.all([
        Promise.all(sellerIds.map(id => transaction.get(db.collection(COL.USER_PROFILES).doc(id)))),
        transaction.get(db.collection(COL.USER_PROFILES).doc(orderData.uid!)),
      ]);

      const sellerMap = new Map<string, any>();
      sellerSnaps.forEach(snap => {
        if (snap.exists) sellerMap.set(snap.id, snap.data());
      });

      const userData = userSnap.exists ? (userSnap.data() as any) : null;
      const userLoc = userData?.lastKnownLocation;
      const userPincode = orderData.addressSnapshot?.pincode;

      // 3. Validate & price each seller group
      const sellerGroups = buildSellerGroups(items);
      const processedSellerOrders: ProcessedSellerOrder[] = [];
      let grandTotal = 0;

      for (const [sellerId, sellerItems] of sellerGroups.entries()) {
        const seller = sellerMap.get(sellerId);
        let sellerSubtotal = 0;
        const validatedItems: OrderItem[] = [];

        for (const item of sellerItems) {
          const product = productMap.get(item.productId!);
          const validatedItem = validateAndPriceItem(item, product, userLoc, userPincode);
          sellerSubtotal += validatedItem.priceAtPurchase * validatedItem.qty;
          validatedItems.push(validatedItem);
        }

        const firstProduct = productMap.get(sellerItems[0].productId!);
        const mode = firstProduct?.deliveryMode || 'SELF';
        const deliveryCharge =
          mode === 'SELF' || mode === 'farmer'
            ? (seller?.deliveryCharge ?? BIZ.DEFAULT_DELIVERY_CHARGE)
            : 0;

        grandTotal += sellerSubtotal + deliveryCharge;

        processedSellerOrders.push({
          sellerId,
          items: validatedItems,
          subtotal: sellerSubtotal,
          delivery_charge: deliveryCharge,
          delivery_mode: mode,
        });
      }

      // 4. Create PENDING_PAYMENT order
      const orderRef = db.collection(COL.ORDERS).doc();
      const orderItemsSnapshot = processedSellerOrders.flatMap(so =>
        so.items.map((i: any) => ({
          productId: i.productId,
          sellerId: i.sellerId,
          qty: i.qty,
          priceAtPurchase: i.priceAtPurchase,
          productSnapshot: i.productSnapshot,
        }))
      );

      const finalOrder: Order = {
        orderId: orderRef.id,
        uid: orderData.uid!,
        addressSnapshot: orderData.addressSnapshot!,
        totalAmount: grandTotal,
        lockedAmount: grandTotal,
        items: orderItemsSnapshot,
        status: 'PENDING_PAYMENT',
        paymentMethod: orderData.paymentMethod || 'MOCK',
        paymentStatus: 'PENDING',
        transactionId: '',
        sellerIds: Array.from(sellerGroups.keys()),
        paymentId: '',
        idempotency_key: idempotencyKey,
        paymentAttempts: 0,
        version: 1,
        expiresAt: new Date(Date.now() + BIZ.PAYMENT_WINDOW_MS),
        orderLogs: [{ event: 'INITIATED', timestamp: new Date() }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      } as any;

      transaction.set(orderRef, finalOrder);

      if (idempotencyKey) {
        transaction.set(db.collection(COL.IDEMPOTENCY_KEYS).doc(idempotencyKey), {
          orderId: orderRef.id,
          uid: orderData.uid,
          createdAt: Timestamp.now(),
        });
      }

      return finalOrder;
    });
  } catch (error: any) {
    logger.error('Error in initiateOrder:', error);
    throw error;
  }
}
