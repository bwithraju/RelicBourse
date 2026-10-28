import { getAllOpenOrdersGroupedByMarket } from '../db/index.js';
import { BookManager } from './book-manager.js';
import { MatchingOrder } from '@relicbourse/matching';

export class RestartRecovery {
  /**
   * Rebuilds in-memory order books for all markets from open/partial orders in PostgreSQL.
   */
  public static async recover(): Promise<void> {
    const grouped = await getAllOpenOrdersGroupedByMarket();
    const bookManager = BookManager.getInstance();

    for (const [marketId, orders] of Object.entries(grouped)) {
      const book = bookManager.getBook(marketId);
      const matchingOrders: MatchingOrder[] = orders.map((o, idx) => ({
        id: o.id,
        userId: o.userId,
        marketId: o.marketId,
        side: o.side,
        type: o.type,
        priceMinor: o.priceMinor,
        qty: o.qty,
        filledQty: o.filledQty,
        status: o.status,
        seq: idx + 1,
      }));

      book.load(matchingOrders);
    }
  }
}
