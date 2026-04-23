import { firebaseAdmin, auth, db } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';
import { COL } from '../utils/constants.js';

export interface UserProfileInput {
  name: string;
  role: 'customer' | 'seller';
  phone: string;
  address?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
  deliveryCharge?: number;
  farmName?: string;
}

export class AuthService {
  async syncUserProfile(uid: string, profile: UserProfileInput) {
    try {
      const userRef = db.collection(COL.USER_PROFILES).doc(uid);
      const [existingUser, existingAuthUser] = await Promise.all([
        userRef.get(),
        auth.getUser(uid),
      ]);

      const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
      const currentClaims = existingAuthUser.customClaims ?? {};

      // Ensure Custom Claims are set for RBAC
      await auth.setCustomUserClaims(uid, {
        ...currentClaims,
        role: profile.role,
      });

      const isNew = !existingUser.exists;

      const payload: any = {
        uid,
        name: profile.name,
        email: profile.email || existingAuthUser.email || '',
        phone: profile.phone || null,
        role: profile.role,
        deliveryCharge: profile.deliveryCharge ?? (profile.role === 'seller' ? 30 : 0),
        farmName: profile.farmName || (profile.role === 'seller' ? `${profile.name}'s Farm` : ''),
        updatedAt: now,
      };

      if (isNew) {
        payload.createdAt = now;
        payload.defaultAddressId = '';
      }

      await userRef.set(payload, { merge: true });

      // Handle address creation
      await this.ensureDefaultAddress(userRef, profile, isNew, existingUser, now, payload);

      return payload;
    } catch (error) {
      logger.error(`Error in syncUserProfile for ${uid}:`, error);
      throw error;
    }
  }

  /**
   * Creates an address in the subcollection and sets it as default if needed.
   */
  private async ensureDefaultAddress(
    userRef: FirebaseFirestore.DocumentReference,
    profile: UserProfileInput,
    isNew: boolean,
    existingUser: FirebaseFirestore.DocumentSnapshot,
    now: FirebaseFirestore.FieldValue,
    payload: any
  ): Promise<void> {
    if (!profile.address && !profile.addressLine) return;

    const addressRef = userRef.collection(COL.ADDRESSES).doc();
    const addressId = addressRef.id;

    const addressPayload = {
      id: addressId,
      label: 'Primary Address',
      fullAddress: profile.addressLine || profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
      pincode: profile.pincode || '',
      updatedAt: now,
    };

    await addressRef.set(addressPayload, { merge: true });

    // Set as default if first address or no default exists
    if (isNew || !existingUser.data()?.defaultAddressId) {
      await userRef.update({ defaultAddressId: addressId });
      payload.defaultAddressId = addressId;
    }
  }
}

export const authService = new AuthService();
