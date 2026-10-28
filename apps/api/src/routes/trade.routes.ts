import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { tradesRepo, withTransaction } from '../db/index.js';
import { OrderService } from '../services/order.service.js';
import { broadcastMarketEvents } from '../ws/broadcast.js';

export const tradeRouter = Router();

// GET /trades?marketId=
tradeRouter.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const marketId = req.query.marketId as string;
      if (!marketId) {
        res.status(400).json({ error: 'Query parameter "marketId" is required' });
        return;
      }

      const trades = await withTransaction(async (client) => {
        return await tradesRepo.listTradesByMarket(client, marketId, 50);
      });

      res.status(200).json(trades);
    } catch (err) {
      next(err);
    }
  }
);

// POST /trades/:id/confirm-delivery
tradeRouter.post(
  '/:id/confirm-delivery',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const tradeId = req.params.id;

      const result = await OrderService.confirmDelivery(userId, tradeId);

      // Commit-then-broadcast
      broadcastMarketEvents('', result.events);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
