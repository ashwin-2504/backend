import { Request, Response, NextFunction } from 'express';
import { auth } from '../lib/firebase.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export const requireRole = (...allowedRoles: Array<'seller' | 'customer'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (!role) {
      return res.status(403).json({ success: false, error: 'Forbidden: Role missing from token' });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, error: `Forbidden: ${role} accounts cannot access this resource` });
    }

    next();
  };
};

export const verifyAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    
    req.user = decodedToken;
    next();
  } catch (error) {
    logger.error('Auth verification failed:', error);
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};
