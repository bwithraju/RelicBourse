// TypeScript domain types for RelicBourse (mirrored exactly from MASTER spec / packages/shared)
// Money is ALWAYS represented as integer minor units (paise) - NEVER floating point.

export type MinorUnits = number; // Integer minor units (e.g., 100 paise = 1 INR)

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
export type MarketStatus = 'ACTIVE' | 'HALTED' | 'CLOSED';
export type AuctionStatus = 'RUNNING' | 'ENDED';
export type EscrowStatus = 'HELD' | 'RELEASED' | 'REFUNDED';

export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Account {
  userId: string;
  balanceMinor: MinorUnits;
  reservedMinor: MinorUnits;
}

export interface Market {
  id: string;
  name: string;
  faceValueMinor: MinorUnits;
  capPercent: number; // e.g. 120
  status: MarketStatus;
  bestBid?: MinorUnits | null;
  bestAsk?: MinorUnits | null;
  volume24hMinor?: MinorUnits;
}

export interface InventoryItem {
  userId?: string;
  marketId: string;
  quantity: number;
  reservedQty: number;
  marketName?: string;
}

export interface Level2Entry {
  price: MinorUnits;
  qty: number;
  orders: number;
}

export interface BookSnapshot {
  bids: Level2Entry[];
  asks: Level2Entry[];
}

export interface Order {
  id: string;
  userId: string;
  marketId: string;
  side: OrderSide;
  type: OrderType;
  priceMinor: MinorUnits | null;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  idempotencyKey?: string;
  createdAt: string;
}

export interface OrderPayload {
  marketId: string;
  side: OrderSide;
  type: OrderType;
  price?: MinorUnits | null;
  qty: number;
  idempotencyKey: string;
}

export interface TradeView {
  id: string;
  marketId: string;
  buyOrderId: string;
  sellOrderId: string;
  priceMinor: MinorUnits;
  qty: number;
  createdAt: string;
}

export interface EscrowHold {
  id: string;
  tradeId: string;
  amountMinor: MinorUnits;
  status: EscrowStatus;
  buyerUserId?: string;
  sellerUserId?: string;
  createdAt?: string;
  marketId?: string;
  marketName?: string;
}

export interface PortfolioView {
  balanceMinor: MinorUnits;
  reservedMinor: MinorUnits;
  inventory: InventoryItem[];
  trades: TradeView[];
  escrows?: EscrowHold[];
}

export interface Auction {
  id: string;
  marketId: string;
  marketName?: string;
  startPriceMinor: MinorUnits;
  floorPriceMinor: MinorUnits;
  decrementMinor: MinorUnits;
  intervalSec: number;
  currentPriceMinor: MinorUnits;
  status: AuctionStatus;
  winnerUserId: string | null;
  endsAt: string | null;
  createdAt?: string;
}

export interface CreateAuctionPayload {
  marketId: string;
  startPriceMinor: MinorUnits;
  floorPriceMinor: MinorUnits;
  decrementMinor: MinorUnits;
  intervalSec: number;
}

export interface ReconcileReport {
  ok: boolean;
  totalBalances: MinorUnits;
  totalLedgerNet: MinorUnits;
}

// WebSocket Event Types (MASTER contract: JSON with a "type" field)
export type WsServerEvent =
  | { type: 'snapshot'; marketId?: string; data: BookSnapshot }
  | { type: 'depth_delta'; marketId?: string; data: BookSnapshot | { side: OrderSide; price: MinorUnits; qty: number; orders: number }[] }
  | { type: 'trade'; marketId?: string; data: TradeView }
  | { type: 'order_update'; marketId?: string; data: Order }
  | { type: 'auction_tick'; auctionId: string; currentPriceMinor: MinorUnits }
  | { type: 'auction_ended'; auctionId: string; winnerUserId: string | null; finalPriceMinor?: MinorUnits }
  | { type: 'escrow_update'; tradeId: string; status: EscrowStatus };

export type WsClientMessage =
  | { type: 'subscribe'; marketId: string }
  | { type: 'unsubscribe'; marketId: string }
  | { action: 'subscribe'; marketId: string }
  | { action: 'unsubscribe'; marketId: string };
