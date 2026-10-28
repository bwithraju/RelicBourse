import {
  User,
  Account,
  Inventory,
  Order,
  Trade,
  LedgerEntry,
  EscrowHold,
  Auction,
  MinorUnits,
  OrderStatus,
  OrderSide,
  OrderType,
  EscrowStatus,
  AuctionStatus,
} from '@relicbourse/shared';

export interface DbClient {
  // Opaque handle for pg.PoolClient / transaction runner
  query?: (...args: any[]) => Promise<any>;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface UsersRepository {
  createUser(client: DbClient, params: { email: string; passwordHash: string }): Promise<User>;
  findByEmail(client: DbClient, email: string): Promise<User | null>;
  findById(client: DbClient, id: string): Promise<User | null>;
  updatePassword(client: DbClient, userId: string, newPasswordHash: string): Promise<void>;
  createPasswordResetToken(client: DbClient, userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findValidResetToken(client: DbClient, tokenHash: string): Promise<PasswordResetRecord | null>;
  markResetTokenUsed(client: DbClient, tokenId: string): Promise<void>;
}

export interface AccountsRepository {
  createAccount(client: DbClient, userId: string, initialBalanceMinor: MinorUnits): Promise<Account>;
  getAccount(client: DbClient, userId: string): Promise<Account | null>;
  reserveFunds(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<boolean>;
  releaseReservation(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void>;
  settleDebit(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void>;
  settleCredit(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void>;
  lockAccount(client: DbClient, userId: string): Promise<Account | null>;
}

export interface InventoryRepository {
  seedInventory(client: DbClient, userId: string, marketId: string, quantity: number): Promise<void>;
  getInventory(client: DbClient, userId: string, marketId: string): Promise<Inventory | null>;
  listInventoryByUser(client: DbClient, userId: string): Promise<Inventory[]>;
  reserveInventory(client: DbClient, userId: string, marketId: string, qty: number): Promise<boolean>;
  releaseInventoryReservation(client: DbClient, userId: string, marketId: string, qty: number): Promise<void>;
  settleInventoryMove(client: DbClient, buyerId: string, sellerId: string, marketId: string, qty: number): Promise<void>;
}

export interface MarketsRepository {
  listMarkets(client?: DbClient): Promise<any[]>;
  getMarket(client: DbClient, marketId: string): Promise<any | null>;
  getOpenOrdersForBook(client: DbClient, marketId: string): Promise<Order[]>;
}

export interface OrdersRepository {
  insertOrder(client: DbClient, order: Omit<Order, 'createdAt'>): Promise<Order>;
  updateOrderFill(client: DbClient, orderId: string, filledQty: number, status: OrderStatus): Promise<void>;
  getOrder(client: DbClient, orderId: string): Promise<Order | null>;
  listOrdersByUser(client: DbClient, userId: string): Promise<Order[]>;
  storeIdempotentResponse(client: DbClient, key: string, userId: string, requestHash: string, storedResponse: any): Promise<void>;
  getIdempotentResponse(client: DbClient, key: string): Promise<{ storedResponse: any; requestHash: string } | null>;
}

export interface TradesRepository {
  insertTrade(client: DbClient, trade: Omit<Trade, 'id' | 'createdAt'>): Promise<Trade>;
  listTradesByMarket(client: DbClient, marketId: string, limit?: number): Promise<Trade[]>;
  getTrade(client: DbClient, tradeId: string): Promise<Trade | null>;
}

export interface LedgerRepository {
  insertEntries(client: DbClient, tradeId: string, entries: Array<{ accountUserId: string; debitMinor: MinorUnits; creditMinor: MinorUnits }>): Promise<void>;
  getLedgerTotals(client?: DbClient): Promise<{ totalDebits: MinorUnits; totalCredits: MinorUnits }>;
}

export interface EscrowRepository {
  createHold(client: DbClient, tradeId: string, amountMinor: MinorUnits): Promise<EscrowHold>;
  releaseHold(client: DbClient, tradeId: string): Promise<void>;
  refundHold(client: DbClient, tradeId: string): Promise<void>;
  listHoldsByUser(client: DbClient, userId: string): Promise<EscrowHold[]>;
}

export interface AuctionsRepository {
  insertAuction(client: DbClient, auction: Omit<Auction, 'id' | 'currentPriceMinor' | 'status' | 'winnerUserId' | 'endsAt'>): Promise<Auction>;
  getAuction(client: DbClient, auctionId: string): Promise<Auction | null>;
  listAuctions(client?: DbClient): Promise<Auction[]>;
  atomicBidUpdate(client: DbClient, auctionId: string, expectedPrice: MinorUnits, winnerId: string): Promise<Auction | null>;
  updateAuctionPrice(client: DbClient, auctionId: string, currentPriceMinor: MinorUnits): Promise<void>;
  endAuction(client: DbClient, auctionId: string, winnerUserId: string | null): Promise<void>;
}
