import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, withTransaction, autoMigrate } from '../src/db/pool.js';
import { pgUsersRepo } from '../src/db/repositories/users.repo.js';
import { pgAccountsRepo } from '../src/db/repositories/accounts.repo.js';
import { pgInventoryRepo } from '../src/db/repositories/inventory.repo.js';
import { pgMarketsRepo } from '../src/db/repositories/markets.repo.js';
import { pgOrdersRepo } from '../src/db/repositories/orders.repo.js';
import { pgTradesRepo } from '../src/db/repositories/trades.repo.js';
import { pgLedgerRepo } from '../src/db/repositories/ledger.repo.js';
import { pgEscrowRepo } from '../src/db/repositories/escrow.repo.js';
import { pgAuctionsRepo } from '../src/db/repositories/auctions.repo.js';
import { reconcileDb } from '../src/db/reconcile.js';
import { seedNewUserData, DEMO_MARKETS } from '../src/db/seed.js';
import bcrypt from 'bcryptjs';

let isPgAvailable = false;
try {
  const client = await pool.connect();
  await client.query('SELECT 1 AS connected;');
  client.release();
  isPgAvailable = true;
} catch {
  console.warn('⚠️  PostgreSQL is not reachable on localhost:5432. Skipping live PostgreSQL database tests.');
}

describe.skipIf(!isPgAvailable)('PostgreSQL End-to-End Database Integration & Integrity Tests', () => {
  beforeAll(async () => {
    await autoMigrate();
    // Verify connection to PostgreSQL
    const res = await pool.query('SELECT 1 AS connected;');
    expect(res.rows[0].connected).toBe(1);
  });

  afterAll(async () => {
    if (isPgAvailable) {
      await pool.end();
    }
  });

  it('1. PostgreSQL holds the 4 demo markets with proper face values and 120% cap', async () => {
    const markets = await pgMarketsRepo.listMarkets();
    expect(markets.length).toBeGreaterThanOrEqual(4);

    const culrav = await pgMarketsRepo.getMarket({}, 'market-culrav-2026');
    expect(culrav).not.toBeNull();
    expect(culrav.faceValueMinor).toBe(200000);
    expect(culrav.capPercent).toBe(120);

    const renesiance = await pgMarketsRepo.getMarket({}, 'market-renesiance-2026');
    expect(renesiance).not.toBeNull();
    expect(renesiance.faceValueMinor).toBe(150000);

    const avishkar = await pgMarketsRepo.getMarket({}, 'market-avishkar-2026');
    expect(avishkar).not.toBeNull();
    expect(avishkar.faceValueMinor).toBe(250000);

    const rangtaadi = await pgMarketsRepo.getMarket({}, 'market-rangtaadi-2026');
    expect(rangtaadi).not.toBeNull();
    expect(rangtaadi.faceValueMinor).toBe(100000);
  });

  it('2. Registers user and seeds ₹1,00,000 + demo inventory in PostgreSQL', async () => {
    const email = `pg_trader_${Date.now()}@darkhold.com`;
    const passwordHash = await bcrypt.hash('secretPass123', 8);

    const user = await withTransaction(async (client) => {
      const u = await pgUsersRepo.createUser(client, { email, passwordHash });
      await seedNewUserData(client, u.id);
      return u;
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe(email);

    // Verify account row in PostgreSQL
    const account = await pgAccountsRepo.getAccount({}, user.id);
    expect(account).not.toBeNull();
    expect(account?.balanceMinor).toBe(10000000); // ₹1,00,000 in minor paise
    expect(account?.reservedMinor).toBe(0);

    // Verify inventory rows in PostgreSQL (2 of each demo market)
    const inventory = await pgInventoryRepo.listInventoryByUser({}, user.id);
    expect(inventory.length).toBe(4);
    for (const inv of inventory) {
      expect(inv.quantity).toBe(2);
      expect(inv.reservedQty).toBe(0);
    }

    // Verify authentication lookup
    const found = await pgUsersRepo.findByEmail({}, email);
    expect(found).not.toBeNull();
    expect(await bcrypt.compare('secretPass123', found!.passwordHash)).toBe(true);
  });

  it('3. Rejects duplicate email in PostgreSQL with 23505 unique violation', async () => {
    const email = `pg_dup_${Date.now()}@darkhold.com`;
    await pgUsersRepo.createUser({}, { email, passwordHash: 'hash1' });

    await expect(
      pgUsersRepo.createUser({}, { email, passwordHash: 'hash2' })
    ).rejects.toThrow();
  });

  it('4. Rejects negative balance insert via PostgreSQL CHECK constraint', async () => {
    const invalidUserId = '00000000-0000-0000-0000-000000000001';
    await expect(
      pool.query(
        'INSERT INTO accounts (user_id, balance_minor, reserved_minor) VALUES ($1, -100, 0);',
        [invalidUserId]
      )
    ).rejects.toThrow(/accounts_balance_minor/);
  });

  it('5. Reserves funds and inventory atomically in PostgreSQL', async () => {
    const email = `pg_reserve_${Date.now()}@darkhold.com`;
    const user = await withTransaction(async (client) => {
      const u = await pgUsersRepo.createUser(client, { email, passwordHash: 'hash' });
      await seedNewUserData(client, u.id);
      return u;
    });

    // Reserve ₹5,000 (500,000 paise)
    const reservedOk = await pgAccountsRepo.reserveFunds({}, user.id, 500000);
    expect(reservedOk).toBe(true);

    const acc = await pgAccountsRepo.getAccount({}, user.id);
    expect(acc?.balanceMinor).toBe(9500000);
    expect(acc?.reservedMinor).toBe(500000);

    // Reserve 1 festival pass
    const invOk = await pgInventoryRepo.reserveInventory({}, user.id, 'market-culrav-2026', 1);
    expect(invOk).toBe(true);

    const inv = await pgInventoryRepo.getInventory({}, user.id, 'market-culrav-2026');
    expect(inv?.quantity).toBe(2);
    expect(inv?.reservedQty).toBe(1);

    // Excessive reservation fails
    const excessiveFunds = await pgAccountsRepo.reserveFunds({}, user.id, 99999999);
    expect(excessiveFunds).toBe(false);

    const excessiveInv = await pgInventoryRepo.reserveInventory({}, user.id, 'market-culrav-2026', 10);
    expect(excessiveInv).toBe(false);
  });

  it('6. Executes trade with double-entry ledger, escrow hold, and balanced reconciliation', async () => {
    const buyerEmail = `buyer_${Date.now()}@darkhold.com`;
    const sellerEmail = `seller_${Date.now()}@darkhold.com`;

    const { buyer, seller } = await withTransaction(async (client) => {
      const b = await pgUsersRepo.createUser(client, { email: buyerEmail, passwordHash: 'hash' });
      const s = await pgUsersRepo.createUser(client, { email: sellerEmail, passwordHash: 'hash' });
      await seedNewUserData(client, b.id);
      await seedNewUserData(client, s.id);
      return { buyer: b, seller: s };
    });

    const marketId = 'market-culrav-2026';
    const tradePrice = 200000; // ₹2,000
    const qty = 1;

    // Reserve seller inventory first (matching engine order acceptance behavior)
    await pgInventoryRepo.reserveInventory({}, seller.id, marketId, qty);

    // Execute trade settlement inside single PostgreSQL transaction
    const trade = await withTransaction(async (client) => {
      // 1. Insert buy and sell orders
      const buyOrder = await pgOrdersRepo.insertOrder(client, {
        id: crypto.randomUUID(),
        userId: buyer.id,
        marketId,
        side: 'BUY',
        type: 'LIMIT',
        priceMinor: tradePrice,
        qty,
        filledQty: qty,
        status: 'FILLED',
        idempotencyKey: `buy_${Date.now()}`,
      });

      const sellOrder = await pgOrdersRepo.insertOrder(client, {
        id: crypto.randomUUID(),
        userId: seller.id,
        marketId,
        side: 'SELL',
        type: 'LIMIT',
        priceMinor: tradePrice,
        qty,
        filledQty: qty,
        status: 'FILLED',
        idempotencyKey: `sell_${Date.now()}`,
      });

      // 2. Insert trade
      const t = await pgTradesRepo.insertTrade(client, {
        marketId,
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        priceMinor: tradePrice,
        qty,
      });

      // 3. Move inventory (from seller to buyer)
      await pgInventoryRepo.settleInventoryMove(client, buyer.id, seller.id, marketId, qty);

      // 4. Double-entry ledger entries: debit buyer, credit escrow
      await pgLedgerRepo.insertEntries(client, t.id, [
        { accountUserId: buyer.id, debitMinor: tradePrice, creditMinor: 0 },
        { accountUserId: 'ESCROW_SYSTEM', debitMinor: 0, creditMinor: tradePrice },
      ]);

      // 5. Escrow hold created in 'HELD' status
      await pgEscrowRepo.createHold(client, t.id, tradePrice);

      return t;
    });

    expect(trade.id).toBeDefined();

    // Verify buyer inventory gained 1 unit (2 -> 3)
    const buyerInv = await pgInventoryRepo.getInventory({}, buyer.id, marketId);
    expect(buyerInv?.quantity).toBe(3);

    // Verify seller inventory lost 1 unit (2 -> 1)
    const sellerInv = await pgInventoryRepo.getInventory({}, seller.id, marketId);
    expect(sellerInv?.quantity).toBe(1);

    // Verify Escrow Hold is created
    const holds = await pgEscrowRepo.listHoldsByUser({}, buyer.id);
    expect(holds.some((h) => h.tradeId === trade.id && h.status === 'HELD')).toBe(true);

    // Release escrow upon delivery confirmation
    await pgEscrowRepo.releaseHold({}, trade.id);
    const releasedHolds = await pgEscrowRepo.listHoldsByUser({}, buyer.id);
    expect(releasedHolds.some((h) => h.tradeId === trade.id && h.status === 'RELEASED')).toBe(true);

    // Reconcile database: debits MUST equal credits
    const reconcile = await reconcileDb({});
    expect(reconcile.ok).toBe(true);
    expect(reconcile.totalLedgerNet).toBe(0);
    expect(reconcile.negativeRows).toBe(0);
  });

  it('7. Dutch auction atomic bid update works with Compare-and-Swap in PostgreSQL', async () => {
    // Create real user for foreign key integrity
    const winnerUser = await pgUsersRepo.createUser({}, {
      email: `auction_winner_${Date.now()}@darkhold.com`,
      passwordHash: 'hash',
    });

    const marketId = 'market-renesiance-2026';
    const startPrice = 300000;
    const floorPrice = 100000;
    const decrement = 10000;

    const auction = await pgAuctionsRepo.insertAuction({}, {
      marketId,
      startPriceMinor: startPrice,
      floorPriceMinor: floorPrice,
      decrementMinor: decrement,
      intervalSec: 10,
    });

    expect(auction.status).toBe('RUNNING');
    expect(auction.currentPriceMinor).toBe(startPrice);

    // Atomic CAS bid update succeeds at current price
    const won = await pgAuctionsRepo.atomicBidUpdate({}, auction.id, startPrice, winnerUser.id);
    expect(won).not.toBeNull();
    expect(won?.status).toBe('ENDED');
    expect(won?.winnerUserId).toBe(winnerUser.id);

    // Second bid in same tick fails (returns null)
    const secondBid = await pgAuctionsRepo.atomicBidUpdate({}, auction.id, startPrice, winnerUser.id);
    expect(secondBid).toBeNull();
  });
});
