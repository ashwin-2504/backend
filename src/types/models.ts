import { Timestamp } from 'firebase-admin/firestore';

export interface UserProfile {
  uid: string;
  name: string;
  email: string; // indexed
  phone: string | null;
  role: 'customer' | 'seller'; // indexed
  defaultAddressId: string;
  lastKnownLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  farmLocation?: {
    lat: number;
    lng: number;
    setAt: Timestamp | Date;
    accuracy: number;
  };
  lastLocationUpdate?: Timestamp | Date;
  deliveryCharge?: number;
  farmName?: string;
  createdAt: Timestamp | Date;
}

export interface Address {
  id: string; // addrId
  label: string;
  fullAddress: string;
  city: string;
  state: string;
  pincode: string; // indexed
  lat?: number;
  lng?: number;
  updatedAt?: Timestamp | Date;
}

export interface Seller {
  sellerId: string; // PK
  uid: string; // references userProfiles
  farmName: string; // indexed
  description: string;
  pincode: string; // indexed
  location: { // Required for MVP
    lat: number;
    lng: number;
  };
  isActive: boolean; // indexed
  avgRating: number; // denorm
  totalReviews: number; // denorm
  delivery_charge?: number; // per-seller charge
}

export interface Product {
  productId: string; // PK
  sellerId: string; // indexed
  sellerSnapshot: {
    farmName: string;
    pincode: string;
  };
  name: string; // indexed
  category: string; // indexed
  description: string;
  price: number; 
  unit: string;
  unitType: 'kg' | 'g' | 'piece' | 'dozen' | 'bundle';
  stockQty: number; // transactional
  isAvailable: boolean; // indexed
  imageUrls: string[];
  avgRating: number; // denorm
  updatedAt: Timestamp | Date;
  
  // New fields
  // Location & Logistics
  sellerLocation: { // Denormalizedfrom seller
    lat: number;
    lng: number;
  };
  deliveryRadius: number; // km
  harvestDate: string; // YYYY-MM-DD
  deliveryMode: 'SELF' | 'PICKUP';
  pincodes?: string[]; // optional fallback
  minQty: number;
  maxQty: number;
  isOrganic: boolean;
  isChemicalFree: boolean;
  bulkPricing: Array<{ min: number; max: number | null; price: number }>;
  freshness: 'TODAY' | '1_DAY_AGO' | '2_PLUS_DAYS';
  grade: 'A' | 'B' | 'MIXED';
  discountPercentage: number;
  tags: string[];
  delivery_charge?: number; // per-product delivery override
}

export interface Order {
  orderId: string; // PK
  uid: string; // indexed
  addressSnapshot: Address;
  totalAmount: number;
  lockedAmount: number; // Snapshot at T1 (initiate)
  status: 'PENDING_PAYMENT' | 'PLACED' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'FAILED' | 'REFUND_REQUIRED'; // indexed
  paymentMethod: string;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  transactionId: string;
  sellerIds: string[]; // indexed
  paymentId: string;
  idempotency_key?: string; // T1 (initiate) key
  idempotency_key_confirm?: string; // T3 (confirm) key
  paymentAttempts: number;
  failureReason?: string;
  version: number;
  expiresAt: Timestamp | Date;
  items: OrderItem[]; // embedded item snapshots
  orderLogs: Array<{
    event: string;
    timestamp: Timestamp | Date;
    details?: string;
  }>;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface Payment {
  paymentId: string;
  orderId: string;
  userId: string;
  amount: number;
  status: 'CREATED' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  provider: 'MOCK' | 'RAZORPAY';
  providerMetadata?: any;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  expiresAt: Timestamp | Date;
}

export interface OrderItem {
  itemId: string;
  orderId: string;
  sellerId: string; // indexed
  productId: string;
  productSnapshot: {
    name: string;
    unit: string;
    imageUrl: string;
  };
  qty: number;
  priceAtPurchase: number; // snapshot
  itemStatus: string;
}

export interface SellerOrder {
  docId: string; // sellerId_orderId
  sellerId: string; // indexed
  orderId: string;
  buyerName: string; // snapshot
  deliveryPincode: string;
  status: string; // indexed
  items: OrderItem[]; // filtered per seller
  subtotal: number;
  delivery_charge: number;
  delivery_mode: string;
  earnings: number;
  sellerTotal: number;
  createdAt: Timestamp | Date;
}

export interface CartItem {
  productId: string;
  sellerId: string;
  qty: number;
  price: number;
  name: string;
}

export interface Cart {
  uid: string;
  items: CartItem[];
  updatedAt: Timestamp | Date;
}

export interface Review {
  reviewId: string;
  uid: string;
  userName: string;
  targetId: string; // productId or sellerId
  targetType: 'product' | 'seller';
  rating: number; // 1-5
  comment: string;
  createdAt: Timestamp | Date;
}

export interface StockLock {
  productId: string;
  uid: string;
  lockedQty: number;
  expiresAt: Timestamp | Date;
  orderId?: string;
}
