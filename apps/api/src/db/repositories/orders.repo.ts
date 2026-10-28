import { DbClient, OrdersRepository } from '../contract.js';
import { Order, OrderStatus } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgOrdersRepo: OrdersRepository = {
  async insertOrder(client: DbClient, order: Omit<Order, 'createdAt'>): Promise<Order> {
    const runner = getRunner(client);
    const res = await runner.query(
      `INSERT INTO orders (id, user_id, market_id, side, type, price_minor, qty, filled_qty, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, user_id AS "userId", market_id AS "marketId", side, type,
                 price_minor AS "priceMinor", qty, filled_qty AS "filledQty",
                 status, idempotency_key AS "idempotencyKey", created_at AS "createdAt";`,
      [
        order.id,
        order.userId,
        order.marketId,
        order.side,
        order.type,
        order.priceMinor !== null ? order.priceMinor.toString() : null,
        order.qty,
        order.filledQty,
        order.status,
        order.idempotencyKey,
      ]
    );
    const row = res.rows[0];
    return {
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
  },

  async updateOrderFill(client: DbClient, orderId: string, filledQty: number, status: OrderStatus): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE orders
       SET filled_qty = $2, status = $3
       WHERE id = $1;`,
      [orderId, filledQty, status]
    );
  },

  async getOrder(client: DbClient, orderId: string): Promise<Order | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, user_id AS "userId", market_id AS "marketId", side, type,
              price_minor AS "priceMinor", qty, filled_qty AS "filledQty",
              status, idempotency_key AS "idempotencyKey", created_at AS "createdAt"
       FROM orders
       WHERE id = $1;`,
      [orderId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
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
  },

  async listOrdersByUser(client: DbClient, userId: string): Promise<Order[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, user_id AS "userId", market_id AS "marketId", side, type,
              price_minor AS "priceMinor", qty, filled_qty AS "filledQty",
              status, idempotency_key AS "idempotencyKey", created_at AS "createdAt"
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC;`,
      [userId]
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

  async storeIdempotentResponse(
    client: DbClient,
    key: string,
    userId: string,
    requestHash: string,
    storedResponse: any
  ): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `INSERT INTO idempotency_keys (key, user_id, request_hash, stored_response)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO NOTHING;`,
      [key, userId, requestHash, JSON.stringify(storedResponse)]
    );
  },

  async getIdempotentResponse(
    client: DbClient,
    key: string
  ): Promise<{ storedResponse: any; requestHash: string } | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT stored_response AS "storedResponse", request_hash AS "requestHash"
       FROM idempotency_keys
       WHERE key = $1;`,
      [key]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      storedResponse: typeof row.storedResponse === 'string' ? JSON.parse(row.storedResponse) : row.storedResponse,
      requestHash: row.requestHash,
    };
  },
};
