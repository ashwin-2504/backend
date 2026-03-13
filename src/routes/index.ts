import { Router } from 'express';
import { transactionController } from '../controllers/transactionController.js';
import { productController } from '../controllers/productController.js';
import { orderController } from '../controllers/orderController.js';
import { keepAliveService } from '../services/keepAliveService.js';

const router = Router();

router.get('/api/cron/supabase-keepalive', async (req, res, next) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await keepAliveService.pingDatabase();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

// Checkout flow creation (backend owns session/flow IDs)
router.post('/api/checkout/create-flow', transactionController.createFlow);

// ONDC Flow routes
router.post('/api/search', transactionController.search);
router.post('/api/select', transactionController.select);
router.post('/api/init', transactionController.init);
router.post('/api/confirm', transactionController.confirm);
router.get('/api/status/:transactionId', transactionController.getStatus);

// Product routes
router.post('/api/products', productController.addProduct);
router.get('/api/products', productController.getAllProducts);
router.get('/api/products/feed', productController.getFeed);
router.get('/api/products/search', productController.searchProducts);
router.get('/api/products/seller/:sellerId', productController.getSellerProducts);
router.put('/api/products/:id', productController.updateProduct);
router.delete('/api/products/:id', productController.deleteProduct);

// Order and Stats routes (Seller)
router.get('/api/orders/seller/:sellerId', orderController.getSellerOrders);
router.patch('/api/orders/:id/status', orderController.updateOrderStatus);
router.get('/api/stats/seller/:sellerId', orderController.getSellerStats);

// Order and Stats routes (Buyer)
router.get('/api/orders/buyer/:buyerId', orderController.getBuyerOrders);
router.get('/api/stats/buyer/:buyerId', orderController.getBuyerStats);

export default router;
