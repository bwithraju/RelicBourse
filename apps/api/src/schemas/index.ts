import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const placeOrderSchema = z.object({
  marketId: z.string().min(1, 'Market ID is required'),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['LIMIT', 'MARKET']),
  price: z.number().int().positive('Price must be a positive integer in minor units').optional(),
  qty: z.number().int().positive('Quantity must be a positive integer'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
}).refine(
  (data) => {
    if (data.type === 'LIMIT') {
      return typeof data.price === 'number' && data.price > 0;
    }
    return true;
  },
  {
    message: 'Price is required for LIMIT orders',
    path: ['price'],
  }
);

export const cancelOrderSchema = z.object({
  id: z.string().min(1, 'Order ID is required'),
});

export const createAuctionSchema = z.object({
  marketId: z.string().min(1, 'Market ID is required'),
  startPriceMinor: z.number().int().positive('Start price must be a positive integer in minor units'),
  floorPriceMinor: z.number().int().positive('Floor price must be a positive integer in minor units'),
  decrementMinor: z.number().int().positive('Decrement must be a positive integer in minor units'),
  intervalSec: z.number().int().positive('Interval must be a positive integer seconds'),
}).refine((data) => data.floorPriceMinor <= data.startPriceMinor, {
  message: 'Floor price must be less than or equal to start price',
  path: ['floorPriceMinor'],
});

export const bidAuctionSchema = z.object({
  expectedPriceMinor: z.number().int().positive('Expected price must be a positive integer in minor units').optional(),
});
