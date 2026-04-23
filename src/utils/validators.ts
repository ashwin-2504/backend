import { z } from 'zod';

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(50),
  fullAddress: z.string().trim().min(2, "Address must be at least 2 characters"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().min(1, "State is required"),
  pincode: z.string().trim().length(6, "Pincode must be exactly 6 digits").regex(/^\d+$/, "Pincode must be numeric"),
  isDefault: z.boolean().optional(),
});

export const updateAddressSchema = addressSchema.partial();

export const orderItemSchema = z.object({
  productId: z.string(),
  sellerId: z.string(),
  qty: z.number().int().positive(),
});

export const createOrderSchema = z.object({
  uid: z.string(),
  paymentId: z.string(),
  idempotency_key: z.string().optional(),
  addressSnapshot: z.object({
    id: z.string(),
    label: z.string(),
    fullAddress: z.string(),
    pincode: z.string(),
    city: z.string().optional(),
    state: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  items: z.array(orderItemSchema).min(1, "Order must have at least one item"),
});
