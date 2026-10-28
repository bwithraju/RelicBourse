import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { placeOrderSchema } from '../schemas/index.js';
import { orderRateLimit } from '../middleware/rate-limit.js';
import { OrderService } from '../services/order.service.js';
import { MarketSequencer } from '../engine/sequencer.js';
import { ordersRepo, withTransaction } from '../db/index.js';
import { broadcastMarketEvents } from '../ws/broadcast.js';

export const orderRouter = Router();

// POST /orders
orderRouter.post(
  '/',
  authMiddleware,
  orderRateLimit,
  validate(placeOrderSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const payload = req.body;
      const sequencer = MarketSequencer.getInstance();

      // Enqueue order through per-market FIFO sequencer
      const result = await sequencer.enqueue(payload.marketId, async () => {
        return await OrderService.placeOrder(userId, payload);
      });

      // Commit-then-broadcast: Broadcast WebSocket events ONLY AFTER settlement succeeds
      broadcastMarketEvents(payload.marketId, result.events);

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /orders/:id/cancel
orderRouter.post(
  '/:id/cancel',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const orderId = req.params.id;

      const result = await OrderService.cancelOrder(userId, orderId);

      // Commit-then-broadcast
      broadcastMarketEvents(result.order.marketId, result.events);

      res.status(200).json(result.order);
    } catch (err) {
      next(err);
    }
  }
);

// GET /orders/mine
orderRouter.get(
  '/mine',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const orders = await withTransaction(async (client) => {
        return await ordersRepo.listOrdersByUser(client, userId);
      });
      res.status(200).json(orders);
    } catch (err) {
      next(err);
    }
  }
);
