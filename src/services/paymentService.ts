import { db } from '../lib/firebase.js';
import { Payment } from '../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { BIZ, COL } from '../utils/constants.js';

export interface PaymentVerificationResult {
  status: 'SUCCESS' | 'FAILED';
  amount: number;
  orderId: string;
  userId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

export interface PaymentProvider {
  createIntent(userId: string, orderId: string, amount: number): Promise<{ paymentId: string; providerOrderId?: string }>;
  verify(paymentId: string, details?: any): Promise<PaymentVerificationResult>;
}

export class RazorpayProvider implements PaymentProvider {
  private instance: Razorpay;

  constructor() {
    this.instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });
  }

  async createIntent(userId: string, orderId: string, amount: number): Promise<{ paymentId: string; providerOrderId: string }> {
    try {
      const options = {
        amount: Math.round(amount * BIZ.PAISE_PER_RUPEE),
        currency: 'INR',
        receipt: `receipt_${orderId}`,
      };

      const razorpayOrder = await this.instance.orders.create(options);

      const paymentId = razorpayOrder.id;

      const payment: Payment = {
        paymentId,
        orderId,
        userId,
        amount,
        status: 'CREATED',
        provider: 'RAZORPAY',
        providerMetadata: {
          razorpayOrderId: razorpayOrder.id,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + BIZ.PAYMENT_WINDOW_MS),
      };

      await db.collection(COL.PAYMENTS).doc(paymentId).set(payment);

      return {
        paymentId,
        providerOrderId: razorpayOrder.id,
      };
    } catch (error) {
      logger.error('Razorpay order creation failed:', error);
      throw new Error('PAYMENT_INITIATION_FAILED');
    }
  }

  async verify(paymentId: string, details: any): Promise<PaymentVerificationResult> {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = details;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new Error('MISSING_PAYMENT_DETAILS');
    }

    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '');
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      throw new Error('INVALID_PAYMENT_SIGNATURE');
    }

    const paymentDoc = await db.collection(COL.PAYMENTS).doc(paymentId).get();
    if (!paymentDoc.exists) throw new Error('PAYMENT_NOT_FOUND');

    const payment = paymentDoc.data() as Payment;

    return {
      status: 'SUCCESS',
      amount: payment.amount,
      orderId: payment.orderId,
      userId: payment.userId,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    };
  }
}

export class MockPaymentProvider implements PaymentProvider {
  async createIntent(userId: string, orderId: string, amount: number): Promise<{ paymentId: string }> {
    const paymentId = `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const payment: Payment = {
      paymentId,
      orderId,
      userId,
      amount,
      status: 'CREATED',
      provider: 'MOCK',
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + BIZ.PAYMENT_WINDOW_MS),
    };

    await db.collection(COL.PAYMENTS).doc(paymentId).set(payment);
    return { paymentId };
  }

  async verify(paymentId: string): Promise<PaymentVerificationResult> {
    const paymentDoc = await db.collection(COL.PAYMENTS).doc(paymentId).get();

    if (!paymentDoc.exists) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    const payment = paymentDoc.data() as Payment;

    return {
      status: 'SUCCESS',
      amount: payment.amount,
      orderId: payment.orderId,
      userId: payment.userId,
    };
  }
}

export class PaymentService {
  private provider: PaymentProvider;

  constructor() {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      this.provider = new RazorpayProvider();
    } else {
      logger.warn('Razorpay credentials not found, using MockPaymentProvider');
      this.provider = new MockPaymentProvider();
    }
  }

  /** @delegation Strategy pattern — delegates to active payment provider. */
  async createIntent(userId: string, orderId: string, amount: number): Promise<{ paymentId: string; providerOrderId?: string }> {
    return this.provider.createIntent(userId, orderId, amount);
  }

  /** @delegation Strategy pattern — delegates to active payment provider. */
  async verifyPayment(paymentId: string, details?: any): Promise<PaymentVerificationResult> {
    return this.provider.verify(paymentId, details);
  }

  /**
   * Update payment status explicitly in DB.
   */
  async updatePaymentStatus(paymentId: string, status: 'SUCCESS' | 'FAILED' | 'REFUNDED', metadata?: any): Promise<void> {
    try {
      const updateData: any = {
        status,
        updatedAt: Timestamp.now(),
      };
      if (metadata) {
        updateData.providerMetadata = metadata;
      }
      await db.collection(COL.PAYMENTS).doc(paymentId).update(updateData);
    } catch (error) {
      logger.error(`Error updating payment status for ${paymentId}:`, error);
      throw error;
    }
  }
}

export const paymentService = new PaymentService();
