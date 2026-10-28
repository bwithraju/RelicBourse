import { DbClient, AccountsRepository } from '../contract.js';
import { Account, MinorUnits } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgAccountsRepo: AccountsRepository = {
  async createAccount(client: DbClient, userId: string, initialBalanceMinor: MinorUnits): Promise<Account> {
    const runner = getRunner(client);
    const res = await runner.query(
      `INSERT INTO accounts (user_id, balance_minor, reserved_minor)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance_minor = accounts.balance_minor
       RETURNING user_id AS "userId", balance_minor AS "balanceMinor", reserved_minor AS "reservedMinor";`,
      [userId, initialBalanceMinor.toString()]
    );
    const row = res.rows[0];
    return {
      userId: row.userId,
      balanceMinor: Number(row.balanceMinor),
      reservedMinor: Number(row.reservedMinor),
    };
  },

  async getAccount(client: DbClient, userId: string): Promise<Account | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT user_id AS "userId", balance_minor AS "balanceMinor", reserved_minor AS "reservedMinor"
       FROM accounts
       WHERE user_id = $1;`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      userId: row.userId,
      balanceMinor: Number(row.balanceMinor),
      reservedMinor: Number(row.reservedMinor),
    };
  },

  async reserveFunds(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<boolean> {
    const runner = getRunner(client);
    const res = await runner.query(
      `UPDATE accounts
       SET balance_minor = balance_minor - $2,
           reserved_minor = reserved_minor + $2
       WHERE user_id = $1 AND balance_minor >= $2;`,
      [userId, amountMinor.toString()]
    );
    return (res.rowCount ?? 0) > 0;
  },

  async releaseReservation(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE accounts
       SET balance_minor = balance_minor + $2,
           reserved_minor = reserved_minor - $2
       WHERE user_id = $1 AND reserved_minor >= $2;`,
      [userId, amountMinor.toString()]
    );
  },

  async settleDebit(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE accounts
       SET reserved_minor = reserved_minor - $2
       WHERE user_id = $1 AND reserved_minor >= $2;`,
      [userId, amountMinor.toString()]
    );
  },

  async settleCredit(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE accounts
       SET balance_minor = balance_minor + $2
       WHERE user_id = $1;`,
      [userId, amountMinor.toString()]
    );
  },

  async lockAccount(client: DbClient, userId: string): Promise<Account | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT user_id AS "userId", balance_minor AS "balanceMinor", reserved_minor AS "reservedMinor"
       FROM accounts
       WHERE user_id = $1
       FOR UPDATE;`,
      [userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      userId: row.userId,
      balanceMinor: Number(row.balanceMinor),
      reservedMinor: Number(row.reservedMinor),
    };
  },
};
