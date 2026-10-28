import crypto from 'crypto';
import { Auction, Trade, WsEvent, MinorUnits } from '@relicbourse/shared';
import {
  withTransaction,
  auctionsRepo,
  inventoryRepo,
  accountsRepo,
  tradesRepo,
  ledgerRepo,
  escrowRepo,
  ordersRepo,
  marketsRepo,
} from '../db/index.js';
import { broadcastMarketEvents } from '../ws/broadcast.js';
import { AppError } from '../middleware/error.js';

export interface CreateAuctionInput {
  marketId: string;
  startPriceMinor: MinorUnits;
  floorPriceMinor: MinorUnits;
  decrementMinor: MinorUnits;
  intervalSec: number;
}

export class AuctionManager {
  private static instance: AuctionManager;
  private tickers = new Map<string, NodeJS.Timeout>();
  // Maps auctionId -> sellerUserId
  private auctionSellers = new Map<string, string>();

  public static getInstance(): AuctionManager {
    if (!AuctionManager.instance) {
      AuctionManager.instance = new AuctionManager();
    }
    return AuctionManager.instance;
  }

  public registerSeller(auctionId: string, sellerId: string): void {
    this.auctionSellers.set(auctionId, sellerId);
  }

  public getSeller(auctionId: string): string | undefined {
    return this.auctionSellers.get(auctionId);
  }

  public startTicker(auction: Auction, sellerUserId: string): void {
    this.registerSeller(auction.id, sellerUserId);

    const intervalMs = auction.intervalSec * 1000;
    const ticker = setInterval(async () => {
      try {
        const current = await auctionsRepo.getAuction({}, auction.id);
        if (!current || current.status !== 'RUNNING') {
          this.stopTicker(auction.id);
          return;
        }

        if (current.currentPriceMinor <= current.floorPriceMinor) {
          // Reached floor price without bids -> ENDED, release seller reservation
          this.stopTicker(auction.id);
          await withTransaction(async (client) => {
            await auctionsRepo.endAuction(client, auction.id, null);
            await inventoryRepo.releaseInventoryReservation(
              client,
              sellerUserId,
              auction.marketId,
              1
            );
          });

          broadcastMarketEvents(auction.marketId, [
            {
              type: 'auction_ended',
              auctionId: auction.id,
              marketId: auction.marketId,
              finalPrice: current.floorPriceMinor,
              winnerUserId: null,
            },
          ]);
          return;
        }

        const nextPrice = Math.max(
          current.floorPriceMinor,
          current.currentPriceMinor - current.decrementMinor
        );

        await auctionsRepo.updateAuctionPrice({}, auction.id, nextPrice);

        broadcastMarketEvents(auction.marketId, [
          {
            type: 'auction_tick',
            auctionId: auction.id,
            marketId: auction.marketId,
            currentPrice: nextPrice,
            endsAt: current.endsAt,
          },
        ]);
      } catch (_err) {
        // Safe ticker catch
      }
    }, intervalMs);

    this.tickers.set(auction.id, ticker);
  }

  public stopTicker(auctionId: string): void {
    const ticker = this.tickers.get(auctionId);
    if (ticker) {
      clearInterval(ticker);
      this.tickers.delete(auctionId);
    }
  }

  public clear(): void {
    for (const t of this.tickers.values()) {
      clearInterval(t);
    }
    this.tickers.clear();
    this.auctionSellers.clear();
  }
}

export class AuctionService {
  /**
   * Creates a Dutch auction:
   * 1. Reserves seller inventory (1 unit).
   * 2. Inserts auction row in RUNNING state at start_price.
   * 3. Starts server-side ticker decaying price by decrement every interval_sec.
   */
  public static async createAuction(
    sellerUserId: string,
    input: CreateAuctionInput
  ): Promise<Auction> {
    const market = await marketsRepo.getMarket({}, input.marketId);
    if (!market) {
      throw new AppError('Market not found', 404);
    }

    if (input.floorPriceMinor > input.startPriceMinor) {
      throw new AppError('Floor price must be <= start price', 400);
    }

    // Reserve 1 unit of inventory from seller
    const reserved = await withTransaction(async (client) => {
      return await inventoryRepo.reserveInventory(
        client,
        sellerUserId,
        input.marketId,
        1
      );
    });

    if (!reserved) {
      throw new AppError('Insufficient inventory to create auction', 400);
    }

    const auction = await withTransaction(async (client) => {
      return await auctionsRepo.insertAuction(client, {
        marketId: input.marketId,
        startPriceMinor: input.startPriceMinor,
        floorPriceMinor: input.floorPriceMinor,
        decrementMinor: input.decrementMinor,
        intervalSec: input.intervalSec,
      });
    });

    AuctionManager.getInstance().startTicker(auction, sellerUserId);

    return auction;
  }

  /**
   * Places a winning bid on a Dutch auction:
   * 1. Check + reserve winner's funds.
   * 2. Flip auction to ENDED with winner via atomic compare-and-swap update.
   * 3. Settles through the SAME settlement path: trade + balanced ledger + escrow HELD.
   */
  public static async placeBid(
    bidderUserId: string,
    auctionId: string,
    expectedPriceMinor?: MinorUnits
  ): Promise<{ auction: Auction; trade: Trade; events: WsEvent[] }> {
    const auction = await auctionsRepo.getAuction({}, auctionId);
    if (!auction) {
      throw new AppError('Auction not found', 404);
    }
    if (auction.status !== 'RUNNING') {
      throw new AppError('Auction ended: another bidder won', 409);
    }

    const sellerUserId = AuctionManager.getInstance().getSeller(auctionId);
    if (sellerUserId && sellerUserId === bidderUserId) {
      throw new AppError('Seller cannot bid on their own auction', 400);
    }

    const currentPrice = auction.currentPriceMinor;
    if (
      typeof expectedPriceMinor === 'number' &&
      expectedPriceMinor !== currentPrice
    ) {
      throw new AppError('Auction price changed, please retry', 409);
    }

    const events: WsEvent[] = [];

    // Atomic compare-and-swap and trade settlement in ONE transaction
    const result = await withTransaction(async (client) => {
      // Reserve bidder's funds
      const reserved = await accountsRepo.reserveFunds(
        client,
        bidderUserId,
        currentPrice
      );
      if (!reserved) {
        throw new AppError('Insufficient balance to bid on auction', 400);
      }

      // Atomic CAS update: only one bidder can win at this price
      const updatedAuction = await auctionsRepo.atomicBidUpdate(
        client,
        auctionId,
        currentPrice,
        bidderUserId
      );

      if (!updatedAuction) {
        // Another bid already won in this tick! Roll back reservation
        await accountsRepo.releaseReservation(client, bidderUserId, currentPrice);
        throw new AppError('Auction ended: another bidder won', 409);
      }

      // Stop ticker
      AuctionManager.getInstance().stopTicker(auctionId);

      // Create synthetic buyer & seller orders for ledger traceability
      const buyOrder = await ordersRepo.insertOrder(client, {
        id: crypto.randomUUID(),
        userId: bidderUserId,
        marketId: auction.marketId,
        side: 'BUY',
        type: 'LIMIT',
        priceMinor: currentPrice,
        qty: 1,
        filledQty: 1,
        status: 'FILLED',
        idempotencyKey: `auction-buy-${auctionId}-${crypto.randomUUID()}`,
      });

      const actualSellerId = sellerUserId || 'SELLER_AUCTION_REPRESENTATIVE';
      const sellOrder = await ordersRepo.insertOrder(client, {
        id: crypto.randomUUID(),
        userId: actualSellerId,
        marketId: auction.marketId,
        side: 'SELL',
        type: 'LIMIT',
        priceMinor: currentPrice,
        qty: 1,
        filledQty: 1,
        status: 'FILLED',
        idempotencyKey: `auction-sell-${auctionId}-${crypto.randomUUID()}`,
      });

      // Trade record
      const trade = await tradesRepo.insertTrade(client, {
        marketId: auction.marketId,
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id,
        priceMinor: currentPrice,
        qty: 1,
      });

      // Debit buyer's reserved funds
      await accountsRepo.settleDebit(client, bidderUserId, currentPrice);

      // Escrow hold
      await escrowRepo.createHold(client, trade.id, currentPrice);

      // Balanced ledger entries: Debits == Credits strictly preserved
      await ledgerRepo.insertEntries(client, trade.id, [
        {
          accountUserId: bidderUserId,
          debitMinor: currentPrice,
          creditMinor: 0,
        },
        {
          accountUserId: 'ESCROW_SYSTEM',
          debitMinor: 0,
          creditMinor: currentPrice,
        },
      ]);

      // Move 1 unit of inventory from seller to winning bidder
      await inventoryRepo.settleInventoryMove(
        client,
        bidderUserId,
        actualSellerId,
        auction.marketId,
        1
      );

      events.push({
        type: 'auction_ended',
        auctionId: auction.id,
        marketId: auction.marketId,
        finalPrice: currentPrice,
        winnerUserId: bidderUserId,
      });

      events.push({
        type: 'trade',
        marketId: auction.marketId,
        tradeId: trade.id,
        price: trade.priceMinor,
        qty: trade.qty,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        createdAt: trade.createdAt,
      });

      return {
        auction: updatedAuction,
        trade,
      };
    });

    // Commit-then-broadcast: dispatch WS events after transaction commits
    broadcastMarketEvents(auction.marketId, events);

    return {
      auction: result.auction,
      trade: result.trade,
      events,
    };
  }

  public static async listAuctions(): Promise<Auction[]> {
    return await auctionsRepo.listAuctions();
  }

  public static async getAuction(auctionId: string): Promise<Auction | null> {
    return await auctionsRepo.getAuction({}, auctionId);
  }
}
