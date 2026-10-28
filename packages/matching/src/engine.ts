import { MatchingOrder, Fill, MatchResult } from './types.js';
import { OrderBook } from './order-book.js';

export class MatchingEngine {
  /**
   * Matches an incoming order against the resting orders in the market's OrderBook.
   *
   * MASTER Core Rules:
   * 1. Price-time priority: FIFO within a price level.
   *    Best bid = highest price, earliest seq.
   *    Best ask = lowest price, earliest seq.
   * 2. Execution price = the RESTING (maker) order's price.
   * 3. Partial fills allowed.
   * 4. Multi-level sweep across price levels.
   * 5. Self-trade prevention: resting orders belonging to the same user are skipped.
   * 6. Unfilled remainder:
   *    - LIMIT order rests on the book.
   *    - MARKET order's remainder is cancelled (never rests on the book).
   */
  public static match(incoming: MatchingOrder, book: OrderBook): MatchResult {
    const fills: Fill[] = [];
    const isBuy = incoming.side === 'BUY';

    // Work against a copy of candidates from contra side
    // Loop through contra book while incoming has unfilled quantity
    while (incoming.filledQty < incoming.qty) {
      const contraOrders = isBuy ? book.getAsks() : book.getBids();
      if (contraOrders.length === 0) {
        break;
      }

      // Find the next eligible contra order
      let matchedContra: MatchingOrder | null = null;

      for (const contra of contraOrders) {
        // Self-trade prevention: a user cannot trade against their own resting order.
        // In accordance with spec, skip own order and inspect the next resting order.
        if (contra.userId === incoming.userId) {
          continue;
        }

        // Check price crossing
        if (incoming.type === 'LIMIT') {
          if (isBuy && contra.priceMinor! > incoming.priceMinor!) {
            // Best ask is above limit buy price; cannot cross
            break;
          }
          if (!isBuy && contra.priceMinor! < incoming.priceMinor!) {
            // Best bid is below limit sell price; cannot cross
            break;
          }
        }

        matchedContra = contra;
        break;
      }

      if (!matchedContra) {
        // No matchable contra order found (either none left, price doesn't cross, or only self-orders remain)
        break;
      }

      // Execution price is strictly the RESTING (maker) order's price
      const executionPrice = matchedContra.priceMinor!;

      const incomingRemaining = incoming.qty - incoming.filledQty;
      const contraRemaining = matchedContra.qty - matchedContra.filledQty;
      const fillQty = Math.min(incomingRemaining, contraRemaining);

      incoming.filledQty += fillQty;
      matchedContra.filledQty += fillQty;

      const fill: Fill = {
        buyOrderId: isBuy ? incoming.id : matchedContra.id,
        sellOrderId: isBuy ? matchedContra.id : incoming.id,
        priceMinor: executionPrice,
        qty: fillQty,
        makerOrderId: matchedContra.id,
        takerOrderId: incoming.id,
      };
      fills.push(fill);

      if (matchedContra.filledQty >= matchedContra.qty) {
        matchedContra.status = 'FILLED';
        book.remove(matchedContra.id);
      } else {
        matchedContra.status = 'PARTIAL';
      }
    }

    const fullyFilled = incoming.filledQty >= incoming.qty;
    let restingOrder: MatchingOrder | null = null;
    let cancelledRemainderQty = 0;

    if (fullyFilled) {
      incoming.status = 'FILLED';
    } else {
      if (incoming.type === 'LIMIT') {
        incoming.status = incoming.filledQty > 0 ? 'PARTIAL' : 'OPEN';
        book.add(incoming);
        restingOrder = incoming;
      } else {
        // MARKET remainder is cancelled, never rests on the book
        cancelledRemainderQty = incoming.qty - incoming.filledQty;
        incoming.status = incoming.filledQty > 0 ? 'PARTIAL' : 'CANCELLED';
      }
    }

    return {
      fills,
      restingOrder,
      fullyFilled,
      cancelledRemainderQty,
    };
  }
}
