import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  mockStore,
  accountsRepo,
  inventoryRepo,
  tradesRepo,
  ledgerRepo,
  DEMO_MARKETS,
} from '../src/db/index.js';
import { AuctionManager, AuctionService } from '../src/auction/auction.service.js';

describe('Dutch Auction & Reconcile Integration Tests (Task B5)', () => {
  const app = createApp();
  const marketId = DEMO_MARKETS[0].id;
  let sellerToken: string;
  let sellerId: string;
  let bidderToken1: string;
  let bidderId1: string;
  let bidderToken2: string;
  let bidderId2: string;

  beforeEach(async () => {
    mockStore.reset();
    AuctionManager.getInstance().clear();

    // Seller
    const regS = await request(app).post('/auth/register').send({
      email: 'seller_auc@relicbourse.com',
      password: 'password123',
    });
    sellerId = regS.body.user.id;
    const loginS = await request(app).post('/auth/login').send({
      email: 'seller_auc@relicbourse.com',
      password: 'password123',
    });
    sellerToken = loginS.body.token;

    // Bidder 1
    const regB1 = await request(app).post('/auth/register').send({
      email: 'bidder1_auc@relicbourse.com',
      password: 'password123',
    });
    bidderId1 = regB1.body.user.id;
    const loginB1 = await request(app).post('/auth/login').send({
      email: 'bidder1_auc@relicbourse.com',
      password: 'password123',
    });
    bidderToken1 = loginB1.body.token;

    // Bidder 2
    const regB2 = await request(app).post('/auth/register').send({
      email: 'bidder2_auc@relicbourse.com',
      password: 'password123',
    });
    bidderId2 = regB2.body.user.id;
    const loginB2 = await request(app).post('/auth/login').send({
      email: 'bidder2_auc@relicbourse.com',
      password: 'password123',
    });
    bidderToken2 = loginB2.body.token;
  });

  afterEach(() => {
    AuctionManager.getInstance().clear();
  });

  it('1. decay stops at floor price and floor-end releases seller inventory reservation', async () => {
    const invBefore = await inventoryRepo.getInventory({}, sellerId, marketId);
    expect(invBefore?.reservedQty).toBe(0);

    // Create fast auction: start 200,000, floor 100,000, decrement 50,000, interval 1 sec
    const res = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        startPriceMinor: 200000,
        floorPriceMinor: 100000,
        decrementMinor: 50000,
        intervalSec: 1,
      });

    expect(res.status).toBe(201);
    const auctionId = res.body.id;

    // Inventory is reserved
    const invDuring = await inventoryRepo.getInventory({}, sellerId, marketId);
    expect(invDuring?.reservedQty).toBe(1);

    // Wait 3.5 seconds:
    // tick 1 (1s): 200,000 - 50,000 = 150,000
    // tick 2 (2s): 150,000 - 50,000 = 100,000 (floor reached!)
    // tick 3 (3s): at floor -> auction ENDED with no winner, reservation released!
    await new Promise((r) => setTimeout(r, 3500));

    const finalAuction = await AuctionService.getAuction(auctionId);
    expect(finalAuction?.status).toBe('ENDED');
    expect(finalAuction?.winnerUserId).toBeNull();
    expect(finalAuction?.currentPriceMinor).toBe(100000); // Stopped at floor!

    // Reservation must be released
    const invAfter = await inventoryRepo.getInventory({}, sellerId, marketId);
    expect(invAfter?.reservedQty).toBe(0);
  });

  it('2. two same-tick bids: exactly one wins atomically and the second gets 409', async () => {
    // Create auction
    const aucRes = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        startPriceMinor: 200000,
        floorPriceMinor: 100000,
        decrementMinor: 10000,
        intervalSec: 10,
      });

    const auctionId = aucRes.body.id;

    // Both bidders attempt to bid simultaneously on the same auction
    const [bid1, bid2] = await Promise.all([
      request(app)
        .post(`/auctions/${auctionId}/bid`)
        .set('Authorization', `Bearer ${bidderToken1}`)
        .send({}),
      request(app)
        .post(`/auctions/${auctionId}/bid`)
        .set('Authorization', `Bearer ${bidderToken2}`)
        .send({}),
    ]);

    const statuses = [bid1.status, bid2.status].sort();
    // One must succeed (200) and the other must be rejected (409)
    expect(statuses).toEqual([200, 409]);

    const winnerRes = bid1.status === 200 ? bid1 : bid2;
    const loserRes = bid1.status === 409 ? bid1 : bid2;

    expect(winnerRes.body.auction.status).toBe('ENDED');
    expect(loserRes.body.error).toMatch(/another bidder won|Auction ended/i);
  });

  it('3. insufficient-balance bid fails and changes nothing', async () => {
    // Drain bidder 1 balance
    const acc = await accountsRepo.getAccount({}, bidderId1);
    acc!.balanceMinor = 0;

    const aucRes = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        startPriceMinor: 200000,
        floorPriceMinor: 100000,
        decrementMinor: 10000,
        intervalSec: 10,
      });

    const auctionId = aucRes.body.id;

    const bidRes = await request(app)
      .post(`/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${bidderToken1}`)
      .send({});

    expect(bidRes.status).toBe(400);
    expect(bidRes.body.error).toMatch(/Insufficient balance/i);

    // Auction remains RUNNING
    const auc = await AuctionService.getAuction(auctionId);
    expect(auc?.status).toBe('RUNNING');
  });

  it('4. winning bid creates exactly one trade with balanced ledger, and GET /admin/reconcile returns ok=true', async () => {
    const aucRes = await request(app)
      .post('/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        startPriceMinor: 180000,
        floorPriceMinor: 90000,
        decrementMinor: 10000,
        intervalSec: 10,
      });

    const auctionId = aucRes.body.id;

    const bidRes = await request(app)
      .post(`/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${bidderToken1}`)
      .send({});

    expect(bidRes.status).toBe(200);
    expect(bidRes.body.trade).toBeDefined();
    expect(bidRes.body.trade.priceMinor).toBe(180000);

    // Verify trades in DB
    const trades = await tradesRepo.listTradesByMarket({}, marketId);
    expect(trades).toHaveLength(1);
    expect(trades[0].priceMinor).toBe(180000);

    // Verify ledger balance: Total debits == Total credits
    const ledger = await ledgerRepo.getLedgerTotals();
    expect(ledger.totalDebits).toBe(180000);
    expect(ledger.totalCredits).toBe(180000);
    expect(ledger.totalDebits).toBe(ledger.totalCredits);

    // Test GET /admin/reconcile route
    const reconcileRes = await request(app).get('/admin/reconcile');
    expect(reconcileRes.status).toBe(200);
    expect(reconcileRes.body.ok).toBe(true);
    expect(reconcileRes.body.totalDebits).toBe(180000);
    expect(reconcileRes.body.totalCredits).toBe(180000);
    expect(reconcileRes.body.escrowHeld).toBe(180000);
  });
});
