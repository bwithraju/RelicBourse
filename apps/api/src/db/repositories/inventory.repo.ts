import { DbClient, InventoryRepository } from '../contract.js';
import { Inventory } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgInventoryRepo: InventoryRepository = {
  async seedInventory(client: DbClient, userId: string, marketId: string, quantity: number): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `INSERT INTO inventory (user_id, market_id, quantity, reserved_qty)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (user_id, market_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity;`,
      [userId, marketId, quantity]
    );
  },

  async getInventory(client: DbClient, userId: string, marketId: string): Promise<Inventory | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT user_id AS "userId", market_id AS "marketId", quantity, reserved_qty AS "reservedQty"
       FROM inventory
       WHERE user_id = $1 AND market_id = $2;`,
      [userId, marketId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      userId: row.userId,
      marketId: row.marketId,
      quantity: Number(row.quantity),
      reservedQty: Number(row.reservedQty),
    };
  },

  async listInventoryByUser(client: DbClient, userId: string): Promise<Inventory[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT user_id AS "userId", market_id AS "marketId", quantity, reserved_qty AS "reservedQty"
       FROM inventory
       WHERE user_id = $1
       ORDER BY market_id;`,
      [userId]
    );
    return res.rows.map((row: any) => ({
      userId: row.userId,
      marketId: row.marketId,
      quantity: Number(row.quantity),
      reservedQty: Number(row.reservedQty),
    }));
  },

  async reserveInventory(client: DbClient, userId: string, marketId: string, qty: number): Promise<boolean> {
    const runner = getRunner(client);
    const res = await runner.query(
      `UPDATE inventory
       SET reserved_qty = reserved_qty + $3
       WHERE user_id = $1 AND market_id = $2 AND (quantity - reserved_qty) >= $3;`,
      [userId, marketId, qty]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async releaseInventoryReservation(client: DbClient, userId: string, marketId: string, qty: number): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE inventory
       SET reserved_qty = reserved_qty - $3
       WHERE user_id = $1 AND market_id = $2 AND reserved_qty >= $3;`,
      [userId, marketId, qty]
    );
  },

  async settleInventoryMove(
    client: DbClient,
    buyerId: string,
    sellerId: string,
    marketId: string,
    qty: number
  ): Promise<void> {
    const runner = getRunner(client);
    // Decrement seller inventory and reservation
    await runner.query(
      `UPDATE inventory
       SET quantity = quantity - $3,
           reserved_qty = reserved_qty - $3
       WHERE user_id = $1 AND market_id = $2;`,
      [sellerId, marketId, qty]
    );

    // Upsert/increment buyer inventory
    await runner.query(
      `INSERT INTO inventory (user_id, market_id, quantity, reserved_qty)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (user_id, market_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity;`,
      [buyerId, marketId, qty]
    );
  },
};
