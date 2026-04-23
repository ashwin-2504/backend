import { Request, Response } from 'express';
import { productService } from '../services/productService.js';
import { logger } from '../utils/logger.js';
import { uploadToCloudinary } from '../lib/cloudinary.js';
import { parseProductFormData } from '../utils/formDataParser.js';
import { HTTP, ERR } from '../utils/constants.js';

export class ProductController {
  async addProduct(req: any, res: Response) {
    try {
      const sellerId = req.user?.uid;
      if (!sellerId) {
        return res.status(HTTP.UNAUTHORIZED).json({ error: 'Unauthorized: No seller ID found' });
      }

      const productData = parseProductFormData(req.body);

      // Basic validation
      if (!productData.name || !productData.price) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing required fields (name, price)' });
      }

      // Handle Image Uploads via Multer/Cloudinary
      const imageUrls: string[] = [];
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        try {
          const uploadPromises = (req.files as Express.Multer.File[]).map(file =>
            uploadToCloudinary(file.buffer)
          );
          const uploadResults = await Promise.all(uploadPromises);
          imageUrls.push(...uploadResults.map(result => result.secure_url));
        } catch (uploadError) {
          logger.error('Image upload failed:', uploadError);
          return res.status(HTTP.INTERNAL_ERROR).json({ error: 'Image upload failed' });
        }
      }

      productData.imageUrls = imageUrls;

      const product = await productService.addProduct({
        ...productData,
        sellerId,
      });
      res.status(HTTP.CREATED).json(product);
    } catch (error) {
      logger.error('Controller error in addProduct:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async getSellerProducts(req: Request, res: Response) {
    try {
      const sellerId = req.params.sellerId as string;
      if (!sellerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing sellerId parameter' });
      }

      const products = await productService.getSellerProducts(sellerId);
      res.json(products);
    } catch (error) {
      logger.error('Controller error in getSellerProducts:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async getAllProducts(req: Request, res: Response) {
    try {
      const products = await productService.getAllProducts();
      res.json(products);
    } catch (error) {
      logger.error('Controller error in getAllProducts:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async searchProducts(req: Request, res: Response) {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing query parameter q' });
      }

      const products = await productService.searchProducts(query);
      res.json(products);
    } catch (error) {
      logger.error('Controller error in searchProducts:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async getFeed(req: Request, res: Response) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const userPincode = req.query.pincode as string;
      const userLatStr = req.query.lat as string;
      const userLngStr = req.query.lng as string;
      const userLat = userLatStr ? parseFloat(userLatStr) : undefined;
      const userLng = userLngStr ? parseFloat(userLngStr) : undefined;

      // Guard against NaN from invalid strings
      const verifiedLat = userLat !== undefined && !isNaN(userLat) ? userLat : undefined;
      const verifiedLng = userLng !== undefined && !isNaN(userLng) ? userLng : undefined;

      const products = await productService.getFeed(limit, userPincode, verifiedLat, verifiedLng);
      res.json(products);
    } catch (error) {
      logger.error('Controller error in getFeed:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async updateProduct(req: any, res: Response) {
    try {
      const productId = req.params.id as string;
      const sellerId = req.user?.uid;

      if (!productId || !sellerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing productId or unauthorized' });
      }

      const updateData = parseProductFormData(req.body);

      // Handle Image Uploads (append to parsed imageUrls)
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        try {
          const uploadPromises = (req.files as Express.Multer.File[]).map(file =>
            uploadToCloudinary(file.buffer)
          );
          const uploadResults = await Promise.all(uploadPromises);
          const newImageUrls = uploadResults.map(result => result.secure_url);
          const existingUrls = Array.isArray(updateData.imageUrls) ? updateData.imageUrls : [];
          updateData.imageUrls = [...existingUrls, ...newImageUrls];
        } catch (uploadError) {
          logger.error('Image upload failed during update:', uploadError);
          return res.status(HTTP.INTERNAL_ERROR).json({ error: 'Image upload failed' });
        }
      }

      // Prevent sellerId mutation
      delete updateData.sellerId;

      const product = await productService.updateProduct(productId, sellerId, updateData);
      res.json(product);
    } catch (error) {
      logger.error('Controller error in updateProduct:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }

  async deleteProduct(req: any, res: Response) {
    try {
      const productId = req.params.id as string;
      const sellerId = req.user?.uid;

      if (!productId || !sellerId) {
        return res.status(HTTP.BAD_REQUEST).json({ error: 'Missing productId or unauthorized' });
      }

      await productService.deleteProduct(productId, sellerId);
      res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
      logger.error('Controller error in deleteProduct:', error);
      res.status(HTTP.INTERNAL_ERROR).json({ error: ERR.INTERNAL });
    }
  }
}

export const productController = new ProductController();
