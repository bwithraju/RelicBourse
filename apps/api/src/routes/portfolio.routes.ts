import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import {
  accountsRepo,
  inventoryRepo,
  escrowRepo,
  tradesRepo,
  ordersRepo,
  marketsRepo,
  withTransaction,
} from '../db/index.js';
import { PortfolioView, TradeView } from '@relicbourse/shared';

export const portfolioRouter = Router();

// GET /portfolio
portfolioRouter.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;

      const portfolio = await withTransaction(async (client): Promise<PortfolioView> => {
        // Balances
        const account = await accountsRepo.getAccount(client, userId);
        const available = account ? account.balanceMinor : 0;
        const reserved = account ? account.reservedMinor : 0;

        // Inventory
        const inventoryRows = await inventoryRepo.listInventoryByUser(client, userId);
        const markets = await marketsRepo.listMarkets(client);
        const marketMap = new Map(markets.map((m) => [m.id, m.name]));

        const inventory = inventoryRows.map((inv) => ({
          marketId: inv.marketId,
          marketName: marketMap.get(inv.marketId) || inv.marketId,
          quantity: inv.quantity,
          reservedQty: inv.reservedQty,
          availableQty: Math.max(0, inv.quantity - inv.reservedQty),
        }));

        // User orders & trades
        const myOrders = await ordersRepo.listOrdersByUser(client, userId);
        const myOrderIds = new Set(myOrders.map((o) => o.id));

        // Holds
        const userHolds = await escrowRepo.listHoldsByUser(client, userId);
        const escrows = await Promise.all(
          userHolds.map(async (h) => {
            const trade = await tradesRepo.getTrade(client, h.tradeId);
            const isBuyer = trade ? myOrderIds.has(trade.buyOrderId) : false;
            return {
              tradeId: h.tradeId,
              amountMinor: h.amountMinor,
              status: h.status,
              isBuyer,
            };
          })
        );

        // Recent trades where user was buyer or seller
        const trades: TradeView[] = [];
        for (const order of myOrders) {
          const marketTrades = await tradesRepo.listTradesByMarket(client, order.marketId, 20);
          for (const t of marketTrades) {
            if (t.buyOrderId === order.id || t.sellOrderId === order.id) {
              if (!trades.some((existing) => existing.id === t.id)) {
                trades.push({
                  id: t.id,
                  marketId: t.marketId,
                  buyOrderId: t.buyOrderId,
                  sellOrderId: t.sellOrderId,
                  price: t.priceMinor,
                  qty: t.qty,
                  createdAt: t.createdAt,
                });
              }
            }
          }
        }

        return {
          balanceMinor: available,
          reservedMinor: reserved,
          balances: {
            available,
            reserved,
            total: available + reserved,
          },
          inventory,
          trades,
          escrows,
        };
      });

      res.status(200).json(portfolio);
    } catch (err) {
      next(err);
    }
  }
);
