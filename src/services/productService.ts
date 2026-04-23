import { db } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';
import { Product } from '../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';
import { getFeed, FeedOptions } from './feedService.js';
import { MAX_FEED_RETURN } from '../utils/distance.js';
import { BIZ, COL } from '../utils/constants.js';

export class ProductService {
  async addProduct(productData: Partial<Product>): Promise<Product> {
    try {
      if (!productData.sellerId) {
        throw new Error('SELLER_ID_REQUIRED');
      }
      // Fetch seller info from userProfiles (replaces defunct sellers collection)
      const sellerDoc = await db.collection(COL.USER_PROFILES).doc(productData.sellerId).get();
      const sellerData = sellerDoc.data() as any;

      if (!sellerData?.farmLocation) {
        throw new Error('SELLER_LOCATION_REQUIRED');
      }

      const productRef = db.collection(COL.PRODUCTS).doc();
      const product: Product = {
        ...productData,
        productId: productRef.id,
        sellerSnapshot: {
          farmName: sellerData?.farmName || 'Unknown Farm',
          pincode: sellerData?.pincode || '000000',
        },
        sellerLocation: sellerData.farmLocation,
        avgRating: 0,
        updatedAt: Timestamp.now(),
        isOrganic: productData.isOrganic ?? false,
        isChemicalFree: productData.isChemicalFree ?? false,
        deliveryMode: productData.deliveryMode ?? 'SELF',
        deliveryRadius: productData.deliveryRadius ?? BIZ.DEFAULT_DELIVERY_RADIUS_KM,
        minQty: productData.minQty ?? BIZ.DEFAULT_MIN_QTY,
        maxQty: productData.maxQty ?? BIZ.DEFAULT_MAX_QTY,
        bulkPricing: productData.bulkPricing ?? [],
        freshness: productData.freshness ?? 'TODAY',
        grade: productData.grade ?? 'A',
        tags: productData.tags ?? [],
        discountPercentage: productData.discountPercentage ?? 0,
        isAvailable: productData.isAvailable ?? true,
        createdAt: Timestamp.now(),
        harvestDate: productData.harvestDate ?? new Date().toISOString().split('T')[0],
      } as Product;

      await productRef.set(product);
      return product;
    } catch (error) {
      logger.error('Error adding product to Firestore', error);
      throw error;
    }
  }

  async getSellerProducts(sellerId: string): Promise<Product[]> {
    try {
      const snapshot = await db.collection(COL.PRODUCTS)
        .where('sellerId', '==', sellerId)
        .get();

      return snapshot.docs
        .map(doc => doc.data() as Product)
        .sort((a, b) => {
          const tA = (a.updatedAt as Timestamp).toMillis();
          const tB = (b.updatedAt as Timestamp).toMillis();
          return tB - tA;
        });
    } catch (error) {
      logger.error(`Error fetching products for seller ${sellerId}`, error);
      throw error;
    }
  }

  async getAllProducts(): Promise<Product[]> {
    try {
      const snapshot = await db.collection(COL.PRODUCTS)
        .where('isAvailable', '==', true)
        .get();
      return snapshot.docs.map(doc => doc.data() as Product);
    } catch (error) {
      logger.error('Error fetching all products', error);
      throw error;
    }
  }

  async searchProducts(query: string): Promise<Product[]> {
    const sanitized = query.toLowerCase().trim();
    if (!sanitized) return [];

    try {
      // Basic in-memory search fallback for MVP (Elasticsearch/Algolia recommended for prod)
      const snapshot = await db.collection(COL.PRODUCTS)
        .where('isAvailable', '==', true)
        .get();

      return snapshot.docs
        .map(doc => doc.data() as Product)
        .filter(
          p =>
            (p.name?.toLowerCase() || '').includes(sanitized) ||
            (p.category?.toLowerCase() || '').includes(sanitized) ||
            (p.description?.toLowerCase() || '').includes(sanitized)
        );
    } catch (error) {
      logger.error(`Error searching products with query ${sanitized}`, error);
      throw error;
    }
  }

  /** @delegation Delegates to feedService for discovery logic. */
  async getFeed(limit: number = MAX_FEED_RETURN, userPincode?: string, userLat?: number, userLng?: number): Promise<Product[]> {
    return getFeed({ limit, userPincode, userLat, userLng });
  }

  async updateProduct(id: string, sellerId: string, updateData: Partial<Product>): Promise<Product> {
    try {
      const docRef = db.collection(COL.PRODUCTS).doc(id);
      const doc = await docRef.get();

      if (!doc.exists) throw new Error('Product not found');
      if (doc.data()?.sellerId !== sellerId) throw new Error('Unauthorized modifier');

      await docRef.update({
        ...updateData,
        updatedAt: Timestamp.now(),
      });

      const updated = await docRef.get();
      return updated.data() as Product;
    } catch (error) {
      logger.error(`Error updating product ${id}`, error);
      throw error;
    }
  }

  async deleteProduct(id: string, sellerId: string): Promise<void> {
    try {
      const docRef = db.collection(COL.PRODUCTS).doc(id);
      const doc = await docRef.get();

      if (!doc.exists) return;
      if (doc.data()?.sellerId !== sellerId) throw new Error('Unauthorized deletion');

      await docRef.delete();
    } catch (error) {
      logger.error(`Error deleting product ${id}`, error);
      throw error;
    }
  }
}

export const productService = new ProductService();
