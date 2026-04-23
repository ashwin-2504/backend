/**
 * OrderService Facade
 *
 * Thin re-export layer that delegates to focused sub-modules.
 * Preserves the existing `orderService` singleton API so no controller
 * or route changes are required.
 */
import { Order, OrderItem, SellerOrder } from '../types/models.js';

import { initiateOrder } from './order/orderInitiationService.js';
import { confirmOrder } from './order/orderConfirmationService.js';
import {
  getSellerOrders,
  getBuyerOrders,
  getSellerStats,
  getBuyerStats,
  getActivePendingOrder,
} from './order/orderQueryService.js';
import {
  updateOrderStatus,
  handlePaymentFailure,
  incrementPaymentAttempt,
} from './order/orderMutationService.js';

export class OrderService {
  // ── T1: Initiation ──────────────────────────────────────────────
  async initiateOrder(orderData: Partial<Order>, items: Partial<OrderItem>[]): Promise<Order> {
    return initiateOrder(orderData, items);
  }

  // ── T3: Confirmation ────────────────────────────────────────────
  async confirmOrder(uid: string, orderId: string, paymentId: string, idempotencyKey?: string): Promise<Order> {
    return confirmOrder(uid, orderId, paymentId, idempotencyKey);
  }

  // ── Mutations ───────────────────────────────────────────────────
  async updateOrderStatus(orderId: string, status: Order['status']): Promise<void> {
    return updateOrderStatus(orderId, status);
  }

  async handlePaymentFailure(uid: string, orderId: string, reason: string): Promise<void> {
    return handlePaymentFailure(uid, orderId, reason);
  }

  async incrementPaymentAttempt(orderId: string): Promise<void> {
    return incrementPaymentAttempt(orderId);
  }

  // ── Queries ─────────────────────────────────────────────────────
  async getSellerOrders(sellerId: string): Promise<SellerOrder[]> {
    return getSellerOrders(sellerId);
  }

  async getBuyerOrders(buyerId: string): Promise<Order[]> {
    return getBuyerOrders(buyerId);
  }

  async getSellerStats(sellerId: string) {
    return getSellerStats(sellerId);
  }

  async getBuyerStats(buyerId: string) {
    return getBuyerStats(buyerId);
  }

  async getActivePendingOrder(uid: string): Promise<Order | null> {
    return getActivePendingOrder(uid);
  }
}

export const orderService = new OrderService();
