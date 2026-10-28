import { getRunner } from './pool.js';
import { DbClient } from './contract.js';

export interface ReconcileResult {
  ok: boolean;
  totalBalances: number;
  totalLedgerNet: number;
  totalAvailable: number;
  totalReserved: number;
  totalDebits: number;
  totalCredits: number;
  escrowHeld: number;
  negativeRows: number;
}

export async function reconcileDb(client?: DbClient): Promise<ReconcileResult> {
  const runner = getRunner(client);

  // 1. Ledger totals (debits & credits)
  const ledgerRes = await runner.query(`
    SELECT
      COALESCE(SUM(debit_minor), 0) AS total_debits,
      COALESCE(SUM(credit_minor), 0) AS total_credits
    FROM ledger_entries;
  `);
  const totalDebits = Number(ledgerRes.rows[0].total_debits);
  const totalCredits = Number(ledgerRes.rows[0].total_credits);
  const totalLedgerNet = totalDebits - totalCredits;

  // 2. Accounts balance & reserved totals
  const accountsRes = await runner.query(`
    SELECT
      COALESCE(SUM(balance_minor), 0) AS total_available,
      COALESCE(SUM(reserved_minor), 0) AS total_reserved
    FROM accounts;
  `);
  const totalAvailable = Number(accountsRes.rows[0].total_available);
  const totalReserved = Number(accountsRes.rows[0].total_reserved);
  const totalBalances = totalAvailable + totalReserved;

  // 3. Escrow holds currently held
  const escrowRes = await runner.query(`
    SELECT COALESCE(SUM(amount_minor), 0) AS total_held
    FROM escrow_holds
    WHERE status = 'HELD';
  `);
  const escrowHeld = Number(escrowRes.rows[0].total_held);

  // 4. Negative rows check (solvency validation)
  const negativeAccountsRes = await runner.query(`
    SELECT COUNT(*) AS count
    FROM accounts
    WHERE balance_minor < 0 OR reserved_minor < 0;
  `);
  const negativeInventoryRes = await runner.query(`
    SELECT COUNT(*) AS count
    FROM inventory
    WHERE quantity < 0 OR reserved_qty < 0 OR reserved_qty > quantity;
  `);
  const negativeRows =
    Number(negativeAccountsRes.rows[0].count) + Number(negativeInventoryRes.rows[0].count);

  const ok = totalDebits === totalCredits && negativeRows === 0;

  return {
    ok,
    totalBalances,
    totalLedgerNet,
    totalAvailable,
    totalReserved,
    totalDebits,
    totalCredits,
    escrowHeld,
    negativeRows,
  };
}
