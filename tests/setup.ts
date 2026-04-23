import { vi } from 'vitest';

/**
 * Mocking Firebase Admin and our local firebase lib to support integration tests
 * without a real Firebase project or service account.
 */

const mockFirestoreDoc = {
  id: 'mock-id',
  get: vi.fn().mockResolvedValue({
    exists: true,
    data: () => ({ seller_id: 'farmer_123' })
  }),
  set: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
};

const mockFirestoreCollection = {
  doc: vi.fn().mockReturnValue(mockFirestoreDoc),
  add: vi.fn().mockResolvedValue(mockFirestoreDoc),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue({
    exists: false,
    docs: []
  }),
};

const mockDb = {
  collection: vi.fn().mockReturnValue(mockFirestoreCollection),
  doc: vi.fn().mockReturnValue(mockFirestoreDoc),
};

vi.mock('firebase-admin', () => {
  return {
    default: {
      apps: [],
      initializeApp: vi.fn().mockReturnValue({
        options: { projectId: 'test-project' }
      }),
      credential: {
        cert: vi.fn(),
        applicationDefault: vi.fn(),
      },
      auth: vi.fn().mockReturnValue({
        verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
          if (token === 'valid-farmer-token') {
            return { uid: 'farmer_123', role: 'Farmer', email: 'farmer@test.com' };
          }
          if (token === 'valid-buyer-token') {
            return { uid: 'buyer_123', role: 'Buyer', email: 'buyer@test.com' };
          }
          throw new Error('Invalid token');
        }),
      }),
      firestore: vi.fn().mockReturnValue(mockDb),
    },
  };
});

vi.mock('../src/lib/firebase.js', () => {
  return {
    firebaseAdmin: {},
    auth: {
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'valid-farmer-token') {
          return { uid: 'farmer_123', role: 'Farmer', email: 'farmer@test.com' };
        }
        if (token === 'valid-buyer-token') {
          return { uid: 'buyer_123', role: 'Buyer', email: 'buyer@test.com' };
        }
        throw new Error('Invalid token');
      }),
    },
    db: mockDb,
  };
});
