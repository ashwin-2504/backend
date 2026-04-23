import { Request, Response } from 'express';
import { orderService } from '../services/orderService.js';
import { paymentService } from '../services/paymentService.js';
import { logger } from '../utils/logger.js';
import { HTTP, ERR, VALID_ORDER_STATUSES } from '../utils/constants.js';

export class OrderController {
  async initiateOrder(req: Request, res: Response) {
    try {
      const { items, ...orderData } = req.body;
      const uid = (req as any).user.uid;
      const order = await orderService.initiateOrder({ ...orderData, uid }, items);
      res.status(HTTP.CREATED).json({ success: true, data: order });
    } catch (error: any) {
      logger.error('Controller error in initiateOrder:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: error.message || ERR.INTERNAL });
    }
  }

  async confirmOrder(req: Request, res: Response) {
    try {
      const { orderId, paymentId, idempotencyKeyConfirm, ...paymentDetails } = req.body;
      const uid = (req as any).user.uid;

      if (!orderId || !paymentId) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Missing orderId or paymentId' });
      }

      // Verify payment via the provider first
      const verification = await paymentService.verifyPayment(paymentId, paymentDetails);

      if (verification.status !== 'SUCCESS') {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Payment verification failed' });
      }

      const order = await orderService.confirmOrder(uid, orderId, paymentId, idempotencyKeyConfirm);
      res.status(HTTP.OK).json({ success: true, data: order });
    } catch (error: any) {
      logger.error('Controller error in confirmOrder:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: error.message || ERR.INTERNAL });
    }
  }

  /**
   * T2 Bridge: Create Payment Intent
   */
  async createIntent(req: Request, res: Response) {
    try {
      const { orderId, amount } = req.body;
      const uid = (req as any).user.uid;

      if (!orderId || !amount) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Missing orderId or amount' });
      }

      // Track payment attempt
      await orderService.incrementPaymentAttempt(orderId);

      const intent = await paymentService.createIntent(uid, orderId, amount);
      res.status(HTTP.OK).json({
        success: true,
        paymentId: intent.paymentId,
        providerOrderId: intent.providerOrderId,
      });
    } catch (error: any) {
      logger.error('Controller error in createIntent:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: error.message || ERR.INTERNAL });
    }
  }

  async getSellerOrders(req: Request, res: Response) {
    try {
      const sellerId = req.params.sellerId as string;
      if (!sellerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing sellerId' });
      }

      const orders = await orderService.getSellerOrders(sellerId);
      res.json(orders);
    } catch (error) {
      logger.error('Controller error in getSellerOrders:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async getSellerStats(req: Request, res: Response) {
    try {
      const sellerId = req.params.sellerId as string;
      if (!sellerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing sellerId' });
      }

      const stats = await orderService.getSellerStats(sellerId);
      res.json(stats);
    } catch (error) {
      logger.error('Controller error in getSellerStats:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async updateOrderStatus(req: Request, res: Response) {
    try {
      const orderId = req.params.id as string;
      const { status } = req.body;

      if (!orderId || !status) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing orderId or status' });
      }

      if (!VALID_ORDER_STATUSES.includes(status)) {
        return res.status(HTTP.BAD_REQUEST).json({ error: ERR.INVALID_STATUS });
      }

      const order = await orderService.updateOrderStatus(orderId, status as any);
      res.json(order);
    } catch (error) {
      logger.error('Controller error in updateOrderStatus:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async handlePaymentFailure(req: Request, res: Response) {
    try {
      const { orderId, reason } = req.body;
      const uid = (req as any).user.uid;

      if (!orderId || !reason) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Missing orderId or reason' });
      }

      await orderService.handlePaymentFailure(uid, orderId, reason);
      res.status(HTTP.OK).json({ success: true, status: 'FAILED' });
    } catch (error: any) {
      logger.error('Controller error in handlePaymentFailure:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: error.message || ERR.INTERNAL });
    }
  }

  async getActiveOrder(req: Request, res: Response) {
    try {
      const uid = (req as any).user.uid;
      const order = await orderService.getActivePendingOrder(uid);
      res.status(HTTP.OK).json({ success: true, order });
    } catch (error: any) {
      logger.error('Controller error in getActiveOrder:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }

  async getBuyerOrders(req: Request, res: Response) {
    try {
      const buyerId = req.params.buyerId as string;
      if (!buyerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing buyerId' });
      }

      const orders = await orderService.getBuyerOrders(buyerId);
      res.json(orders);
    } catch (error) {
      logger.error('Controller error in getBuyerOrders:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async getBuyerStats(req: Request, res: Response) {
    try {
      const buyerId = req.params.buyerId as string;
      if (!buyerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing buyerId' });
      }

      const stats = await orderService.getBuyerStats(buyerId);
      res.json(stats);
    } catch (error) {
      logger.error('Controller error in getBuyerStats:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }
}

export const orderController = new OrderController();
