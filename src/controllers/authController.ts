import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../lib/firebase.js';
import { HTTP, ERR, BIZ, COL } from '../utils/constants.js';

const UserProfileSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['seller', 'customer']),
  phone: z.string().min(1),
  address: z.string().optional().default(''),
  email: z.string().email().optional(),
});

export class AuthController {
  async syncProfile(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.uid) {
        return res.status(HTTP.UNAUTHORIZED).json({ success: false, error: ERR.UNAUTHORIZED });
      }

      const parsed = UserProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP.BAD_REQUEST).json({
          success: false,
          error: 'Invalid profile data',
          details: parsed.error.flatten(),
        });
      }

      const profile = await authService.syncUserProfile(req.user.uid, parsed.data);
      return res.status(HTTP.OK).json({ success: true, data: profile });
    } catch (error) {
      logger.error('Controller error in syncProfile:', error);
      return res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }

  async updateLocation(req: AuthenticatedRequest, res: Response) {
    try {
      const { uid } = req.user!;
      const { location } = req.body;

      if (!location?.lat || !location?.lng) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Invalid location data' });
      }

      const now = new Date();

      const batch = db.batch();
      const userRef = db.collection(COL.USER_PROFILES).doc(uid);

      batch.update(userRef, {
        lastKnownLocation: {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy || null,
        },
        lastLocationUpdate: now,
      });

      await batch.commit();

      return res.status(HTTP.OK).json({ success: true });
    } catch (error) {
      logger.error('Controller error in updateLocation:', error);
      return res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }

  async updateFarmLocation(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user || req.user.role !== 'seller') {
        return res.status(HTTP.FORBIDDEN).json({ success: false, error: 'Only sellers can set farm location' });
      }

      const { uid } = req.user;
      const { location } = req.body;

      if (!location?.lat || !location?.lng) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Invalid location data' });
      }

      // Accuracy Guard
      const accuracy = location.accuracy || 0;
      if (accuracy > BIZ.GPS_ACCURACY_THRESHOLD_M) {
        return res.status(HTTP.BAD_REQUEST).json({
          success: false,
          error: `GPS accuracy too low (${Math.round(accuracy)}m). Please wait for a better signal before setting farm location.`,
        });
      }

      const now = new Date();
      const farmLocationData = {
        lat: location.lat,
        lng: location.lng,
        accuracy,
        setAt: now,
      };

      // 1. Update Profile
      await db.collection(COL.USER_PROFILES).doc(uid).update({
        farmLocation: farmLocationData,
      });

      // 2. Batch update all seller products (chunked for Firestore limit)
      const productsSnap = await db.collection(COL.PRODUCTS).where('sellerId', '==', uid).get();
      const productDocs = productsSnap.docs;

      if (productDocs.length > 0) {
        for (let i = 0; i < productDocs.length; i += BIZ.MAX_BATCH_SIZE) {
          const batch = db.batch();
          const chunk = productDocs.slice(i, i + BIZ.MAX_BATCH_SIZE);

          chunk.forEach(doc => {
            batch.update(doc.ref, {
              sellerLocation: { lat: location.lat, lng: location.lng },
              updatedAt: now,
            });
          });

          await batch.commit();
        }
      }

      logger.info(`Farm location updated for seller ${uid} (Accuracy: ${accuracy}m). Synced ${productDocs.length} products.`);
      return res.status(HTTP.OK).json({ success: true, data: farmLocationData });
    } catch (error) {
      logger.error('Controller error in updateFarmLocation:', error);
      return res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }

  async switchRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { uid } = req.user!;
      const { role } = req.body;

      if (role !== 'seller' && role !== 'customer') {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Invalid role' });
      }

      const { auth } = await import('../lib/firebase.js');

      // Update custom claims
      await auth.setCustomUserClaims(uid, { role });

      // Update Firestore profile
      await db.collection(COL.USER_PROFILES).doc(uid).update({ role });

      logger.info(`User ${uid} switched role to ${role}`);
      return res.status(HTTP.OK).json({ success: true, role });
    } catch (error) {
      logger.error('Controller error in switchRole:', error);
      return res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }
}

export const authController = new AuthController();
