import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { authRouter } from './auth/routes.js';
import { marketRouter } from './routes/market.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { tradeRouter } from './routes/trade.routes.js';
import { portfolioRouter } from './routes/portfolio.routes.js';
import { auctionRouter } from './routes/auction.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { errorHandler } from './middleware/error.js';

export function createApp(): Express {
  const app: Express = express();

  app.use(cors());
  app.use(express.json());

  // Health check endpoint required by MASTER spec
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // REST API Routes
  app.use('/auth', authRouter);
  app.use('/markets', marketRouter);
  app.use('/orders', orderRouter);
  app.use('/trades', tradeRouter);
  app.use('/portfolio', portfolioRouter);
  app.use('/auctions', auctionRouter);
  app.use('/admin', adminRouter);

  // Central error handler (JSON { error }, no stack traces leaked)
  app.use(errorHandler);

  return app;
}
