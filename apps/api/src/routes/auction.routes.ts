import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createAuctionSchema, bidAuctionSchema } from '../schemas/index.js';
import { AuctionService } from '../auction/auction.service.js';
import { AppError } from '../middleware/error.js';

export const auctionRouter = Router();

// GET /auctions (public)
auctionRouter.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auctions = await AuctionService.listAuctions();
    res.status(200).json(auctions);
  } catch (err) {
    next(err);
  }
});

// GET /auctions/:id (public)
auctionRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const auction = await AuctionService.getAuction(req.params.id);
    if (!auction) {
      throw new AppError('Auction not found', 404);
    }
    res.status(200).json(auction);
  } catch (err) {
    next(err);
  }
});

// POST /auctions (protected)
auctionRouter.post(
  '/',
  authMiddleware,
  validate(createAuctionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const auction = await AuctionService.createAuction(userId, req.body);
      res.status(201).json(auction);
    } catch (err) {
      next(err);
    }
  }
);

// POST /auctions/:id/bid (protected)
auctionRouter.post(
  '/:id/bid',
  authMiddleware,
  validate(bidAuctionSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const auctionId = req.params.id;
      const expectedPrice = req.body?.expectedPriceMinor;

      const result = await AuctionService.placeBid(userId, auctionId, expectedPrice);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
