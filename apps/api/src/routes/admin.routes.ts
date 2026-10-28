import { Router, Request, Response, NextFunction } from 'express';
import { reconcileDb } from '../db/index.js';

export const adminRouter = Router();

// GET /admin/reconcile
// Returns Raju's reconcileDb() result as-is: { ok, totalAvailable, totalReserved, totalDebits, totalCredits, escrowHeld, negativeRows }
adminRouter.get('/reconcile', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await reconcileDb();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
