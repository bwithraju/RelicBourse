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
} from '@relicbourse/shared';
import crypto from 'crypto';

// Default 3 demo markets specified in MASTER spec:
// 1) festival pass (face ₹2,000 = 200000 paise)
// 2) limited merch (face ₹5,000 = 500000 paise)
// 3) concert pass (face ₹1,500 = 150000 paise)
export const DEMO_MARKETS: Market[] = [
  {
    id: 'market-festival-pass',
    name: 'Festival VIP Pass 2026',
    faceValueMinor: 200000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-limited-merch',
    name: 'Cyberpunk Limited Hoodie',
    faceValueMinor: 500000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-concert-pass',
    name: 'Darkhold Midnight Concert Pass',
    faceValueMinor: 150000,
    capPercent: 120,
    status: 'ACTIVE',
  },
];

// In-memory data store for standalone testing / mock until Raju's Postgres repo is connected
class MockDbStore {
  public users = new Map<string, User>();
  public accounts = new Map<string, Account>();
  public inventory = new Map<string, Inventory>(); // key: `${userId}:${marketId}`
  public orders = new Map<string, Order>();
  public trades = new Map<string, Trade>();
  public ledgerEntries: Array<{ id: string; tradeId: string; accountUserId: string; debitMinor: MinorUnits; creditMinor: MinorUnits; createdAt: string }> = [];
  public escrowHolds = new Map<string, EscrowHold>(); // key: tradeId
  public auctions = new Map<string, Auction>();
  public idempotency = new Map<string, { userId: string; requestHash: string; storedResponse: any; createdAt: string }>();

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

// Transaction runner
export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const dummyClient: DbClient = {};
  return await fn(dummyClient);
}

// User Seeding helper (Raju contract)
// Creates account (10,000,000 minor units = ₹1,00,000) and 2 units of each demo market
export async function seedNewUserData(client: DbClient, userId: string): Promise<void> {
  await accountsRepo.createAccount(client, userId, 10000000);
  for (const market of DEMO_MARKETS) {
    await inventoryRepo.seedInventory(client, userId, market.id, 2);
  }
}

export const usersRepo: UsersRepository = {
  async createUser(_client: DbClient, params: { email: string; passwordHash: string }): Promise<User> {
    for (const u of mockStore.users.values()) {
      if (u.email.toLowerCase() === params.email.toLowerCase()) {
        const error = new Error('duplicate key value violates unique constraint "users_email_key"');
        (error as any).code = '23505';
        throw error;
      }
    }
    const user: User = {
      id: crypto.randomUUID(),
      email: params.email,
      passwordHash: params.passwordHash,
      createdAt: new Date().toISOString(),
    };
    mockStore.users.set(user.id, user);
    return user;
  },

  async findByEmail(_client: DbClient, email: string): Promise<User | null> {
    for (const u of mockStore.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return null;
  },

  async findById(_client: DbClient, id: string): Promise<User | null> {
    return mockStore.users.get(id) || null;
  },
};

export const accountsRepo: AccountsRepository = {
  async createAccount(_client: DbClient, userId: string, initialBalanceMinor: MinorUnits): Promise<Account> {
    const account: Account = {
      userId,
      balanceMinor: initialBalanceMinor,
      reservedMinor: 0,
    };
    mockStore.accounts.set(userId, account);
    return account;
  },

  async getAccount(_client: DbClient, userId: string): Promise<Account | null> {
    return mockStore.accounts.get(userId) || null;
  },

  async reserveFunds(_client: DbClient, userId: string, amountMinor: MinorUnits): Promise<boolean> {
    const acc = mockStore.accounts.get(userId);
    if (!acc || acc.balanceMinor < amountMinor) {
      return false;
    }
    acc.balanceMinor -= amountMinor;
    acc.reservedMinor += amountMinor;
    return true;
  },

  async releaseReservation(_client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    const acc = mockStore.accounts.get(userId);
    if (acc) {
      acc.reservedMinor = Math.max(0, acc.reservedMinor - amountMinor);
      acc.balanceMinor += amountMinor;
    }
  },

  async settleDebit(_client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    const acc = mockStore.accounts.get(userId);
    if (acc) {
      acc.reservedMinor = Math.max(0, acc.reservedMinor - amountMinor);
    }
  },

  async settleCredit(_client: DbClient, userId: string, amountMinor: MinorUnits): Promise<void> {
    const acc = mockStore.accounts.get(userId);
    if (acc) {
      acc.balanceMinor += amountMinor;
    }
  },

  async lockAccount(_client: DbClient, userId: string): Promise<Account | null> {
    return mockStore.accounts.get(userId) || null;
  },
};

export const inventoryRepo: InventoryRepository = {
  async seedInventory(_client: DbClient, userId: string, marketId: string, quantity: number): Promise<void> {
    const key = `${userId}:${marketId}`;
    mockStore.inventory.set(key, {
      userId,
      marketId,
      quantity,
      reservedQty: 0,
    });
  },

  async getInventory(_client: DbClient, userId: string, marketId: string): Promise<Inventory | null> {
    return mockStore.inventory.get(`${userId}:${marketId}`) || null;
  },

  async listInventoryByUser(_client: DbClient, userId: string): Promise<Inventory[]> {
    const list: Inventory[] = [];
    for (const inv of mockStore.inventory.values()) {
      if (inv.userId === userId) {
        list.push(inv);
      }
    }
    return list;
  },

  async reserveInventory(_client: DbClient, userId: string, marketId: string, qty: number): Promise<boolean> {
    const inv = mockStore.inventory.get(`${userId}:${marketId}`);
    if (!inv || inv.quantity - inv.reservedQty < qty) {
      return false;
    }
    inv.reservedQty += qty;
    return true;
  },

  async releaseInventoryReservation(_client: DbClient, userId: string, marketId: string, qty: number): Promise<void> {
    const inv = mockStore.inventory.get(`${userId}:${marketId}`);
    if (inv) {
      inv.reservedQty = Math.max(0, inv.reservedQty - qty);
    }
  },

  async settleInventoryMove(_client: DbClient, buyerId: string, sellerId: string, marketId: string, qty: number): Promise<void> {
    // Deduct from seller
    const sellerInv = mockStore.inventory.get(`${sellerId}:${marketId}`);
    if (sellerInv) {
      sellerInv.quantity -= qty;
      sellerInv.reservedQty = Math.max(0, sellerInv.reservedQty - qty);
    }
    // Add to buyer
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
  async listMarkets(): Promise<Market[]> {
    return DEMO_MARKETS;
  },

  async getMarket(_client: DbClient, marketId: string): Promise<Market | null> {
    return DEMO_MARKETS.find((m) => m.id === marketId) || null;
  },

  async getOpenOrdersForBook(_client: DbClient, marketId: string): Promise<Order[]> {
    return Array.from(mockStore.orders.values())
      .filter((o) => o.marketId === marketId && (o.status === 'OPEN' || o.status === 'PARTIAL'))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },
};

export const ordersRepo: OrdersRepository = {
  async insertOrder(_client: DbClient, order: Omit<Order, 'createdAt'>): Promise<Order> {
    const saved: Order = {
      ...order,
      createdAt: new Date().toISOString(),
    };
    mockStore.orders.set(saved.id, saved);
    return saved;
  },

  async updateOrderFill(_client: DbClient, orderId: string, filledQty: number, status: any): Promise<void> {
    const order = mockStore.orders.get(orderId);
    if (order) {
      order.filledQty = filledQty;
      order.status = status;
    }
  },

  async getOrder(_client: DbClient, orderId: string): Promise<Order | null> {
    return mockStore.orders.get(orderId) || null;
  },

  async listOrdersByUser(_client: DbClient, userId: string): Promise<Order[]> {
    return Array.from(mockStore.orders.values())
      .filter((o) => o.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async storeIdempotentResponse(_client: DbClient, key: string, userId: string, requestHash: string, storedResponse: any): Promise<void> {
    mockStore.idempotency.set(key, {
      userId,
      requestHash,
      storedResponse,
      createdAt: new Date().toISOString(),
    });
  },

  async getIdempotentResponse(_client: DbClient, key: string): Promise<{ storedResponse: any; requestHash: string } | null> {
    const item = mockStore.idempotency.get(key);
    if (!item) return null;
    return { storedResponse: item.storedResponse, requestHash: item.requestHash };
  },
};

export const tradesRepo: TradesRepository = {
  async insertTrade(_client: DbClient, trade: Omit<Trade, 'id' | 'createdAt'>): Promise<Trade> {
    const saved: Trade = {
      id: crypto.randomUUID(),
      ...trade,
      createdAt: new Date().toISOString(),
    };
    mockStore.trades.set(saved.id, saved);
    return saved;
  },

  async listTradesByMarket(_client: DbClient, marketId: string, limit = 50): Promise<Trade[]> {
    return Array.from(mockStore.trades.values())
      .filter((t) => t.marketId === marketId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  async getTrade(_client: DbClient, tradeId: string): Promise<Trade | null> {
    return mockStore.trades.get(tradeId) || null;
  },
};

export const ledgerRepo: LedgerRepository = {
  async insertEntries(_client: DbClient, tradeId: string, entries: Array<{ accountUserId: string; debitMinor: MinorUnits; creditMinor: MinorUnits }>): Promise<void> {
    const now = new Date().toISOString();
    for (const e of entries) {
      mockStore.ledgerEntries.push({
        id: crypto.randomUUID(),
        tradeId,
        accountUserId: e.accountUserId,
        debitMinor: e.debitMinor,
        creditMinor: e.creditMinor,
        createdAt: now,
      });
    }
  },

  async getLedgerTotals(): Promise<{ totalDebits: MinorUnits; totalCredits: MinorUnits }> {
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
  async createHold(_client: DbClient, tradeId: string, amountMinor: MinorUnits): Promise<EscrowHold> {
    const hold: EscrowHold = {
      id: crypto.randomUUID(),
      tradeId,
      amountMinor,
      status: 'HELD',
    };
    mockStore.escrowHolds.set(tradeId, hold);
    return hold;
  },

  async releaseHold(_client: DbClient, tradeId: string): Promise<void> {
    const hold = mockStore.escrowHolds.get(tradeId);
    if (hold) {
      hold.status = 'RELEASED';
    }
  },

  async refundHold(_client: DbClient, tradeId: string): Promise<void> {
    const hold = mockStore.escrowHolds.get(tradeId);
    if (hold) {
      hold.status = 'REFUNDED';
    }
  },

  async listHoldsByUser(_client: DbClient, userId: string): Promise<EscrowHold[]> {
    const list: EscrowHold[] = [];
    for (const hold of mockStore.escrowHolds.values()) {
      const trade = mockStore.trades.get(hold.tradeId);
      if (trade) {
        const buyOrder = mockStore.orders.get(trade.buyOrderId);
        const sellOrder = mockStore.orders.get(trade.sellOrderId);
        if (buyOrder?.userId === userId || sellOrder?.userId === userId) {
          list.push(hold);
        }
      }
    }
    return list;
  },
};

export const auctionsRepo: AuctionsRepository = {
  async insertAuction(_client: DbClient, auction: Omit<Auction, 'id' | 'currentPriceMinor' | 'status' | 'winnerUserId' | 'endsAt'>): Promise<Auction> {
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

  async getAuction(_client: DbClient, auctionId: string): Promise<Auction | null> {
    return mockStore.auctions.get(auctionId) || null;
  },

  async listAuctions(): Promise<Auction[]> {
    return Array.from(mockStore.auctions.values());
  },

  async atomicBidUpdate(_client: DbClient, auctionId: string, expectedPrice: MinorUnits, winnerId: string): Promise<Auction | null> {
    const auc = mockStore.auctions.get(auctionId);
    if (!auc || auc.status !== 'RUNNING' || auc.currentPriceMinor !== expectedPrice) {
      return null;
    }
    auc.status = 'ENDED';
    auc.winnerUserId = winnerId;
    return auc;
  },

  async updateAuctionPrice(_client: DbClient, auctionId: string, currentPriceMinor: MinorUnits): Promise<void> {
    const auc = mockStore.auctions.get(auctionId);
    if (auc && auc.status === 'RUNNING') {
      auc.currentPriceMinor = currentPriceMinor;
    }
  },

  async endAuction(_client: DbClient, auctionId: string, winnerUserId: string | null): Promise<void> {
    const auc = mockStore.auctions.get(auctionId);
    if (auc) {
      auc.status = 'ENDED';
      auc.winnerUserId = winnerUserId;
    }
  },
};

export async function reconcileDb() {
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

export async function getAllOpenOrdersGroupedByMarket(): Promise<Record<string, Order[]>> {
  const result: Record<string, Order[]> = {};
  for (const o of mockStore.orders.values()) {
    if (o.status === 'OPEN' || o.status === 'PARTIAL') {
      if (!result[o.marketId]) result[o.marketId] = [];
      result[o.marketId].push(o);
    }
  }
  return result;
}
