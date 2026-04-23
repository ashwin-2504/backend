import { Response } from 'express';
import { addressService } from '../services/addressService.js';
import { userProfileService } from '../services/userProfileService.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { addressSchema, updateAddressSchema } from '../utils/validators.js';
import { HTTP, ERR } from '../utils/constants.js';

export class AddressController {
  async getAddresses(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.uid) return res.status(HTTP.UNAUTHORIZED).json({ success: false, error: ERR.UNAUTHORIZED });
      const addresses = await addressService.getAddresses(req.user.uid);
      return res.status(HTTP.OK).json({ success: true, data: addresses });
    } catch (error) {
      logger.error('Error in getAddresses:', error);
      return res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }

  async addAddress(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.uid) return res.status(HTTP.UNAUTHORIZED).json({ success: false, error: ERR.UNAUTHORIZED });

      const parsed = addressSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Invalid address data', details: parsed.error.flatten() });
      }

      const newAddress = await addressService.addAddress(req.user.uid, parsed.data);
      const updatedUser = await userProfileService.getUserProfile(req.user.uid);
      return res.status(HTTP.CREATED).json({ success: true, data: newAddress, user: updatedUser });
    } catch (error) {
      logger.error('Error in addAddress:', error);
      return res.status(HTTP.INTERNAL_ERROR).json({ success: false, error: ERR.INTERNAL });
    }
  }

  async updateAddress(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.uid) return res.status(HTTP.UNAUTHORIZED).json({ success: false, error: ERR.UNAUTHORIZED });
      const { id } = req.params;

      const parsed = updateAddressSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP.BAD_REQUEST).json({ success: false, error: 'Invalid update data', details: parsed.error.flatten() });
      }

      await addressService.updateAddress(req.user.uid, id as string, parsed.data);
      return res.status(HTTP.OK).json({ success: true, message: 'Address updated' });
    } catch (error: any) {
      logger.error('Error in updateAddress:', error);
      return res.status(HTTP.BAD_REQUEST).json({ success: false, error: error.message || 'Could not update address' });
    }
  }

  async deleteAddress(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.uid) return res.status(HTTP.UNAUTHORIZED).json({ success: false, error: ERR.UNAUTHORIZED });
      const { id } = req.params;
      await addressService.deleteAddress(req.user.uid, id as string);
      const updatedUser = await userProfileService.getUserProfile(req.user.uid);
      return res.status(HTTP.OK).json({ success: true, message: 'Address deleted', user: updatedUser });
    } catch (error: any) {
      logger.error('Error in deleteAddress:', error);
      return res.status(HTTP.BAD_REQUEST).json({ success: false, error: error.message || 'Could not delete address' });
    }
  }

  async setDefault(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user?.uid) return res.status(HTTP.UNAUTHORIZED).json({ success: false, error: ERR.UNAUTHORIZED });
      const { id } = req.params;
      await addressService.setDefaultAddress(req.user.uid, id as string);
      const updatedUser = await userProfileService.getUserProfile(req.user.uid);
      return res.status(HTTP.OK).json({ success: true, message: 'Default address updated', user: updatedUser });
    } catch (error: any) {
      logger.error('Error in setDefault:', error);
      return res.status(HTTP.BAD_REQUEST).json({ success: false, error: error.message || 'Could not set default address' });
    }
  }
}

export const addressController = new AddressController();
