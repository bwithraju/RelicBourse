import { Router, Request, Response, NextFunction } from 'express';
import { marketsRepo, withTransaction } from '../db/index.js';
import { BookManager } from '../engine/book-manager.js';
import { AppError } from '../middleware/error.js';

export const marketRouter = Router();

// GET /markets (public)
marketRouter.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const markets = await marketsRepo.listMarkets();
    const bookManager = BookManager.getInstance();
    const enriched = markets.map((m: any) => {
      try {
        const book = bookManager.getBook(m.id);
        const snapshot = book.getSnapshot(1);
        const bestBid = snapshot.bids && snapshot.bids.length > 0 ? snapshot.bids[0].price : null;
        const bestAsk = snapshot.asks && snapshot.asks.length > 0 ? snapshot.asks[0].price : null;
        return {
          ...m,
          bestBid,
          bestAsk,
        };
      } catch {
        return m;
      }
    });
    res.status(200).json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /markets/:id/book (public or protected, Level-2 snapshot)
marketRouter.get('/:id/book', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const marketId = req.params.id;
    const market = await withTransaction(async (client) => {
      return await marketsRepo.getMarket(client, marketId);
    });

    if (!market) {
      throw new AppError('Market not found', 404);
    }

    const book = BookManager.getInstance().getBook(marketId);
    const snapshot = book.getSnapshot();
    res.status(200).json(snapshot);
  } catch (err) {
    next(err);
  }
});
