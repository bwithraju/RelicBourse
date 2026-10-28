import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  mockStore,
  accountsRepo,
  inventoryRepo,
  tradesRepo,
  DEMO_MARKETS,
} from '../src/db/index.js';
import { BookManager } from '../src/engine/book-manager.js';
import { MarketSequencer } from '../src/engine/sequencer.js';

describe('Settlement & Order API Integration Tests (Task B3)', () => {
  const app = createApp();
  const marketId = DEMO_MARKETS[0].id; // 'market-festival-pass', faceValue 200,000, cap 120% -> max 240,000
  let buyerToken1: string;
  let buyerId1: string;
  let buyerToken2: string;
  let buyerId2: string;
  let sellerToken: string;
  let sellerId: string;

  beforeEach(async () => {
    mockStore.reset();
    BookManager.getInstance().clear();
    MarketSequencer.getInstance().clear();

    // Register Buyer 1
    const regB1 = await request(app).post('/auth/register').send({
      email: 'buyer1@relicbourse.com',
      password: 'password123',
    });
    buyerId1 = regB1.body.user.id;
    const loginB1 = await request(app).post('/auth/login').send({
      email: 'buyer1@relicbourse.com',
      password: 'password123',
    });
    buyerToken1 = loginB1.body.token;

    // Register Buyer 2
    const regB2 = await request(app).post('/auth/register').send({
      email: 'buyer2@relicbourse.com',
      password: 'password123',
    });
    buyerId2 = regB2.body.user.id;
    const loginB2 = await request(app).post('/auth/login').send({
      email: 'buyer2@relicbourse.com',
      password: 'password123',
    });
    buyerToken2 = loginB2.body.token;

    // Register Seller
    const regS = await request(app).post('/auth/register').send({
      email: 'seller@relicbourse.com',
      password: 'password123',
    });
    sellerId = regS.body.user.id;
    const loginS = await request(app).post('/auth/login').send({
      email: 'seller@relicbourse.com',
      password: 'password123',
    });
    sellerToken = loginS.body.token;
  });

  it('1. two buyers race the last unit (one wins)', async () => {
    // Seller posts a LIMIT SELL for 1 unit at 200,000
    const sellRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        side: 'SELL',
        type: 'LIMIT',
        price: 200000,
        qty: 1,
        idempotencyKey: 'sell-key-1',
      });
    expect(sellRes.status).toBe(201);

    // Both buyers submit MARKET BUY concurrently
    const [b1Res, b2Res] = await Promise.all([
      request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${buyerToken1}`)
        .send({
          marketId,
          side: 'BUY',
          type: 'MARKET',
          qty: 1,
          idempotencyKey: 'buy-key-b1',
        }),
      request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${buyerToken2}`)
        .send({
          marketId,
          side: 'BUY',
          type: 'MARKET',
          qty: 1,
          idempotencyKey: 'buy-key-b2',
        }),
    ]);

    // One must have won the fill, the other must have filled 0 (cancelled market remainder)
    const b1Fills = b1Res.body.fills?.length || 0;
    const b2Fills = b2Res.body.fills?.length || 0;

    expect(b1Fills + b2Fills).toBe(1);

    // Verify exactly 1 trade was created in DB
    const trades = await tradesRepo.listTradesByMarket({}, marketId);
    expect(trades).toHaveLength(1);
    expect(trades[0].qty).toBe(1);
    expect(trades[0].priceMinor).toBe(200000);
  });

  it('2. insufficient balance rejects and changes nothing', async () => {
    // Drain Buyer 1's balance by setting balance to 0
    const acc = await accountsRepo.getAccount({}, buyerId1);
    acc!.balanceMinor = 0;

    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send({
        marketId,
        side: 'BUY',
        type: 'LIMIT',
        price: 200000,
        qty: 1,
        idempotencyKey: 'insufficient-funds-key',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Insufficient balance/i);

    // Verify nothing changed
    const freshAcc = await accountsRepo.getAccount({}, buyerId1);
    expect(freshAcc?.balanceMinor).toBe(0);
    expect(freshAcc?.reservedMinor).toBe(0);
    const book = BookManager.getInstance().getBook(marketId);
    expect(book.getBids()).toHaveLength(0);
  });

  it('3. duplicate idempotency key returns stored order and creates nothing new', async () => {
    const payload = {
      marketId,
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      price: 180000,
      qty: 1,
      idempotencyKey: 'unique-idempotency-key-123',
    };

    const firstRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send(payload);

    expect(firstRes.status).toBe(201);
    const orderId = firstRes.body.order.id;

    // Submit exact same request with same idempotency key
    const duplicateRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send(payload);

    expect(duplicateRes.status).toBe(201);
    expect(duplicateRes.body.order.id).toBe(orderId);

    // Submit different payload with same key -> 409 Conflict
    const conflictingRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send({
        ...payload,
        price: 190000, // modified price
      });

    expect(conflictingRes.status).toBe(409);
    expect(conflictingRes.body.error).toMatch(/Idempotency key reused/i);
  });

  it('4. cancel releases reservation back to available balance', async () => {
    const initialAcc = await accountsRepo.getAccount({}, buyerId1);
    const startBalance = initialAcc!.balanceMinor;

    // Place LIMIT BUY for 2 units at 150,000 (total: 300,000 paise reserved)
    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send({
        marketId,
        side: 'BUY',
        type: 'LIMIT',
        price: 150000,
        qty: 2,
        idempotencyKey: 'cancel-test-key',
      });

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.order.id;

    const accAfterOrder = await accountsRepo.getAccount({}, buyerId1);
    expect(accAfterOrder!.reservedMinor).toBe(300000);
    expect(accAfterOrder!.balanceMinor).toBe(startBalance - 300000);

    // Cancel order
    const cancelRes = await request(app)
      .post(`/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken1}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // Verify funds restored
    const accAfterCancel = await accountsRepo.getAccount({}, buyerId1);
    expect(accAfterCancel!.balanceMinor).toBe(startBalance);
    expect(accAfterCancel!.reservedMinor).toBe(0);

    // Verify removed from book
    const book = BookManager.getInstance().getBook(marketId);
    expect(book.getBids()).toHaveLength(0);
  });

  it('5. forced failure mid-settlement rolls back fully', async () => {
    // Seller posts a resting limit ask
    await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        side: 'SELL',
        type: 'LIMIT',
        price: 200000,
        qty: 1,
        idempotencyKey: 'sell-key-mid-fail',
      });

    // Stub tradesRepo.insertTrade to throw a simulated database failure
    const originalInsertTrade = tradesRepo.insertTrade;
    tradesRepo.insertTrade = vi.fn().mockRejectedValue(new Error('DATABASE_DEADLOCK_SIMULATION'));

    try {
      const res = await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${buyerToken1}`)
        .send({
          marketId,
          side: 'BUY',
          type: 'LIMIT',
          price: 200000,
          qty: 1,
          idempotencyKey: 'buy-key-mid-fail',
        });

      // Internal server error due to DB rollback
      expect(res.status).toBe(500);

      // Verify no trade was created
      const trades = await tradesRepo.listTradesByMarket({}, marketId);
      expect(trades).toHaveLength(0);
    } finally {
      tradesRepo.insertTrade = originalInsertTrade;
    }
  });

  it('6. enforces anti-scalping collar cap (rejects above 120% of face value)', async () => {
    // faceValue = 200,000, capPercent = 120 -> max allowed price = 240,000 paise
    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send({
        marketId,
        side: 'BUY',
        type: 'LIMIT',
        price: 250000, // Exceeds 240,000 collar!
        qty: 1,
        idempotencyKey: 'collar-test-key',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds anti-scalping collar cap/i);
  });

  it('7. cancel-versus-execute race: cannot cancel an order that is already FILLED', async () => {
    // Seller posts limit ask for 1 unit at 200,000
    const sellRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        side: 'SELL',
        type: 'LIMIT',
        price: 200000,
        qty: 1,
        idempotencyKey: 'race-sell-key-1',
      });
    const sellOrderId = sellRes.body.order.id;

    // Buyer fills seller's order completely
    await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send({
        marketId,
        side: 'BUY',
        type: 'LIMIT',
        price: 200000,
        qty: 1,
        idempotencyKey: 'race-buy-key-1',
      });

    // Seller tries to cancel the already-filled order
    const cancelRes = await request(app)
      .post(`/orders/${sellOrderId}/cancel`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(cancelRes.status).toBe(400);
    expect(cancelRes.body.error).toMatch(/Cannot cancel order that is not open or partial/i);
  });

  it('8. server restart rebuilding the order book from open/partial orders', async () => {
    // Post two resting orders: one BUY, one SELL with non-crossing prices
    await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${buyerToken1}`)
      .send({
        marketId,
        side: 'BUY',
        type: 'LIMIT',
        price: 190000,
        qty: 3,
        idempotencyKey: 'restart-buy-key',
      });

    await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        marketId,
        side: 'SELL',
        type: 'LIMIT',
        price: 210000,
        qty: 2,
        idempotencyKey: 'restart-sell-key',
      });

    const bookBefore = BookManager.getInstance().getBook(marketId);
    const snapBefore = bookBefore.getSnapshot();
    expect(snapBefore.bids).toHaveLength(1);
    expect(snapBefore.asks).toHaveLength(1);

    // Simulate crash/restart: clear memory book
    BookManager.getInstance().clear();
    const emptySnap = BookManager.getInstance().getBook(marketId).getSnapshot();
    expect(emptySnap.bids).toHaveLength(0);
    expect(emptySnap.asks).toHaveLength(0);

    // Execute RestartRecovery
    const { RestartRecovery } = await import('../src/engine/recovery.js');
    await RestartRecovery.recover();

    // Verify order book has been fully rebuilt
    const snapAfter = BookManager.getInstance().getBook(marketId).getSnapshot();
    expect(snapAfter.bids).toEqual(snapBefore.bids);
    expect(snapAfter.asks).toEqual(snapBefore.asks);
  });
});
