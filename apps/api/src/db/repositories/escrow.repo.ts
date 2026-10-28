import { DbClient, EscrowRepository } from '../contract.js';
import { EscrowHold, MinorUnits } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgEscrowRepo: EscrowRepository = {
  async createHold(client: DbClient, tradeId: string, amountMinor: MinorUnits): Promise<EscrowHold> {
    const runner = getRunner(client);
    const res = await runner.query(
      `INSERT INTO escrow_holds (trade_id, amount_minor, status)
       VALUES ($1, $2, 'HELD')
       RETURNING id, trade_id AS "tradeId", amount_minor AS "amountMinor", status;`,
      [tradeId, amountMinor.toString()]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      tradeId: row.tradeId,
      amountMinor: Number(row.amountMinor),
      status: row.status,
    };
  },

  async releaseHold(client: DbClient, tradeId: string): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE escrow_holds SET status = 'RELEASED' WHERE trade_id = $1;`,
      [tradeId]
    );
  },

  async refundHold(client: DbClient, tradeId: string): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE escrow_holds SET status = 'REFUNDED' WHERE trade_id = $1;`,
      [tradeId]
    );
  },

  async listHoldsByUser(client: DbClient, userId: string): Promise<EscrowHold[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT DISTINCT eh.id, eh.trade_id AS "tradeId", eh.amount_minor AS "amountMinor",
              eh.status
       FROM escrow_holds eh
       JOIN trades t ON t.id = eh.trade_id
       JOIN orders o ON (o.id = t.buy_order_id OR o.id = t.sell_order_id)
       WHERE o.user_id = $1;`,
      [userId]
    );
    return res.rows.map((row: any) => ({
      id: row.id,
      tradeId: row.tradeId,
      amountMinor: Number(row.amountMinor),
      status: row.status,
    }));
  },
};
