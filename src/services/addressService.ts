import { db } from '../lib/firebase.js';
import { Address } from '../types/models.js';
import { FieldValue } from 'firebase-admin/firestore';
import { COL } from '../utils/constants.js';

export class AddressService {
  async getAddresses(uid: string): Promise<Address[]> {
    const snapshot = await db.collection(COL.USER_PROFILES).doc(uid).collection(COL.ADDRESSES).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Address));
  }

  async addAddress(uid: string, addressData: Omit<Address, 'id'>): Promise<Address> {
    const userRef = db.collection(COL.USER_PROFILES).doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    const addressRef = userRef.collection(COL.ADDRESSES).doc();
    const newAddress: Address = {
      id: addressRef.id,
      ...addressData,
      updatedAt: FieldValue.serverTimestamp() as any,
    };

    await addressRef.set(newAddress);

    // Auto-set as default if no default address exists
    if (!userData?.defaultAddressId) {
      await userRef.update({ defaultAddressId: addressRef.id });
    }

    return newAddress;
  }

  async updateAddress(uid: string, addrId: string, addressData: Partial<Address>): Promise<void> {
    const userRef = db.collection(COL.USER_PROFILES).doc(uid);
    const addressRef = userRef.collection(COL.ADDRESSES).doc(addrId);
    const addressSnap = await addressRef.get();

    if (!addressSnap.exists) {
      throw new Error('Address not found');
    }

    await addressRef.update({
      ...addressData,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async deleteAddress(uid: string, addrId: string): Promise<void> {
    const userRef = db.collection(COL.USER_PROFILES).doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data();

    // Delete the address
    await userRef.collection(COL.ADDRESSES).doc(addrId).delete();

    // If we just deleted the default address, reassign it
    if (userData?.defaultAddressId === addrId) {
      const remainingAddresses = await this.getAddresses(uid);
      const nextDefaultId = remainingAddresses.length > 0 ? remainingAddresses[0].id : '';
      await userRef.update({ defaultAddressId: nextDefaultId });
    }
  }

  async setDefaultAddress(uid: string, addrId: string): Promise<void> {
    const userRef = db.collection(COL.USER_PROFILES).doc(uid);
    const addressRef = userRef.collection(COL.ADDRESSES).doc(addrId);
    const addressSnap = await addressRef.get();

    if (!addressSnap.exists) {
      throw new Error('Address not found');
    }

    await userRef.update({ defaultAddressId: addrId });
  }
}

export const addressService = new AddressService();
