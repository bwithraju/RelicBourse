import { DbClient, MarketsRepository } from '../contract.js';
import { Order } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgMarketsRepo: MarketsRepository = {
  async listMarkets(client?: DbClient): Promise<any[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, name, face_value_minor AS "faceValueMinor", cap_percent AS "capPercent", status
       FROM markets
       ORDER BY id ASC;`
    );
    return res.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      faceValueMinor: Number(row.faceValueMinor),
      capPercent: Number(row.capPercent),
      status: row.status,
    }));
  },

  async getMarket(client: DbClient, marketId: string): Promise<any | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, name, face_value_minor AS "faceValueMinor", cap_percent AS "capPercent", status
       FROM markets
       WHERE id = $1;`,
      [marketId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      name: row.name,
      faceValueMinor: Number(row.faceValueMinor),
      capPercent: Number(row.capPercent),
      status: row.status,
    };
  },

  async getOpenOrdersForBook(client: DbClient, marketId: string): Promise<Order[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, user_id AS "userId", market_id AS "marketId", side, type,
              price_minor AS "priceMinor", qty, filled_qty AS "filledQty",
              status, idempotency_key AS "idempotencyKey", created_at AS "createdAt"
       FROM orders
       WHERE market_id = $1 AND status IN ('OPEN', 'PARTIAL')
       ORDER BY created_at ASC;`,
      [marketId]
    );
    return res.rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      marketId: row.marketId,
      side: row.side,
      type: row.type,
      priceMinor: row.priceMinor !== null ? Number(row.priceMinor) : null,
      qty: Number(row.qty),
      filledQty: Number(row.filledQty),
      status: row.status,
      idempotencyKey: row.idempotencyKey,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  },
};
