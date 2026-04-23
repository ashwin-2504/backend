import { db } from '../lib/firebase.js';
import { UserProfile, Address } from '../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';

export class UserProfileService {
  async createUserProfile(profile: Partial<UserProfile>): Promise<void> {
    try {
      const { uid, ...data } = profile;
      if (!uid) throw new Error('UID is required');

      await db.collection('userProfiles').doc(uid).set({
        uid,
        ...data,
        createdAt: Timestamp.now(),
        role: data.role || 'customer'
      }, { merge: true });
    } catch (error) {
      logger.error(`Error creating user profile for ${profile.uid}`, error);
      throw error;
    }
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const doc = await db.collection('userProfiles').doc(uid).get();
      if (!doc.exists) return null;
      return doc.data() as UserProfile;
    } catch (error) {
      logger.error(`Error fetching user profile for ${uid}`, error);
      throw error;
    }
  }

  async addAddress(uid: string, address: Omit<Address, 'id'>): Promise<string> {
    try {
      const addrRef = db.collection('userProfiles').doc(uid).collection('addresses').doc();
      await addrRef.set({
        ...address,
        id: addrRef.id
      });
      return addrRef.id;
    } catch (error) {
      logger.error(`Error adding address for user ${uid}`, error);
      throw error;
    }
  }

  async getAddresses(uid: string): Promise<Address[]> {
    try {
      const snapshot = await db.collection('userProfiles').doc(uid).collection('addresses').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Address));
    } catch (error) {
      logger.error(`Error fetching addresses for user ${uid}`, error);
      throw error;
    }
  }

  async setDefaultAddress(uid: string, addressId: string): Promise<void> {
    try {
      await db.collection('userProfiles').doc(uid).update({
        defaultAddressId: addressId
      });
    } catch (error) {
      logger.error(`Error setting default address for user ${uid}`, error);
      throw error;
    }
  }
}

export const userProfileService = new UserProfileService();
