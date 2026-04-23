import 'dotenv/config';
import { auth, db } from '../lib/firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '../utils/logger.js';
import { COL, OrderStatus } from '../utils/constants.js';

const now = () => Timestamp.now();

interface DemoUser {
  email: string;
  password: string;
  name: string;
  role: 'seller' | 'customer';
  phone: string;
  address: string;
}

const demoUsers: DemoUser[] = [
  {
    email: 'demo.seller@onlinemarket.local',
    password: 'DemoSeller123!',
    name: 'Demo Seller',
    role: 'seller',
    phone: '9999000001',
    address: 'Demo Farm, Nashik, Maharashtra',
  },
  {
    email: 'demo.customer@onlinemarket.local',
    password: 'DemoCustomer123!',
    name: 'Demo Customer',
    role: 'customer',
    phone: '9999000002',
    address: 'Demo Colony, Pune, Maharashtra',
  },
];

const ensureAuthUser = async (seed: DemoUser): Promise<string> => {
  try {
    const existing = await auth.getUserByEmail(seed.email);
    await auth.updateUser(existing.uid, { displayName: seed.name });
    await auth.setCustomUserClaims(existing.uid, { role: seed.role });
    return existing.uid;
  } catch (error: any) {
    if (error?.code !== 'auth/user-not-found') throw error;

    const created = await auth.createUser({
      email: seed.email,
      password: seed.password,
      displayName: seed.name,
    });
    await auth.setCustomUserClaims(created.uid, { role: seed.role });
    return created.uid;
  }
};

const main = async () => {
  logger.info('Starting schema-aligned seed...');

  // 1. Setup Identities
  const [sellerUid, customerUid] = await Promise.all([
    ensureAuthUser(demoUsers[0]),
    ensureAuthUser(demoUsers[1]),
  ]);

  // 2. User Profiles & Addresses (parallelized)
  await Promise.all(
    demoUsers.map(async (user) => {
      const uid = user.role === 'seller' ? sellerUid : customerUid;
      const userRef = db.collection(COL.USER_PROFILES).doc(uid);

      await userRef.set({
        uid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        defaultAddressId: 'addr_default',
        createdAt: now(),
      });

      await userRef.collection(COL.ADDRESSES).doc('addr_default').set({
        id: 'addr_default',
        label: 'Home',
        fullAddress: user.address,
        city: 'Nashik',
        state: 'Maharashtra',
        pincode: '422001',
      });
    })
  );

  // 3. Sellers
  const sellerId = 'seller_demo_001';
  await db.collection('sellers').doc(sellerId).set({
    sellerId,
    uid: sellerUid,
    farmName: 'Green Valley Organic Farm',
    description: 'Providing fresh organic vegetables directly from the farm.',
    pincode: '422001',
    isActive: true,
  });

  // 4. Products (parallelized)
  const products = [
    {
      productId: 'prod_tomatoes_001',
      name: 'Organic Tomatoes',
      category: 'Vegetables',
      description: 'Firm, sun-ripened tomatoes.',
      price: 40,
      unit: 'kg',
      stockQty: 100,
      isAvailable: true,
      imageUrls: ['https://images.unsplash.com/photo-1546470427-1c5a6f0c9f3b'],
    },
    {
      productId: 'prod_onions_001',
      name: 'Red Onions',
      category: 'Vegetables',
      description: 'Fresh long-storage red onions.',
      price: 25,
      unit: 'kg',
      stockQty: 500,
      isAvailable: true,
      imageUrls: ['https://images.unsplash.com/photo-1508747703725-7197771375a0'],
    },
  ];

  await Promise.all(
    products.map((p) =>
      db.collection(COL.PRODUCTS).doc(p.productId).set({
        ...p,
        sellerId,
        sellerSnapshot: { farmName: 'Green Valley Organic Farm', pincode: '422001' },
        updatedAt: now(),
      })
    )
  );

  // 5. Orders & Items
  const orderId = 'order_demo_001';
  const orderRef = db.collection(COL.ORDERS).doc(orderId);
  await orderRef.set({
    orderId,
    uid: customerUid,
    addressSnapshot: {
      label: 'Home',
      fullAddress: demoUsers[1].address,
      pincode: '422001',
    },
    totalAmount: 80,
    status: OrderStatus.DELIVERED,
    paymentMethod: 'COD',
    paymentStatus: 'PAID',
    transactionId: 'txn_dummy_123',
    sellerIds: [sellerId],
    createdAt: now(),
    updatedAt: now(),
  });

  await orderRef.collection('items').doc('item_001').set({
    itemId: 'item_001',
    orderId,
    sellerId,
    productId: 'prod_tomatoes_001',
    productSnapshot: { name: 'Organic Tomatoes', unit: 'kg', imageUrl: '' },
    qty: 2,
    priceAtPurchase: 40,
    itemStatus: OrderStatus.DELIVERED,
  });

  // 6. SellerOrders
  await db.collection(COL.SELLER_ORDERS).doc(`${sellerId}_${orderId}`).set({
    docId: `${sellerId}_${orderId}`,
    sellerId,
    orderId,
    buyerName: 'Demo Customer',
    deliveryPincode: '422001',
    status: OrderStatus.DELIVERED,
    items: [{ productId: 'prod_tomatoes_001', qty: 2, priceAtPurchase: 40 }],
    sellerTotal: 80,
    createdAt: now(),
  });

  logger.info('Firestore aligned to MVP schema.');
  process.exit(0);
};

main().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
