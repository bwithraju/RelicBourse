import crypto from 'crypto';
import {
  OrderPayload,
  Order,
  Trade,
  WsEvent,
  MinorUnits,
  OrderStatus,
} from '@relicbourse/shared';
import { MatchingEngine, MatchingOrder, Fill } from '@relicbourse/matching';
import {
  withTransaction,
  marketsRepo,
  ordersRepo,
  tradesRepo,
  ledgerRepo,
  escrowRepo,
  accountsRepo,
  inventoryRepo,
} from '../db/index.js';
import { BookManager } from '../engine/book-manager.js';
import { AppError } from '../middleware/error.js';

export interface PlaceOrderResult {
  order: Order;
  fills: Fill[];
  events: WsEvent[];
}

export class OrderService {
  /**
   * Generates a stable deterministic SHA-256 hash of the order payload for idempotency checking.
   */
  private static hashRequest(payload: OrderPayload): string {
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          marketId: payload.marketId,
          side: payload.side,
          type: payload.type,
          price: payload.price ?? null,
          qty: payload.qty,
        })
      )
      .digest('hex');
  }

  /**
   * Places an order with full anti-scalping collar verification, reservation accounting,
   * in-memory matching, and atomic database settlement.
   */
  public static async placeOrder(
    userId: string,
    payload: OrderPayload
  ): Promise<PlaceOrderResult> {
    const idempotencyKey = payload.idempotencyKey;
    const requestHash = this.hashRequest(payload);

    // 1. Idempotency Check
    const stored = await withTransaction(async (client) => {
      return await ordersRepo.getIdempotentResponse(client, idempotencyKey);
    });

    if (stored) {
      if (stored.requestHash !== requestHash) {
        throw new AppError(
          'Idempotency key reused with different request parameters',
          409
        );
      }
      return stored.storedResponse as PlaceOrderResult;
    }

    // 2. Market and Collar Verification
    const market = await withTransaction(async (client) => {
      return await marketsRepo.getMarket(client, payload.marketId);
    });

    if (!market) {
      throw new AppError('Market not found', 404);
    }

    // Anti-scalping collar rule:
    // a LIMIT sell/buy price above market.face_value * cap_percent / 100 is REJECTED
    if (payload.type === 'LIMIT') {
      const maxCollarPrice = Math.floor(
        (market.faceValueMinor * market.capPercent) / 100
      );
      if (payload.price! > maxCollarPrice) {
        throw new AppError(
          `Price ${payload.price} exceeds anti-scalping collar cap (${maxCollarPrice})`,
          400
        );
      }
    }

    const bookManager = BookManager.getInstance();
    const book = bookManager.getBook(payload.marketId);

    // 3. Reservation Accounting
    let reservedFunds: MinorUnits = 0;
    if (payload.side === 'BUY') {
      if (payload.type === 'LIMIT') {
        reservedFunds = payload.price! * payload.qty;
      } else {
        // Market BUY: reserve funds based on current best ask
        const bestAsks = book.getAsks();
        if (bestAsks.length === 0) {
          throw new AppError('Cannot execute market order on empty book', 400);
        }
        reservedFunds = bestAsks[0].priceMinor! * payload.qty;
      }

      const reserved = await withTransaction(async (client) => {
        return await accountsRepo.reserveFunds(client, userId, reservedFunds);
      });

      if (!reserved) {
        throw new AppError('Insufficient balance to reserve funds for order', 400);
      }
    } else {
      // SELL: reserve inventory
      const reserved = await withTransaction(async (client) => {
        return await inventoryRepo.reserveInventory(
          client,
          userId,
          payload.marketId,
          payload.qty
        );
      });

      if (!reserved) {
        throw new AppError('Insufficient inventory to reserve for order', 400);
      }
    }

    // 4. In-Memory Matching
    const orderId = crypto.randomUUID();
    const seq = bookManager.nextSeq(payload.marketId);

    const incoming: MatchingOrder = {
      id: orderId,
      userId,
      marketId: payload.marketId,
      side: payload.side,
      type: payload.type,
      priceMinor: payload.type === 'LIMIT' ? payload.price! : null,
      qty: payload.qty,
      filledQty: 0,
      status: 'OPEN',
      seq,
    };

    const matchResult = MatchingEngine.match(incoming, book);

    // 5. Atomic Settlement in ONE PostgreSQL transaction
    let settledOrder: Order;
    const events: WsEvent[] = [];

    try {
      settledOrder = await withTransaction(async (client) => {
        // A. Insert the incoming order
        const savedOrder = await ordersRepo.insertOrder(client, {
          id: incoming.id,
          userId: incoming.userId,
          marketId: incoming.marketId,
          side: incoming.side,
          type: incoming.type,
          priceMinor: incoming.priceMinor,
          qty: incoming.qty,
          filledQty: incoming.filledQty,
          status: incoming.status,
          idempotencyKey,
        });

        let totalSpent: MinorUnits = 0;

        // B. Process each fill atomically
        for (const fill of matchResult.fills) {
          const tradeAmount = fill.priceMinor * fill.qty;
          totalSpent += tradeAmount;

          const contraOrderId = fill.makerOrderId;
          const contraOrder = await ordersRepo.getOrder(client, contraOrderId);
          if (contraOrder) {
            const contraFilledQty = contraOrder.filledQty + fill.qty;
            const contraStatus: OrderStatus =
              contraFilledQty >= contraOrder.qty ? 'FILLED' : 'PARTIAL';

            await ordersRepo.updateOrderFill(
              client,
              contraOrderId,
              contraFilledQty,
              contraStatus
            );

            events.push({
              type: 'order_update',
              orderId: contraOrder.id,
              userId: contraOrder.userId,
              marketId: contraOrder.marketId,
              side: contraOrder.side,
              price: contraOrder.priceMinor,
              qty: contraOrder.qty,
              filledQty: contraFilledQty,
              status: contraStatus,
            });
          }

          // Insert trade record
          const trade = await tradesRepo.insertTrade(client, {
            marketId: payload.marketId,
            buyOrderId: fill.buyOrderId,
            sellOrderId: fill.sellOrderId,
            priceMinor: fill.priceMinor,
            qty: fill.qty,
          });

          // Core Rule 12: Buyer's payment is held in escrow_holds
          await escrowRepo.createHold(client, trade.id, tradeAmount);

          // Find buyer and seller userIds
          const isIncomingBuyer = payload.side === 'BUY';
          const buyerUserId = isIncomingBuyer ? userId : contraOrder!.userId;
          const sellerUserId = isIncomingBuyer ? contraOrder!.userId : userId;

          // Settle buyer's reserved debit
          await accountsRepo.settleDebit(client, buyerUserId, tradeAmount);

          // Double-entry ledger entries:
          // Debit buyer account, credit system escrow account
          // Debits == Credits guaranteed
          await ledgerRepo.insertEntries(client, trade.id, [
            {
              accountUserId: buyerUserId,
              debitMinor: tradeAmount,
              creditMinor: 0,
            },
            {
              accountUserId: 'ESCROW_SYSTEM',
              debitMinor: 0,
              creditMinor: tradeAmount,
            },
          ]);

          // Move inventory from seller to buyer
          await inventoryRepo.settleInventoryMove(
            client,
            buyerUserId,
            sellerUserId,
            payload.marketId,
            fill.qty
          );

          events.push({
            type: 'trade',
            marketId: payload.marketId,
            tradeId: trade.id,
            price: trade.priceMinor,
            qty: trade.qty,
            buyOrderId: trade.buyOrderId,
            sellOrderId: trade.sellOrderId,
            createdAt: trade.createdAt,
          });
        }

        // C. Release unused reservations:
        // For a resting LIMIT order, the unfilled remainder's funds MUST remain reserved.
        // We only release:
        // 1) Price improvement surplus on fills (if limitPrice > executed makerPrice)
        // 2) Unfilled remainder reservation for MARKET orders (which are cancelled immediately)
        if (payload.side === 'BUY') {
          let surplusToRelease: MinorUnits = 0;

          // 1) Price improvement refund
          if (payload.type === 'LIMIT') {
            for (const fill of matchResult.fills) {
              if (payload.price! > fill.priceMinor) {
                surplusToRelease += (payload.price! - fill.priceMinor) * fill.qty;
              }
            }
          }

          // 2) Market order cancelled remainder refund
          if (matchResult.cancelledRemainderQty > 0) {
            const reservedUnitCost = payload.type === 'LIMIT' ? payload.price! : (reservedFunds / payload.qty);
            surplusToRelease += matchResult.cancelledRemainderQty * reservedUnitCost;
          }

          if (surplusToRelease > 0) {
            await accountsRepo.releaseReservation(client, userId, surplusToRelease);
          }
        } else {
          // For SELL orders, release inventory reservation for any cancelled market order remainder
          if (matchResult.cancelledRemainderQty > 0) {
            await inventoryRepo.releaseInventoryReservation(
              client,
              userId,
              payload.marketId,
              matchResult.cancelledRemainderQty
            );
          }
        }

        return savedOrder;
      });
    } catch (settleError) {
      // If settlement transaction rolls back, undo in-memory book changes
      if (matchResult.restingOrder) {
        book.cancel(incoming.id);
      }
      // Re-release reservations if transaction failed
      if (payload.side === 'BUY') {
        await withTransaction(async (client) => {
          await accountsRepo.releaseReservation(client, userId, reservedFunds);
        });
      } else {
        await withTransaction(async (client) => {
          await inventoryRepo.releaseInventoryReservation(
            client,
            userId,
            payload.marketId,
            payload.qty
          );
        });
      }
      throw settleError;
    }

    // Add order_update for incoming order
    events.push({
      type: 'order_update',
      orderId: settledOrder.id,
      userId: settledOrder.userId,
      marketId: settledOrder.marketId,
      side: settledOrder.side,
      price: settledOrder.priceMinor,
      qty: settledOrder.qty,
      filledQty: settledOrder.filledQty,
      status: settledOrder.status,
    });

    // Add depth_delta (snapshot) event
    const snapshot = book.getSnapshot();
    events.push({
      type: 'depth_delta',
      marketId: payload.marketId,
      bids: snapshot.bids,
      asks: snapshot.asks,
    });

    const result: PlaceOrderResult = {
      order: settledOrder,
      fills: matchResult.fills,
      events,
    };

    // Store idempotency response
    await withTransaction(async (client) => {
      await ordersRepo.storeIdempotentResponse(
        client,
        idempotencyKey,
        userId,
        requestHash,
        result
      );
    });

    return result;
  }

  /**
   * Cancels an open or partially filled order. Owner only.
   * Releases remaining reserved funds or inventory in ONE transaction.
   */
  public static async cancelOrder(
    userId: string,
    orderId: string
  ): Promise<{ order: Order; events: WsEvent[] }> {
    const bookManager = BookManager.getInstance();

    const result = await withTransaction(async (client) => {
      const order = await ordersRepo.getOrder(client, orderId);
      if (!order) {
        throw new AppError('Order not found', 404);
      }
      if (order.userId !== userId) {
        throw new AppError('Forbidden: you can only cancel your own orders', 403);
      }
      if (order.status !== 'OPEN' && order.status !== 'PARTIAL') {
        throw new AppError('Cannot cancel order that is not open or partial', 400);
      }

      const book = bookManager.getBook(order.marketId);
      book.cancel(orderId);

      const remainingQty = order.qty - order.filledQty;

      // Update DB order status
      await ordersRepo.updateOrderFill(
        client,
        orderId,
        order.filledQty,
        'CANCELLED'
      );
      order.status = 'CANCELLED';

      // Release reserved resources
      if (order.side === 'BUY' && order.priceMinor !== null) {
        const refundAmount = remainingQty * order.priceMinor;
        await accountsRepo.releaseReservation(client, userId, refundAmount);
      } else if (order.side === 'SELL') {
        await inventoryRepo.releaseInventoryReservation(
          client,
          userId,
          order.marketId,
          remainingQty
        );
      }

      const events: WsEvent[] = [
        {
          type: 'order_update',
          orderId: order.id,
          userId: order.userId,
          marketId: order.marketId,
          side: order.side,
          price: order.priceMinor,
          qty: order.qty,
          filledQty: order.filledQty,
          status: 'CANCELLED',
        },
        {
          type: 'depth_delta',
          marketId: order.marketId,
          bids: book.getSnapshot().bids,
          asks: book.getSnapshot().asks,
        },
      ];

      return { order, events };
    });

    return result;
  }

  /**
   * Confirms delivery of a trade. Buyer only.
   * Escrow Accounting Identity:
   * 1. Escrow hold transitions HELD -> RELEASED.
   * 2. Seller balance credited by tradeAmount (paise).
   * 3. Balanced double-entry ledger entries:
   *    Debit ESCROW_SYSTEM by tradeAmount, Credit Seller by tradeAmount.
   *    Total debits == Total credits strictly preserved.
   */
  public static async confirmDelivery(
    userId: string,
    tradeId: string
  ): Promise<{ tradeId: string; status: string; events: WsEvent[] }> {
    return await withTransaction(async (client) => {
      const trade = await tradesRepo.getTrade(client, tradeId);
      if (!trade) {
        throw new AppError('Trade not found', 404);
      }

      const buyOrder = await ordersRepo.getOrder(client, trade.buyOrderId);
      if (!buyOrder || buyOrder.userId !== userId) {
        throw new AppError('Forbidden: only the buyer can confirm delivery', 403);
      }

      const sellOrder = await ordersRepo.getOrder(client, trade.sellOrderId);
      if (!sellOrder) {
        throw new AppError('Sell order for trade not found', 500);
      }

      const tradeAmount = trade.priceMinor * trade.qty;

      // Release escrow
      await escrowRepo.releaseHold(client, tradeId);

      // Credit seller
      await accountsRepo.settleCredit(client, sellOrder.userId, tradeAmount);

      // Balanced ledger entries for escrow settlement
      await ledgerRepo.insertEntries(client, tradeId, [
        {
          accountUserId: 'ESCROW_SYSTEM',
          debitMinor: tradeAmount,
          creditMinor: 0,
        },
        {
          accountUserId: sellOrder.userId,
          debitMinor: 0,
          creditMinor: tradeAmount,
        },
      ]);

      const events: WsEvent[] = [
        {
          type: 'escrow_update',
          tradeId,
          status: 'RELEASED',
        },
      ];

      return {
        tradeId,
        status: 'RELEASED',
        events,
      };
    });
  }
}
