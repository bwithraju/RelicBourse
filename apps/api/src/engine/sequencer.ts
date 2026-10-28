import { AppError } from '../middleware/error.js';

interface QueueTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class MarketSequencer {
  private static instance: MarketSequencer;
  private queues = new Map<string, Array<QueueTask<any>>>();
  private processing = new Map<string, boolean>();
  private maxQueueDepth: number;

  constructor(maxQueueDepth = 200) {
    this.maxQueueDepth = maxQueueDepth;
  }

  public static getInstance(maxQueueDepth = 200): MarketSequencer {
    if (!MarketSequencer.instance) {
      MarketSequencer.instance = new MarketSequencer(maxQueueDepth);
    }
    return MarketSequencer.instance;
  }

  /**
   * Enqueues an order execution task for a specific marketId.
   * Guarantees:
   * 1. Per-market strict FIFO sequencing (one order at a time per market).
   * 2. Independent markets process in parallel.
   * 3. Bounded queue depth: rejects with 503 if overloaded to protect memory.
   */
  public enqueue<T>(marketId: string, fn: () => Promise<T>): Promise<T> {
    let queue = this.queues.get(marketId);
    if (!queue) {
      queue = [];
      this.queues.set(marketId, queue);
    }

    if (queue.length >= this.maxQueueDepth) {
      throw new AppError('Market order queue is busy, please retry', 503);
    }

    return new Promise<T>((resolve, reject) => {
      queue!.push({ fn, resolve, reject });
      this.processNext(marketId);
    });
  }

  private async processNext(marketId: string): Promise<void> {
    if (this.processing.get(marketId)) {
      return;
    }

    const queue = this.queues.get(marketId);
    if (!queue || queue.length === 0) {
      return;
    }

    this.processing.set(marketId, true);
    const task = queue.shift()!;

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (err) {
      task.reject(err);
    } finally {
      this.processing.set(marketId, false);
      // Process next in the queue
      this.processNext(marketId);
    }
  }

  public getQueueLength(marketId: string): number {
    return this.queues.get(marketId)?.length || 0;
  }

  public clear(): void {
    this.queues.clear();
    this.processing.clear();
  }
}
