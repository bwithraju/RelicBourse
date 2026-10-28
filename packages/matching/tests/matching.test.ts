import { describe, it, expect, beforeEach } from 'vitest';
import { OrderBook } from '../src/order-book.js';
import { MatchingEngine } from '../src/engine.js';
import { MatchingOrder } from '../src/types.js';

describe('Pure TypeScript Matching Engine (Task B2)', () => {
  let book: OrderBook;
  let seqCounter: number;

  beforeEach(() => {
    book = new OrderBook('market-festival-pass');
    seqCounter = 1;
  });

  const createOrder = (overrides: Partial<MatchingOrder>): MatchingOrder => {
    return {
      id: `ord-${Math.random().toString(36).substring(7)}`,
      userId: 'user-default',
      marketId: 'market-festival-pass',
      side: 'BUY',
      type: 'LIMIT',
      priceMinor: 200000,
      qty: 1,
      filledQty: 0,
      status: 'OPEN',
      seq: seqCounter++,
      ...overrides,
    };
  };

  it('1. handles incoming order against empty book', () => {
    const buy = createOrder({ side: 'BUY', priceMinor: 190000, qty: 5 });
    const result = MatchingEngine.match(buy, book);

    expect(result.fills).toHaveLength(0);
    expect(result.fullyFilled).toBe(false);
    expect(result.restingOrder).toBe(buy);
    expect(buy.status).toBe('OPEN');
    expect(book.getBids()).toHaveLength(1);
    expect(book.getBids()[0].id).toBe(buy.id);
  });

  it('2. executes exact match between bid and ask', () => {
    // Resting ask at 200,000 paise (maker)
    const ask = createOrder({
      id: 'ask-1',
      userId: 'seller-1',
      side: 'SELL',
      priceMinor: 200000,
      qty: 2,
    });
    book.add(ask);

    // Incoming bid at 200,000 paise (taker)
    const bid = createOrder({
      id: 'bid-1',
      userId: 'buyer-1',
      side: 'BUY',
      priceMinor: 200000,
      qty: 2,
    });

    const result = MatchingEngine.match(bid, book);

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]).toEqual({
      buyOrderId: 'bid-1',
      sellOrderId: 'ask-1',
      priceMinor: 200000,
      qty: 2,
      makerOrderId: 'ask-1',
      takerOrderId: 'bid-1',
    });
    expect(result.fullyFilled).toBe(true);
    expect(result.restingOrder).toBeNull();
    expect(ask.status).toBe('FILLED');
    expect(bid.status).toBe('FILLED');
    expect(book.getAsks()).toHaveLength(0);
  });

  it('3. leaves non-crossing limit orders resting on book', () => {
    const ask = createOrder({
      side: 'SELL',
      priceMinor: 210000,
      qty: 3,
    });
    book.add(ask);

    // Bid at 200,000 (below ask of 210,000)
    const bid = createOrder({
      side: 'BUY',
      priceMinor: 200000,
      qty: 2,
    });

    const result = MatchingEngine.match(bid, book);

    expect(result.fills).toHaveLength(0);
    expect(result.fullyFilled).toBe(false);
    expect(result.restingOrder).toBe(bid);
    expect(book.getAsks()).toHaveLength(1);
    expect(book.getBids()).toHaveLength(1);
  });

  it('4. enforces FIFO price-time priority (earliest seq executes first at same price)', () => {
    // Two asks at same price (200,000 paise), ask-1 has seq 1, ask-2 has seq 2
    const ask1 = createOrder({ id: 'ask-1', userId: 's1', side: 'SELL', priceMinor: 200000, qty: 1, seq: 1 });
    const ask2 = createOrder({ id: 'ask-2', userId: 's2', side: 'SELL', priceMinor: 200000, qty: 1, seq: 2 });
    book.add(ask1);
    book.add(ask2);

    // Incoming buy for 1 unit at 200,000
    const buy = createOrder({ id: 'buy-1', userId: 'b1', side: 'BUY', priceMinor: 200000, qty: 1 });
    const result = MatchingEngine.match(buy, book);

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0].makerOrderId).toBe('ask-1'); // ask1 filled first due to seq 1
    expect(ask1.status).toBe('FILLED');
    expect(ask2.status).toBe('OPEN');
    expect(book.getAsks()).toHaveLength(1);
    expect(book.getAsks()[0].id).toBe('ask-2');
  });

  it('5. handles partial fill and keeps remaining resting order open', () => {
    // Resting ask for 5 units
    const ask = createOrder({ id: 'ask-big', userId: 's1', side: 'SELL', priceMinor: 200000, qty: 5 });
    book.add(ask);

    // Incoming buy for 2 units
    const buy = createOrder({ id: 'buy-small', userId: 'b1', side: 'BUY', priceMinor: 200000, qty: 2 });
    const result = MatchingEngine.match(buy, book);

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0].qty).toBe(2);
    expect(buy.status).toBe('FILLED');
    expect(ask.status).toBe('PARTIAL');
    expect(ask.filledQty).toBe(2);
    expect(book.getAsks()).toHaveLength(1);
    expect(book.getAsks()[0].qty - book.getAsks()[0].filledQty).toBe(3);
  });

  it('6. executes multi-level sweep across multiple price levels at maker prices', () => {
    // Asks at 190,000 (qty 2), 200,000 (qty 3), 210,000 (qty 5)
    const ask1 = createOrder({ id: 'ask-1', userId: 's1', side: 'SELL', priceMinor: 190000, qty: 2, seq: 1 });
    const ask2 = createOrder({ id: 'ask-2', userId: 's2', side: 'SELL', priceMinor: 200000, qty: 3, seq: 2 });
    const ask3 = createOrder({ id: 'ask-3', userId: 's3', side: 'SELL', priceMinor: 210000, qty: 5, seq: 3 });
    book.add(ask1);
    book.add(ask2);
    book.add(ask3);

    // Incoming buy for 4 units with limit 205,000
    // Sweeps all 2 from ask1 at 190,000, then 2 from ask2 at 200,000
    const buy = createOrder({ id: 'buy-sweep', userId: 'b1', side: 'BUY', priceMinor: 205000, qty: 4 });
    const result = MatchingEngine.match(buy, book);

    expect(result.fills).toHaveLength(2);
    expect(result.fills[0]).toEqual({
      buyOrderId: 'buy-sweep',
      sellOrderId: 'ask-1',
      priceMinor: 190000, // maker price
      qty: 2,
      makerOrderId: 'ask-1',
      takerOrderId: 'buy-sweep',
    });
    expect(result.fills[1]).toEqual({
      buyOrderId: 'buy-sweep',
      sellOrderId: 'ask-2',
      priceMinor: 200000, // maker price
      qty: 2,
      makerOrderId: 'ask-2',
      takerOrderId: 'buy-sweep',
    });
    expect(result.fullyFilled).toBe(true);
    expect(ask1.status).toBe('FILLED');
    expect(ask2.status).toBe('PARTIAL');
    expect(ask2.filledQty).toBe(2);
    expect(ask3.status).toBe('OPEN');
  });

  it('7. handles market order against empty book without crashing or resting', () => {
    const marketBuy = createOrder({
      id: 'mkt-1',
      userId: 'b1',
      side: 'BUY',
      type: 'MARKET',
      priceMinor: null,
      qty: 3,
    });

    const result = MatchingEngine.match(marketBuy, book);

    expect(result.fills).toHaveLength(0);
    expect(result.fullyFilled).toBe(false);
    expect(result.restingOrder).toBeNull();
    expect(result.cancelledRemainderQty).toBe(3);
    expect(marketBuy.status).toBe('CANCELLED');
    expect(book.getBids()).toHaveLength(0);
  });

  it('8. cancels market order leftover remainder (never rests on book)', () => {
    // Only 2 asks on book at 200,000
    const ask = createOrder({ id: 'ask-1', userId: 's1', side: 'SELL', priceMinor: 200000, qty: 2 });
    book.add(ask);

    // Incoming market buy for 5 units
    const marketBuy = createOrder({
      id: 'mkt-buy',
      userId: 'b1',
      side: 'BUY',
      type: 'MARKET',
      priceMinor: null,
      qty: 5,
    });

    const result = MatchingEngine.match(marketBuy, book);

    expect(result.fills).toHaveLength(1);
    expect(result.fills[0].qty).toBe(2);
    expect(result.fullyFilled).toBe(false);
    expect(result.restingOrder).toBeNull(); // Remainder NEVER rests!
    expect(result.cancelledRemainderQty).toBe(3);
    expect(marketBuy.filledQty).toBe(2);
    expect(marketBuy.status).toBe('PARTIAL');
    expect(book.getBids()).toHaveLength(0); // Nothing rests
  });

  it('9. supports cancel on existing and non-existent orders', () => {
    const bid = createOrder({ id: 'bid-to-cancel', userId: 'b1', side: 'BUY', priceMinor: 180000, qty: 1 });
    book.add(bid);
    expect(book.getBids()).toHaveLength(1);

    const cancelled = book.cancel('bid-to-cancel');
    expect(cancelled).not.toBeNull();
    expect(cancelled?.status).toBe('CANCELLED');
    expect(book.getBids()).toHaveLength(0);

    // Cancel non-existent order
    const notFound = book.cancel('non-existent-order-id');
    expect(notFound).toBeNull();
  });

  it('10. enforces self-trade prevention by skipping user own resting orders', () => {
    // User A has resting ask at 200,000
    const ownAsk = createOrder({ id: 'own-ask', userId: 'user-alice', side: 'SELL', priceMinor: 200000, qty: 1 });
    // User B has resting ask at 200,000
    const otherAsk = createOrder({ id: 'other-ask', userId: 'user-bob', side: 'SELL', priceMinor: 200000, qty: 1 });
    book.add(ownAsk);
    book.add(otherAsk);

    // User A places a BUY limit order at 200,000
    const userABuy = createOrder({ id: 'buy-alice', userId: 'user-alice', side: 'BUY', priceMinor: 200000, qty: 1 });
    const result = MatchingEngine.match(userABuy, book);

    expect(result.fills).toHaveLength(1);
    // Must match User B's ask, NOT User A's own ask!
    expect(result.fills[0].makerOrderId).toBe('other-ask');
    expect(result.fills[0].sellOrderId).toBe('other-ask');
    expect(ownAsk.status).toBe('OPEN');
    expect(book.getAsks()).toHaveLength(1);
    expect(book.getAsks()[0].id).toBe('own-ask');
  });

  it('11. provides aggregated Level-2 snapshot and loads orders for restart recovery', () => {
    const bid1 = createOrder({ id: 'b1', userId: 'u1', side: 'BUY', priceMinor: 195000, qty: 2 });
    const bid2 = createOrder({ id: 'b2', userId: 'u2', side: 'BUY', priceMinor: 195000, qty: 3 });
    const bid3 = createOrder({ id: 'b3', userId: 'u3', side: 'BUY', priceMinor: 190000, qty: 1 });
    const ask1 = createOrder({ id: 'a1', userId: 'u4', side: 'SELL', priceMinor: 205000, qty: 4 });

    book.add(bid1);
    book.add(bid2);
    book.add(bid3);
    book.add(ask1);

    const snapshot = book.getSnapshot();
    expect(snapshot.bids).toHaveLength(2);
    expect(snapshot.bids[0]).toEqual({ price: 195000, qty: 5, orders: 2 });
    expect(snapshot.bids[1]).toEqual({ price: 190000, qty: 1, orders: 1 });
    expect(snapshot.asks).toHaveLength(1);
    expect(snapshot.asks[0]).toEqual({ price: 205000, qty: 4, orders: 1 });

    // Test reload into a new book
    const newBook = new OrderBook('market-festival-pass');
    newBook.load([bid1, bid2, bid3, ask1]);
    const reloadedSnapshot = newBook.getSnapshot();
    expect(reloadedSnapshot).toEqual(snapshot);
  });
});
