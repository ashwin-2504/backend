import { db } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';
import { Cart, CartItem } from '../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';

export class CartService {
  async getCart(uid: string): Promise<Cart | null> {
    try {
      const doc = await db.collection('carts').doc(uid).get();
      if (!doc.exists) return null;
      return doc.data() as Cart;
    } catch (error) {
      logger.error(`Error fetching cart for user ${uid}`, error);
      throw error;
    }
  }

  async updateCart(uid: string, items: CartItem[]): Promise<void> {
    try {
      // Constraint: Max 20 items optimized for single read
      const sanitizedItems = items.slice(0, 20);
      
      await db.collection('carts').doc(uid).set({
        uid,
        items: sanitizedItems,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      logger.error(`Error updating cart for user ${uid}`, error);
      throw error;
    }
  }

  async clearCart(uid: string): Promise<void> {
    try {
      await db.collection('carts').doc(uid).delete();
    } catch (error) {
      logger.error(`Error clearing cart for user ${uid}`, error);
      throw error;
    }
  }
}

export const cartService = new CartService();
