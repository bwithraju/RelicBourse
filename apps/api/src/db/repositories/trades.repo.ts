import { DbClient, TradesRepository } from '../contract.js';
import { Trade } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgTradesRepo: TradesRepository = {
  async insertTrade(client: DbClient, trade: Omit<Trade, 'id' | 'createdAt'>): Promise<Trade> {
    const runner = getRunner(client);
    const res = await runner.query(
      `INSERT INTO trades (market_id, buy_order_id, sell_order_id, price_minor, qty)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, market_id AS "marketId", buy_order_id AS "buyOrderId", sell_order_id AS "sellOrderId",
                 price_minor AS "priceMinor", qty, created_at AS "createdAt";`,
      [
        trade.marketId,
        trade.buyOrderId,
        trade.sellOrderId,
        trade.priceMinor.toString(),
        trade.qty,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      marketId: row.marketId,
      buyOrderId: row.buyOrderId,
      sellOrderId: row.sellOrderId,
      priceMinor: Number(row.priceMinor),
      qty: Number(row.qty),
      createdAt: new Date(row.createdAt).toISOString(),
    };
  },

  async listTradesByMarket(client: DbClient, marketId: string, limit = 50): Promise<Trade[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, market_id AS "marketId", buy_order_id AS "buyOrderId", sell_order_id AS "sellOrderId",
              price_minor AS "priceMinor", qty, created_at AS "createdAt"
       FROM trades
       WHERE market_id = $1
       ORDER BY created_at DESC
       LIMIT $2;`,
      [marketId, limit]
    );
    return res.rows.map((row: any) => ({
      id: row.id,
      marketId: row.marketId,
      buyOrderId: row.buyOrderId,
      sellOrderId: row.sellOrderId,
      priceMinor: Number(row.priceMinor),
      qty: Number(row.qty),
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  },

  async getTrade(client: DbClient, tradeId: string): Promise<Trade | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, market_id AS "marketId", buy_order_id AS "buyOrderId", sell_order_id AS "sellOrderId",
              price_minor AS "priceMinor", qty, created_at AS "createdAt"
       FROM trades
       WHERE id = $1;`,
      [tradeId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      marketId: row.marketId,
      buyOrderId: row.buyOrderId,
      sellOrderId: row.sellOrderId,
      priceMinor: Number(row.priceMinor),
      qty: Number(row.qty),
      createdAt: new Date(row.createdAt).toISOString(),
    };
  },
};
