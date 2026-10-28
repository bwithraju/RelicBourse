import { OrderBook } from '@relicbourse/matching';

export class BookManager {
  private static instance: BookManager;
  private books = new Map<string, OrderBook>();
  private sequenceCounters = new Map<string, number>();

  public static getInstance(): BookManager {
    if (!BookManager.instance) {
      BookManager.instance = new BookManager();
    }
    return BookManager.instance;
  }

  public getBook(marketId: string): OrderBook {
    let book = this.books.get(marketId);
    if (!book) {
      book = new OrderBook(marketId);
      this.books.set(marketId, book);
    }
    return book;
  }

  public nextSeq(marketId: string): number {
    const current = this.sequenceCounters.get(marketId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(marketId, next);
    return next;
  }

  public clear(): void {
    this.books.clear();
    this.sequenceCounters.clear();
  }
}
