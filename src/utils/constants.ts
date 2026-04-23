/**
 * Central constants — eliminates magic numbers and duplicate string literals.
 */

// ── HTTP Status Codes ────────────────────────────────────────────────
export const HTTP = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

// ── Error Messages (deduplicated) ────────────────────────────────────
export const ERR = {
  UNAUTHORIZED: 'Unauthorized',
  INTERNAL: 'Internal server error',
  NOT_FOUND: 'Not found',
  MISSING_FIELDS: 'Missing required fields',
  INVALID_STATUS: 'Invalid status provided',
  FORBIDDEN_ROLE: 'Forbidden: Role missing from token',
} as const;

// ── Order Status (replaces scattered string comparisons) ─────────────
export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PLACED: 'PLACED',
  CONFIRMED: 'CONFIRMED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  REFUND_REQUIRED: 'REFUND_REQUIRED',
} as const;

export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];

export const VALID_ORDER_STATUSES: readonly string[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PLACED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.FAILED,
] as const;

// ── Payment Status ───────────────────────────────────────────────────
export const PaymentStatus = {
  CREATED: 'CREATED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;

// ── Business Rules (replaces magic numbers) ──────────────────────────
export const BIZ = {
  /** Stale PENDING_PAYMENT order timeout (minutes) */
  STALE_ORDER_TIMEOUT_MINS: 15,
  /** Cleanup service polling interval (ms) — 5 minutes */
  CLEANUP_POLL_INTERVAL_MS: 5 * 60 * 1000,
  /** Payment window — 15 minutes */
  PAYMENT_WINDOW_MS: 15 * 60 * 1000,
  /** Idempotency key TTL — 24 hours */
  IDEMPOTENCY_TTL_MS: 24 * 60 * 60 * 1000,
  /** Firestore batch write limit */
  MAX_BATCH_SIZE: 500,
  /** GPS accuracy threshold for farm location (meters) */
  GPS_ACCURACY_THRESHOLD_M: 100,
  /** Default delivery radius (km) */
  DEFAULT_DELIVERY_RADIUS_KM: 10,
  /** Default delivery charge (INR) */
  DEFAULT_DELIVERY_CHARGE: 30,
  /** Default min order quantity */
  DEFAULT_MIN_QTY: 1,
  /** Default max order quantity */
  DEFAULT_MAX_QTY: 100,
  /** Maximum stock qty fallback */
  MAX_STOCK_QTY_FALLBACK: 1000,
  /** Paise per Rupee (Razorpay amount conversion) */
  PAISE_PER_RUPEE: 100,
  /** Graceful shutdown timeout (ms) */
  SHUTDOWN_TIMEOUT_MS: 10_000,
} as const;

// ── Rate Limiting ────────────────────────────────────────────────────
export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000,
  MAX_PROD: 100,
  MAX_DEV: 1000,
} as const;

// ── Firestore Collection Names (deduplicated) ────────────────────────
export const COL = {
  ORDERS: 'orders',
  SELLER_ORDERS: 'sellerOrders',
  PRODUCTS: 'products',
  PAYMENTS: 'payments',
  USER_PROFILES: 'userProfiles',
  ADDRESSES: 'addresses',
  IDEMPOTENCY_KEYS: 'idempotency_keys',
  IDEMPOTENCY_CONFIRM: 'idempotency_confirm',
  STOCK_LOCKS: 'stockLocks',
} as const;
