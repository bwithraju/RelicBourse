import { MatchingOrder, BookSnapshot, Level2Level } from './types.js';

export class OrderBook {
  public readonly marketId: string;
  private bids: MatchingOrder[] = []; // sorted price DESC, seq ASC
  private asks: MatchingOrder[] = []; // sorted price ASC, seq ASC
  private orderMap = new Map<string, MatchingOrder>();

  constructor(marketId: string) {
    this.marketId = marketId;
  }

  public getBids(): readonly MatchingOrder[] {
    return this.bids;
  }

  public getAsks(): readonly MatchingOrder[] {
    return this.asks;
  }

  public getOrder(orderId: string): MatchingOrder | null {
    return this.orderMap.get(orderId) || null;
  }

  /**
   * Adds a resting limit order to the appropriate side of the order book.
   * Price-time priority:
   * Bids: highest price first, earliest sequence first.
   * Asks: lowest price first, earliest sequence first.
   */
  public add(order: MatchingOrder): void {
    if (order.type === 'MARKET') {
      throw new Error('MARKET orders cannot rest on the order book');
    }
    if (order.priceMinor === null) {
      throw new Error('Resting order must have a valid priceMinor');
    }

    this.orderMap.set(order.id, order);

    if (order.side === 'BUY') {
      this.insertBid(order);
    } else {
      this.insertAsk(order);
    }
  }

  private insertBid(order: MatchingOrder): void {
    // Sorted: priceMinor DESC, then seq ASC
    const idx = this.bids.findIndex((existing) => {
      if (existing.priceMinor! < order.priceMinor!) return true;
      if (existing.priceMinor! === order.priceMinor! && existing.seq > order.seq) return true;
      return false;
    });

    if (idx === -1) {
      this.bids.push(order);
    } else {
      this.bids.splice(idx, 0, order);
    }
  }

  private insertAsk(order: MatchingOrder): void {
    // Sorted: priceMinor ASC, then seq ASC
    const idx = this.asks.findIndex((existing) => {
      if (existing.priceMinor! > order.priceMinor!) return true;
      if (existing.priceMinor! === order.priceMinor! && existing.seq > order.seq) return true;
      return false;
    });

    if (idx === -1) {
      this.asks.push(order);
    } else {
      this.asks.splice(idx, 0, order);
    }
  }

  /**
   * Cancels a resting order by ID.
   * Returns the cancelled order, or null if not found.
   */
  public cancel(orderId: string): MatchingOrder | null {
    const order = this.orderMap.get(orderId);
    if (!order) return null;

    this.orderMap.delete(orderId);

    if (order.side === 'BUY') {
      const idx = this.bids.findIndex((o) => o.id === orderId);
      if (idx !== -1) this.bids.splice(idx, 1);
    } else {
      const idx = this.asks.findIndex((o) => o.id === orderId);
      if (idx !== -1) this.asks.splice(idx, 1);
    }

    order.status = 'CANCELLED';
    return order;
  }

  /**
   * Removes a fully filled order from the book.
   */
  public remove(orderId: string): void {
    const order = this.orderMap.get(orderId);
    if (!order) return;
    this.orderMap.delete(orderId);

    if (order.side === 'BUY') {
      const idx = this.bids.findIndex((o) => o.id === orderId);
      if (idx !== -1) this.bids.splice(idx, 1);
    } else {
      const idx = this.asks.findIndex((o) => o.id === orderId);
      if (idx !== -1) this.asks.splice(idx, 1);
    }
  }

  /**
   * Generates Level-2 aggregated book snapshot { bids, asks }
   */
  public getSnapshot(depth = 50): BookSnapshot {
    const aggregate = (orders: MatchingOrder[]): Level2Level[] => {
      const levels: Level2Level[] = [];
      let currentLevel: Level2Level | null = null;

      for (const o of orders) {
        const remainingQty = o.qty - o.filledQty;
        if (remainingQty <= 0) continue;

        const price = o.priceMinor!;
        if (!currentLevel || currentLevel.price !== price) {
          if (currentLevel) {
            levels.push(currentLevel);
            if (levels.length >= depth) break;
          }
          currentLevel = { price, qty: remainingQty, orders: 1 };
        } else {
          currentLevel.qty += remainingQty;
          currentLevel.orders += 1;
        }
      }

      if (currentLevel && levels.length < depth) {
        levels.push(currentLevel);
      }

      return levels;
    };

    return {
      bids: aggregate(this.bids),
      asks: aggregate(this.asks),
    };
  }

  /**
   * Loads orders into the book for restart rebuild.
   */
  public load(orders: MatchingOrder[]): void {
    this.bids = [];
    this.asks = [];
    this.orderMap.clear();

    for (const o of orders) {
      if ((o.status === 'OPEN' || o.status === 'PARTIAL') && o.filledQty < o.qty && o.priceMinor !== null) {
        this.add(o);
      }
    }
  }

  public clear(): void {
    this.bids = [];
    this.asks = [];
    this.orderMap.clear();
  }
}
