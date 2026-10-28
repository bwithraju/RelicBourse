import { DbClient, AuctionsRepository } from '../contract.js';
import { Auction, MinorUnits } from '@relicbourse/shared';
import { getRunner } from '../pool.js';

export const pgAuctionsRepo: AuctionsRepository = {
  async insertAuction(
    client: DbClient,
    auction: Omit<Auction, 'id' | 'currentPriceMinor' | 'status' | 'winnerUserId' | 'endsAt'>
  ): Promise<Auction> {
    const runner = getRunner(client);
    const endsAt = new Date(Date.now() + 3600 * 1000).toISOString();
    const res = await runner.query(
      `INSERT INTO auctions (
         market_id, start_price_minor, floor_price_minor,
         decrement_minor, interval_sec, current_price_minor, status, ends_at
       )
       VALUES ($1, $2, $3, $4, $5, $2, 'RUNNING', $6)
       RETURNING id, market_id AS "marketId", start_price_minor AS "startPriceMinor",
                 floor_price_minor AS "floorPriceMinor", decrement_minor AS "decrementMinor",
                 interval_sec AS "intervalSec", current_price_minor AS "currentPriceMinor",
                 status, winner_user_id AS "winnerUserId", ends_at AS "endsAt";`,
      [
        auction.marketId,
        auction.startPriceMinor.toString(),
        auction.floorPriceMinor.toString(),
        auction.decrementMinor.toString(),
        auction.intervalSec,
        endsAt,
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      marketId: row.marketId,
      startPriceMinor: Number(row.startPriceMinor),
      floorPriceMinor: Number(row.floorPriceMinor),
      decrementMinor: Number(row.decrementMinor),
      intervalSec: Number(row.intervalSec),
      currentPriceMinor: Number(row.currentPriceMinor),
      status: row.status,
      winnerUserId: row.winnerUserId,
      endsAt: new Date(row.endsAt).toISOString(),
    };
  },

  async getAuction(client: DbClient, auctionId: string): Promise<Auction | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, market_id AS "marketId", start_price_minor AS "startPriceMinor",
              floor_price_minor AS "floorPriceMinor", decrement_minor AS "decrementMinor",
              interval_sec AS "intervalSec", current_price_minor AS "currentPriceMinor",
              status, winner_user_id AS "winnerUserId", ends_at AS "endsAt"
       FROM auctions
       WHERE id = $1;`,
      [auctionId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      marketId: row.marketId,
      startPriceMinor: Number(row.startPriceMinor),
      floorPriceMinor: Number(row.floorPriceMinor),
      decrementMinor: Number(row.decrementMinor),
      intervalSec: Number(row.intervalSec),
      currentPriceMinor: Number(row.currentPriceMinor),
      status: row.status,
      winnerUserId: row.winnerUserId,
      endsAt: new Date(row.endsAt).toISOString(),
    };
  },

  async listAuctions(client?: DbClient): Promise<Auction[]> {
    const runner = getRunner(client);
    const res = await runner.query(
      `SELECT id, market_id AS "marketId", start_price_minor AS "startPriceMinor",
              floor_price_minor AS "floorPriceMinor", decrement_minor AS "decrementMinor",
              interval_sec AS "intervalSec", current_price_minor AS "currentPriceMinor",
              status, winner_user_id AS "winnerUserId", ends_at AS "endsAt"
       FROM auctions
       ORDER BY created_at DESC;`
    );
    return res.rows.map((row: any) => ({
      id: row.id,
      marketId: row.marketId,
      startPriceMinor: Number(row.startPriceMinor),
      floorPriceMinor: Number(row.floorPriceMinor),
      decrementMinor: Number(row.decrementMinor),
      intervalSec: Number(row.intervalSec),
      currentPriceMinor: Number(row.currentPriceMinor),
      status: row.status,
      winnerUserId: row.winnerUserId,
      endsAt: new Date(row.endsAt).toISOString(),
    }));
  },

  async atomicBidUpdate(
    client: DbClient,
    auctionId: string,
    expectedPrice: MinorUnits,
    winnerId: string
  ): Promise<Auction | null> {
    const runner = getRunner(client);
    const res = await runner.query(
      `UPDATE auctions
       SET status = 'ENDED', winner_user_id = $3
       WHERE id = $1 AND status = 'RUNNING' AND current_price_minor = $2
       RETURNING id, market_id AS "marketId", start_price_minor AS "startPriceMinor",
                 floor_price_minor AS "floorPriceMinor", decrement_minor AS "decrementMinor",
                 interval_sec AS "intervalSec", current_price_minor AS "currentPriceMinor",
                 status, winner_user_id AS "winnerUserId", ends_at AS "endsAt";`,
      [auctionId, expectedPrice.toString(), winnerId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      marketId: row.marketId,
      startPriceMinor: Number(row.startPriceMinor),
      floorPriceMinor: Number(row.floorPriceMinor),
      decrementMinor: Number(row.decrementMinor),
      intervalSec: Number(row.intervalSec),
      currentPriceMinor: Number(row.currentPriceMinor),
      status: row.status,
      winnerUserId: row.winnerUserId,
      endsAt: new Date(row.endsAt).toISOString(),
    };
  },

  async updateAuctionPrice(client: DbClient, auctionId: string, currentPriceMinor: MinorUnits): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE auctions
       SET current_price_minor = $2
       WHERE id = $1 AND status = 'RUNNING';`,
      [auctionId, currentPriceMinor.toString()]
    );
  },

  async endAuction(client: DbClient, auctionId: string, winnerUserId: string | null): Promise<void> {
    const runner = getRunner(client);
    await runner.query(
      `UPDATE auctions
       SET status = 'ENDED', winner_user_id = $2
       WHERE id = $1 AND status = 'RUNNING';`,
      [auctionId, winnerUserId]
    );
  },
};
