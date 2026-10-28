import { getRunner } from './pool.js';
import { DbClient } from './contract.js';
import { Order } from '@relicbourse/shared';

export async function getAllOpenOrdersGroupedByMarket(
  client?: DbClient
): Promise<Record<string, Order[]>> {
  const runner = getRunner(client);
  const res = await runner.query(`
    SELECT id, user_id AS "userId", market_id AS "marketId", side, type,
           price_minor AS "priceMinor", qty, filled_qty AS "filledQty",
           status, idempotency_key AS "idempotencyKey", created_at AS "createdAt"
    FROM orders
    WHERE status IN ('OPEN', 'PARTIAL')
    ORDER BY created_at ASC;
  `);

  const map: Record<string, Order[]> = {};
  for (const row of res.rows) {
    const order: Order = {
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
    };
    if (!map[order.marketId]) {
      map[order.marketId] = [];
    }
    map[order.marketId].push(order);
  }
  return map;
}
