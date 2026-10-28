import { DbClient, LedgerRepository } from '../contract.js';
import { MinorUnits } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgLedgerRepo: LedgerRepository = {
  async insertEntries(
    client: DbClient,
    tradeId: string,
    entries: Array<{ accountUserId: string; debitMinor: MinorUnits; creditMinor: MinorUnits }>
  ): Promise<void> {
    const runner = getRunner(client);
    for (const entry of entries) {
      await runner.query(
        `INSERT INTO ledger_entries (trade_id, account_user_id, debit_minor, credit_minor)
         VALUES ($1, $2, $3, $4);`,
        [tradeId, entry.accountUserId, entry.debitMinor.toString(), entry.creditMinor.toString()]
      );
    }
  },

  async getLedgerTotals(client?: DbClient): Promise<{ totalDebits: MinorUnits; totalCredits: MinorUnits }> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT COALESCE(SUM(debit_minor), 0) AS total_debits,
              COALESCE(SUM(credit_minor), 0) AS total_credits
       FROM ledger_entries;`
    );
    const row = res.rows[0];
    return {
      totalDebits: Number(row.total_debits),
      totalCredits: Number(row.total_credits),
    };
  },
};
