import { Router } from 'express';

import { productController } from '../controllers/productController.js';
import { orderController } from '../controllers/orderController.js';
import { authController } from '../controllers/authController.js';
import { addressController } from '../controllers/addressController.js';
import { keepAliveService } from '../services/keepAliveService.js';
import { cleanupService } from '../services/cleanupService.js';
import { requireRole, verifyAuth } from '../middleware/auth.js';
import { uploadProductImages } from '../middleware/upload.js';
import { HTTP, ERR } from '../utils/constants.js';


const router = Router();

router.get('/api/cron/firebase-keepalive', async (req, res, next) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(HTTP.UNAUTHORIZED).json({ error: ERR.UNAUTHORIZED });
    }

    const result = await keepAliveService.pingDatabase();
    const cleanupResult = await cleanupService.cleanupStaleOrders();
    return res.status(HTTP.OK).json({ ...result, cleanup: cleanupResult });
  } catch (error) {
    return next(error);
  }
});

// Profile and Address routes
router.post('/api/auth/profile', verifyAuth, authController.syncProfile);
router.post('/api/auth/switch-role', verifyAuth, authController.switchRole);
router.patch('/api/auth/location', verifyAuth, authController.updateLocation);
router.patch('/api/auth/farm-location', verifyAuth, requireRole('seller'), authController.updateFarmLocation);
router.get('/api/addresses', verifyAuth, addressController.getAddresses);
router.post('/api/addresses', verifyAuth, addressController.addAddress);
router.patch('/api/addresses/:id', verifyAuth, addressController.updateAddress);
router.delete('/api/addresses/:id', verifyAuth, addressController.deleteAddress);
router.patch('/api/addresses/:id/default', verifyAuth, addressController.setDefault);

router.get('/api/checkout/active', verifyAuth, requireRole('customer'), orderController.getActiveOrder);
router.post('/api/checkout/initiate', verifyAuth, requireRole('customer'), orderController.initiateOrder);
router.post('/api/checkout/intent', verifyAuth, requireRole('customer'), orderController.createIntent);
router.post('/api/checkout/confirm', verifyAuth, requireRole('customer'), orderController.confirmOrder);
router.post('/api/checkout/fail', verifyAuth, requireRole('customer'), orderController.handlePaymentFailure);

// Product routes
router.post('/api/products', verifyAuth, requireRole('seller'), uploadProductImages, productController.addProduct);
router.get('/api/products', productController.getAllProducts);
router.get('/api/products/feed', productController.getFeed);
router.get('/api/products/search', productController.searchProducts);
router.get('/api/products/seller/:sellerId', verifyAuth, requireRole('seller'), productController.getSellerProducts);
router.put('/api/products/:id', verifyAuth, requireRole('seller'), uploadProductImages, productController.updateProduct);
router.delete('/api/products/:id', verifyAuth, requireRole('seller'), productController.deleteProduct);

// Order and Stats routes (Seller)
router.get('/api/orders/seller/:sellerId', verifyAuth, requireRole('seller'), orderController.getSellerOrders);
router.patch('/api/orders/:id/status', verifyAuth, orderController.updateOrderStatus); // Removed requireRole to allow both
router.get('/api/stats/seller/:sellerId', verifyAuth, requireRole('seller'), orderController.getSellerStats);

// Order and Stats routes (Buyer)
router.get('/api/orders/buyer/:buyerId', verifyAuth, requireRole('customer'), orderController.getBuyerOrders);
router.get('/api/stats/buyer/:buyerId', verifyAuth, requireRole('customer'), orderController.getBuyerStats);

export default router;
