import { db } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';
import { Product } from '../types/models.js';
import { haversineDistance, MAX_FEED_FETCH, MAX_FEED_RETURN } from '../utils/distance.js';
import { BIZ } from '../utils/constants.js';

// ── Helper ───────────────────────────────────────────────────────────

/**
 * Safely extracts a sortable timestamp from Firestore data.
 * Handles Timestamp objects, _seconds format, and Date strings.
 */
function toMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts._seconds) return ts._seconds * 1000;
  return new Date(ts).getTime() || 0;
}

/**
 * Sorts products by recency (newest first).
 */
function sortByRecency(a: Product, b: Product): number {
  return toMillis(b.updatedAt) - toMillis(a.updatedAt);
}

// ── Discovery Modes ──────────────────────────────────────────────────

/**
 * GPS-based discovery: filters products with valid seller locations,
 * computes distances, and sorts by deliverability then proximity.
 */
function applyGPSDiscovery(products: Product[], userLat: number, userLng: number): any[] {
  const enriched = products
    .filter(p => !!p.sellerLocation && !isNaN(p.sellerLocation.lat) && !isNaN(p.sellerLocation.lng))
    .map(p => {
      const dist = haversineDistance(userLat, userLng, p.sellerLocation.lat, p.sellerLocation.lng);
      return {
        ...p,
        distance: dist,
        isDeliverable: dist <= (p.deliveryRadius || BIZ.DEFAULT_DELIVERY_RADIUS_KM),
      };
    })
    .sort((a, b) => {
      // Priority 1: Deliverability
      if (a.isDeliverable && !b.isDeliverable) return -1;
      if (!a.isDeliverable && b.isDeliverable) return 1;

      // Priority 2: Distance
      const distA = isNaN(a.distance) ? 9999 : a.distance;
      const distB = isNaN(b.distance) ? 9999 : b.distance;
      if (Math.abs(distA - distB) > 0.1) return distA - distB;

      // Priority 3: Recency
      return toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });

  logger.info(
    `GPS Mode: Found ${enriched.filter(p => p.isDeliverable).length} deliverable products out of ${enriched.length} total.`
  );

  return enriched;
}

/**
 * Pincode-based discovery: filters products matching the user's pincode.
 */
function applyPincodeDiscovery(products: Product[], userPincode: string): Product[] {
  const filtered = products
    .filter(p => p.sellerSnapshot && p.sellerSnapshot.pincode === userPincode)
    .sort(sortByRecency);

  logger.info(`Pincode Mode: ${filtered.length} products matching ${userPincode}.`);
  return filtered;
}

// ── Public Service ───────────────────────────────────────────────────

export interface FeedOptions {
  limit?: number;
  userPincode?: string;
  userLat?: number;
  userLng?: number;
}

/**
 * Produces a ranked product feed using GPS, Pincode, or Generic discovery.
 */
export async function getFeed(options: FeedOptions = {}): Promise<Product[]> {
  const { limit = MAX_FEED_RETURN, userPincode, userLat, userLng } = options;

  try {
    const snapshot = await db.collection('products').limit(MAX_FEED_FETCH).get();
    let products = snapshot.docs.map((doc: any) => doc.data() as Product);

    // In-memory availability filter (allows products with missing flag to show)
    products = products.filter(p => p && p.isAvailable !== false);

    logger.info(
      `Feed Discovery: Found ${products.length} base available products. Modes: GPS=${userLat !== undefined}, Pincode=${!!userPincode}`
    );

    // Mode 1: GPS
    if (userLat !== undefined && userLng !== undefined && !isNaN(userLat) && !isNaN(userLng)) {
      products = applyGPSDiscovery(products, userLat, userLng);
    }
    // Mode 2: Pincode
    else if (userPincode && userPincode.trim().length > 0) {
      products = applyPincodeDiscovery(products, userPincode);
    }
    // Mode 3: Generic (recency sort)
    else {
      products.sort(sortByRecency);
      logger.info(`Generic Mode: Returning ${products.length} products.`);
    }

    return products.slice(0, limit);
  } catch (error) {
    logger.error('Error fetching product feed', error);
    throw error;
  }
}
