import { db } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';
import { Review } from '../types/models.js';
import { Timestamp } from 'firebase-admin/firestore';

export class ReviewService {
  async addReview(reviewData: Partial<Review>): Promise<Review> {
    try {
      const reviewRef = db.collection('reviews').doc();
      const review: Review = {
        ...reviewData,
        reviewId: reviewRef.id,
        createdAt: Timestamp.now()
      } as Review;

      await reviewRef.set(review);

      // Trigger denormalization updates
      await this.updateTargetStats(review.targetId, review.targetType);

      return review;
    } catch (error) {
      logger.error('Error adding review to Firestore', error);
      throw error;
    }
  }

  async getReviewsByTarget(targetId: string): Promise<Review[]> {
    try {
      const snapshot = await db.collection('reviews')
        .where('targetId', '==', targetId)
        .orderBy('createdAt', 'desc')
        .get();
      return snapshot.docs.map(doc => doc.data() as Review);
    } catch (error) {
      logger.error(`Error fetching reviews for target ${targetId}`, error);
      throw error;
    }
  }

  private async updateTargetStats(targetId: string, targetType: 'product' | 'seller') {
    try {
      const snapshot = await db.collection('reviews')
        .where('targetId', '==', targetId)
        .get();

      const reviews = snapshot.docs.map(doc => doc.data() as Review);
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      const totalReviews = reviews.length;

      const collectionName = targetType === 'product' ? 'products' : 'sellers';
      await db.collection(collectionName).doc(targetId).update({
        avgRating,
        totalReviews
      });
    } catch (error) {
      logger.warn(`Failed to update denormalized stats for ${targetType} ${targetId}`, error);
    }
  }
}

export const reviewService = new ReviewService();
