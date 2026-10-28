import {
  DbClient,
  UsersRepository,
  AccountsRepository,
  InventoryRepository,
  MarketsRepository,
  OrdersRepository,
  TradesRepository,
  LedgerRepository,
  EscrowRepository,
  AuctionsRepository,
} from './contract.js';
import {
  User,
  Account,
  Inventory,
  Order,
  Trade,
  EscrowHold,
  Auction,
  MinorUnits,
  Market,
  OrderStatus,
} from '@relicbourse/shared';
import crypto from 'crypto';

import { pool, withTransaction as pgWithTransaction } from './pool.js';
import { pgUsersRepo } from './repositories/users.repo.js';
import { pgAccountsRepo } from './repositories/accounts.repo.js';
import { pgInventoryRepo } from './repositories/inventory.repo.js';
import { pgMarketsRepo } from './repositories/markets.repo.js';
import { pgOrdersRepo } from './repositories/orders.repo.js';
import { pgTradesRepo } from './repositories/trades.repo.js';
import { pgLedgerRepo } from './repositories/ledger.repo.js';
import { pgEscrowRepo } from './repositories/escrow.repo.js';
import { pgAuctionsRepo } from './repositories/auctions.repo.js';
import { reconcileDb as pgReconcileDb } from './reconcile.js';
import { getAllOpenOrdersGroupedByMarket as pgGetAllOpenOrdersGroupedByMarket } from './recovery.js';

export * from './contract.js';
export * from './pool.js';
export * from './migrate.js';
export * from './seed.js';
export * from './reconcile.js';
export * from './recovery.js';

export const DEMO_MARKETS: Market[] = [
  {
    id: 'market-culrav-2026',
    name: 'Culrav 2026',
    faceValueMinor: 200000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-renesiance-2026',
    name: 'Renesiance 2026',
    faceValueMinor: 150000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-avishkar-2026',
    name: 'Avishkar 2026',
    faceValueMinor: 250000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-rangtaadi-2026',
    name: 'Rangtaadi 2026',
    faceValueMinor: 100000,
    capPercent: 120,
    status: 'ACTIVE',
  },
];

// In-memory data store for standalone testing / mock fallback
export class MockDbStore {
  public users = new Map<string, User>();
  public accounts = new Map<string, Account>();
  public inventory = new Map<string, Inventory>(); // key: `${userId}:${marketId}`
  public orders = new Map<string, Order>();
  public trades = new Map<string, Trade>();
  public ledgerEntries: Array<{
    id: string;
    tradeId: string;
    accountUserId: string;
    debitMinor: MinorUnits;
    creditMinor: MinorUnits;
    createdAt: string;
  }> = [];
  public escrowHolds = new Map<string, EscrowHold>(); // key: tradeId
  public auctions = new Map<string, Auction>();
  public idempotency = new Map<
    string,
    { userId: string; requestHash: string; storedResponse: any; createdAt: string }
  >();

  public reset() {
    this.users.clear();
    this.accounts.clear();
    this.inventory.clear();
    this.orders.clear();
    this.trades.clear();
    this.ledgerEntries = [];
    this.escrowHolds.clear();
    this.auctions.clear();
    this.idempotency.clear();
  }
}

export const mockStore = new MockDbStore();

function shouldUsePg(client?: DbClient): boolean {
  if (client && typeof (client as any).query === 'function') {
    return true;
  }
  return process.env.USE_REAL_DB === 'true';
}

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  if (process.env.USE_REAL_DB === 'true') {
    return await pgWithTransaction(fn as any);
  }
  const dummyClient: DbClient = {};
  return await fn(dummyClient);
}

export async function seedNewUserData(client: DbClient, userId: string): Promise<void> {
  if (shouldUsePg(client)) {
    await pgAccountsRepo.createAccount(client, userId, 10000000);
    for (const market of DEMO_MARKETS) {
      await pgInventoryRepo.seedInventory(client, userId, market.id, 2);
    }
    return;
  }
  await accountsRepo.createAccount(client, userId, 10000000);
  for (const market of DEMO_MARKETS) {
    await inventoryRepo.seedInventory(client, userId, market.id, 2);
  }
}

export const usersRepo: UsersRepository = {
  async createUser(client: DbClient, params: { email: string; passwordHash: string }): Promise<User> {
    if (shouldUsePg(client)) {
      return await pgUsersRepo.createUser(client, params);
    }
    for (const u of mockStore.users.values()) {
      if (u.email.toLowerCase() === params.email.toLowerCase()) {
        const error = new Error('duplicate key value violates unique constraint "users_email_key"');
        (error as any).code = '23505';
        throw error;
      }
    }
    const user: User = {
      id: crypto.randomUUID(),
      email: params.email.toLowerCase(),
      passwordHash: params.passwordHash,
      createdAt: new Date().toISOString(),
    };
    mockStore.users.set(user.id, user);
    return user;
  },

  async findByEmail(client: DbClient, email: string): Promise<User | null> {
    if (shouldUsePg(client)) {
      return await pgUsersRepo.findByEmail(client, email);
    }
    for (const u of mockStore.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return null;
  },

  async findById(client: DbClient, id: string): Promise<User | null> {
    if (shouldUsePg(client)) {
      return await pgUsersRepo.findById(client, id);
    }
    return mockStore.users.get(id) || null;
  },
};

export const accountsRepo: AccountsRepository = {
  async createAccount(client: DbClient, userId: string, initialBalanceMinor: MinorUnits): Promise<Account> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.createAccount(client, userId, initialBalanceMinor);
    }
    const acc: Account = {
      userId,
      balanceMinor: initialBalanceMinor,
      reservedMinor: 0,
    };
    mockStore.accounts.set(userId, acc);
    return acc;
  },

  async getAccount(client: DbClient, userId: string): Promise<Account | null> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.getAccount(client, userId);
    }
    return mockStore.accounts.get(userId) || null;
  },

  async reserveFunds(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<boolean> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.reserveFunds(client, userId, amountMinor);
    }
    const acc = mockStore.accounts.get(userId);
    if (!acc || acc.balanceMinor < amountMinor) {
      return false;
    }
    acc.balanceMinor -= amountMinor;
    acc.reservedMinor += amountMinor;
    return true;
  },

  async releaseReservation(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.releaseReservation(client, userId, amountMinor);
    }
    const acc = mockStore.accounts.get(userId);
    if (acc) {
      acc.reservedMinor -= amountMinor;
      acc.balanceMinor += amountMinor;
    }
  },

  async settleDebit(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.settleDebit(client, userId, amountMinor);
    }
    const acc = mockStore.accounts.get(userId);
    if (acc) {
      acc.reservedMinor -= amountMinor;
    }
  },

  async settleCredit(client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.settleCredit(client, userId, amountMinor);
    }
    const acc = mockStore.accounts.get(userId);
    if (acc) {
      acc.balanceMinor += amountMinor;
    }
  },

  async lockAccount(client: DbClient, userId: string): Promise<Account | null> {
    if (shouldUsePg(client)) {
      return await pgAccountsRepo.lockAccount(client, userId);
    }
    return mockStore.accounts.get(userId) || null;
  },
};

export const inventoryRepo: InventoryRepository = {
  async seedInventory(client: DbClient, userId: string, marketId: string, quantity: number): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgInventoryRepo.seedInventory(client, userId, marketId, quantity);
    }
    const key = `${userId}:${marketId}`;
    mockStore.inventory.set(key, {
      userId,
      marketId,
      quantity,
      reservedQty: 0,
    });
  },

  async getInventory(client: DbClient, userId: string, marketId: string): Promise<Inventory | null> {
    if (shouldUsePg(client)) {
      return await pgInventoryRepo.getInventory(client, userId, marketId);
    }
    return mockStore.inventory.get(`${userId}:${marketId}`) || null;
  },

  async listInventoryByUser(client: DbClient, userId: string): Promise<Inventory[]> {
    if (shouldUsePg(client)) {
      return await pgInventoryRepo.listInventoryByUser(client, userId);
    }
    const list: Inventory[] = [];
    for (const inv of mockStore.inventory.values()) {
      if (inv.userId === userId) {
        list.push({ ...inv });
      }
    }
    return list;
  },

  async reserveInventory(client: DbClient, userId: string, marketId: string, qty: number): Promise<boolean> {
    if (shouldUsePg(client)) {
      return await pgInventoryRepo.reserveInventory(client, userId, marketId, qty);
    }
    const inv = mockStore.inventory.get(`${userId}:${marketId}`);
    if (!inv || inv.quantity - inv.reservedQty < qty) {
      return false;
    }
    inv.reservedQty += qty;
    return true;
  },

  async releaseInventoryReservation(client: DbClient, userId: string, marketId: string, qty: number): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgInventoryRepo.releaseInventoryReservation(client, userId, marketId, qty);
    }
    const inv = mockStore.inventory.get(`${userId}:${marketId}`);
    if (inv) {
      inv.reservedQty -= qty;
    }
  },

  async settleInventoryMove(
    client: DbClient,
    buyerId: string,
    sellerId: string,
    marketId: string,
    qty: number
  ): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgInventoryRepo.settleInventoryMove(client, buyerId, sellerId, marketId, qty);
    }
    const sellerInv = mockStore.inventory.get(`${sellerId}:${marketId}`);
    if (sellerInv) {
      sellerInv.quantity -= qty;
      sellerInv.reservedQty -= qty;
    }
    const buyerKey = `${buyerId}:${marketId}`;
    const buyerInv = mockStore.inventory.get(buyerKey);
    if (buyerInv) {
      buyerInv.quantity += qty;
    } else {
      mockStore.inventory.set(buyerKey, {
        userId: buyerId,
        marketId,
        quantity: qty,
        reservedQty: 0,
      });
    }
  },
};

export const marketsRepo: MarketsRepository = {
  async listMarkets(client?: DbClient): Promise<any[]> {
    if (shouldUsePg(client)) {
      return await pgMarketsRepo.listMarkets(client);
    }
    return DEMO_MARKETS;
  },

  async getMarket(client: DbClient, marketId: string): Promise<any | null> {
    if (shouldUsePg(client)) {
      return await pgMarketsRepo.getMarket(client, marketId);
    }
    return DEMO_MARKETS.find((m) => m.id === marketId) || (marketId === 'market-festival-pass' ? DEMO_MARKETS[0] : null);
  },

  async getOpenOrdersForBook(client: DbClient, marketId: string): Promise<Order[]> {
    if (shouldUsePg(client)) {
      return await pgMarketsRepo.getOpenOrdersForBook(client, marketId);
    }
    const list: Order[] = [];
    for (const o of mockStore.orders.values()) {
      if (o.marketId === marketId && (o.status === 'OPEN' || o.status === 'PARTIAL')) {
        list.push({ ...o });
      }
    }
    return list;
  },
};

export const ordersRepo: OrdersRepository = {
  async insertOrder(client: DbClient, order: Omit<Order, 'createdAt'>): Promise<Order> {
    if (shouldUsePg(client)) {
      return await pgOrdersRepo.insertOrder(client, order);
    }
    const fullOrder: Order = {
      ...order,
      createdAt: new Date().toISOString(),
    };
    mockStore.orders.set(order.id, fullOrder);
    return fullOrder;
  },

  async updateOrderFill(
    client: DbClient,
    orderId: string,
    filledQty: number,
    status: OrderStatus
  ): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgOrdersRepo.updateOrderFill(client, orderId, filledQty, status);
    }
    const ord = mockStore.orders.get(orderId);
    if (ord) {
      ord.filledQty = filledQty;
      ord.status = status;
    }
  },

  async getOrder(client: DbClient, orderId: string): Promise<Order | null> {
    if (shouldUsePg(client)) {
      return await pgOrdersRepo.getOrder(client, orderId);
    }
    const ord = mockStore.orders.get(orderId);
    return ord ? { ...ord } : null;
  },

  async listOrdersByUser(client: DbClient, userId: string): Promise<Order[]> {
    if (shouldUsePg(client)) {
      return await pgOrdersRepo.listOrdersByUser(client, userId);
    }
    const list: Order[] = [];
    for (const o of mockStore.orders.values()) {
      if (o.userId === userId) {
        list.push({ ...o });
      }
    }
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async storeIdempotentResponse(
    client: DbClient,
    key: string,
    userId: string,
    requestHash: string,
    storedResponse: any
  ): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgOrdersRepo.storeIdempotentResponse(client, key, userId, requestHash, storedResponse);
    }
    mockStore.idempotency.set(key, {
      userId,
      requestHash,
      storedResponse,
      createdAt: new Date().toISOString(),
    });
  },

  async getIdempotentResponse(
    client: DbClient,
    key: string
  ): Promise<{ storedResponse: any; requestHash: string } | null> {
    if (shouldUsePg(client)) {
      return await pgOrdersRepo.getIdempotentResponse(client, key);
    }
    const val = mockStore.idempotency.get(key);
    if (!val) return null;
    return {
      storedResponse: val.storedResponse,
      requestHash: val.requestHash,
    };
  },
};

export const tradesRepo: TradesRepository = {
  async insertTrade(client: DbClient, trade: Omit<Trade, 'id' | 'createdAt'>): Promise<Trade> {
    if (shouldUsePg(client)) {
      return await pgTradesRepo.insertTrade(client, trade);
    }
    const saved: Trade = {
      ...trade,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    mockStore.trades.set(saved.id, saved);
    return saved;
  },

  async listTradesByMarket(client: DbClient, marketId: string, limit = 50): Promise<Trade[]> {
    if (shouldUsePg(client)) {
      return await pgTradesRepo.listTradesByMarket(client, marketId, limit);
    }
    const list: Trade[] = [];
    for (const t of mockStore.trades.values()) {
      if (t.marketId === marketId) {
        list.push({ ...t });
      }
    }
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
  },

  async getTrade(client: DbClient, tradeId: string): Promise<Trade | null> {
    if (shouldUsePg(client)) {
      return await pgTradesRepo.getTrade(client, tradeId);
    }
    return mockStore.trades.get(tradeId) || null;
  },
};

export const ledgerRepo: LedgerRepository = {
  async insertEntries(
    client: DbClient,
    tradeId: string,
    entries: Array<{ accountUserId: string; debitMinor: MinorUnits; creditMinor: MinorUnits }>
  ): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgLedgerRepo.insertEntries(client, tradeId, entries);
    }
    for (const e of entries) {
      mockStore.ledgerEntries.push({
        id: crypto.randomUUID(),
        tradeId,
        accountUserId: e.accountUserId,
        debitMinor: e.debitMinor,
        creditMinor: e.creditMinor,
        createdAt: new Date().toISOString(),
      });
    }
  },

  async getLedgerTotals(client?: DbClient): Promise<{ totalDebits: MinorUnits; totalCredits: MinorUnits }> {
    if (shouldUsePg(client)) {
      return await pgLedgerRepo.getLedgerTotals(client);
    }
    let totalDebits = 0;
    let totalCredits = 0;
    for (const e of mockStore.ledgerEntries) {
      totalDebits += e.debitMinor;
      totalCredits += e.creditMinor;
    }
    return { totalDebits, totalCredits };
  },
};

export const escrowRepo: EscrowRepository = {
  async createHold(client: DbClient, tradeId: string, amountMinor: MinorUnits): Promise<EscrowHold> {
    if (shouldUsePg(client)) {
      return await pgEscrowRepo.createHold(client, tradeId, amountMinor);
    }
    const hold: EscrowHold = {
      id: crypto.randomUUID(),
      tradeId,
      amountMinor,
      status: 'HELD',
    };
    mockStore.escrowHolds.set(tradeId, hold);
    return hold;
  },

  async releaseHold(client: DbClient, tradeId: string): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgEscrowRepo.releaseHold(client, tradeId);
    }
    const hold = mockStore.escrowHolds.get(tradeId);
    if (hold) {
      hold.status = 'RELEASED';
    }
  },

  async refundHold(client: DbClient, tradeId: string): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgEscrowRepo.refundHold(client, tradeId);
    }
    const hold = mockStore.escrowHolds.get(tradeId);
    if (hold) {
      hold.status = 'REFUNDED';
    }
  },

  async listHoldsByUser(client: DbClient, userId: string): Promise<EscrowHold[]> {
    if (shouldUsePg(client)) {
      return await pgEscrowRepo.listHoldsByUser(client, userId);
    }
    const userTradeIds = new Set<string>();
    for (const trade of mockStore.trades.values()) {
      const buyOrd = mockStore.orders.get(trade.buyOrderId);
      const sellOrd = mockStore.orders.get(trade.sellOrderId);
      if (buyOrd?.userId === userId || sellOrd?.userId === userId) {
        userTradeIds.add(trade.id);
      }
    }
    const list: EscrowHold[] = [];
    for (const hold of mockStore.escrowHolds.values()) {
      if (userTradeIds.has(hold.tradeId)) {
        list.push({ ...hold });
      }
    }
    return list;
  },
};

export const auctionsRepo: AuctionsRepository = {
  async insertAuction(
    client: DbClient,
    auction: Omit<Auction, 'id' | 'currentPriceMinor' | 'status' | 'winnerUserId' | 'endsAt'>
  ): Promise<Auction> {
    if (shouldUsePg(client)) {
      return await pgAuctionsRepo.insertAuction(client, auction);
    }
    const saved: Auction = {
      id: crypto.randomUUID(),
      ...auction,
      currentPriceMinor: auction.startPriceMinor,
      status: 'RUNNING',
      winnerUserId: null,
      endsAt: new Date(Date.now() + 600000).toISOString(),
    };
    mockStore.auctions.set(saved.id, saved);
    return saved;
  },

  async getAuction(client: DbClient, auctionId: string): Promise<Auction | null> {
    if (shouldUsePg(client)) {
      return await pgAuctionsRepo.getAuction(client, auctionId);
    }
    return mockStore.auctions.get(auctionId) || null;
  },

  async listAuctions(client?: DbClient): Promise<Auction[]> {
    if (shouldUsePg(client)) {
      return await pgAuctionsRepo.listAuctions(client);
    }
    return Array.from(mockStore.auctions.values());
  },

  async atomicBidUpdate(
    client: DbClient,
    auctionId: string,
    expectedPrice: MinorUnits,
    winnerId: string
  ): Promise<Auction | null> {
    if (shouldUsePg(client)) {
      return await pgAuctionsRepo.atomicBidUpdate(client, auctionId, expectedPrice, winnerId);
    }
    const auc = mockStore.auctions.get(auctionId);
    if (!auc || auc.status !== 'RUNNING' || auc.currentPriceMinor !== expectedPrice) {
      return null;
    }
    auc.status = 'ENDED';
    auc.winnerUserId = winnerId;
    return auc;
  },

  async updateAuctionPrice(client: DbClient, auctionId: string, currentPriceMinor: MinorUnits): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgAuctionsRepo.updateAuctionPrice(client, auctionId, currentPriceMinor);
    }
    const auc = mockStore.auctions.get(auctionId);
    if (auc && auc.status === 'RUNNING') {
      auc.currentPriceMinor = currentPriceMinor;
    }
  },

  async endAuction(client: DbClient, auctionId: string, winnerUserId: string | null): Promise<void> {
    if (shouldUsePg(client)) {
      return await pgAuctionsRepo.endAuction(client, auctionId, winnerUserId);
    }
    const auc = mockStore.auctions.get(auctionId);
    if (auc) {
      auc.status = 'ENDED';
      auc.winnerUserId = winnerUserId;
    }
  },
};

export async function reconcileDb(client?: DbClient) {
  if (shouldUsePg(client)) {
    return await pgReconcileDb(client);
  }
  const ledger = await ledgerRepo.getLedgerTotals();
  let totalAvailable = 0;
  let totalReserved = 0;
  for (const acc of mockStore.accounts.values()) {
    totalAvailable += acc.balanceMinor;
    totalReserved += acc.reservedMinor;
  }
  let escrowHeld = 0;
  for (const h of mockStore.escrowHolds.values()) {
    if (h.status === 'HELD') {
      escrowHeld += h.amountMinor;
    }
  }
  return {
    ok: ledger.totalDebits === ledger.totalCredits,
    totalBalances: totalAvailable + totalReserved,
    totalLedgerNet: ledger.totalDebits - ledger.totalCredits,
    totalAvailable,
    totalReserved,
    totalDebits: ledger.totalDebits,
    totalCredits: ledger.totalCredits,
    escrowHeld,
    negativeRows: 0,
  };
}

export async function getAllOpenOrdersGroupedByMarket(
  client?: DbClient
): Promise<Record<string, Order[]>> {
  if (shouldUsePg(client)) {
    return await pgGetAllOpenOrdersGroupedByMarket(client);
  }
  const result: Record<string, Order[]> = {};
  for (const o of mockStore.orders.values()) {
    if (o.status === 'OPEN' || o.status === 'PARTIAL') {
      if (!result[o.marketId]) result[o.marketId] = [];
      result[o.marketId].push(o);
    }
  }
  return result;
}
