export type MinorUnits = number;
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
export type EscrowStatus = 'HELD' | 'RELEASED' | 'REFUNDED';
export type AuctionStatus = 'RUNNING' | 'ENDED';
export interface User {
    id: string;
    email: string;
    passwordHash: string;
    createdAt: string;
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
    capPercent: number;
    status: string;
}
export interface Inventory {
    userId: string;
    marketId: string;
    quantity: number;
    reservedQty: number;
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
    idempotencyKey: string;
    createdAt: string;
}
export interface Trade {
    id: string;
    marketId: string;
    buyOrderId: string;
    sellOrderId: string;
    priceMinor: MinorUnits;
    qty: number;
    createdAt: string;
}
export interface LedgerEntry {
    id: string;
    tradeId: string;
    accountUserId: string;
    debitMinor: MinorUnits;
    creditMinor: MinorUnits;
    createdAt: string;
}
export interface EscrowHold {
    id: string;
    tradeId: string;
    amountMinor: MinorUnits;
    status: EscrowStatus;
}
export interface Auction {
    id: string;
    marketId: string;
    startPriceMinor: MinorUnits;
    floorPriceMinor: MinorUnits;
    decrementMinor: MinorUnits;
    intervalSec: number;
    currentPriceMinor: MinorUnits;
    status: AuctionStatus;
    winnerUserId: string | null;
    endsAt: string;
}
export interface OrderPayload {
    marketId: string;
    side: OrderSide;
    type: OrderType;
    price?: MinorUnits;
    qty: number;
    idempotencyKey: string;
}
export interface Level2Level {
    price: MinorUnits;
    qty: number;
    orders: number;
}
export interface BookSnapshot {
    bids: Level2Level[];
    asks: Level2Level[];
}
export interface TradeView {
    id: string;
    marketId: string;
    buyOrderId: string;
    sellOrderId: string;
    price: MinorUnits;
    qty: number;
    createdAt: string;
}
export interface PortfolioView {
    balances: {
        available: MinorUnits;
        reserved: MinorUnits;
        total: MinorUnits;
    };
    inventory: Array<{
        marketId: string;
        marketName: string;
        quantity: number;
        reservedQty: number;
        availableQty: number;
    }>;
    trades: TradeView[];
    escrows: Array<{
        tradeId: string;
        amountMinor: MinorUnits;
        status: EscrowStatus;
        isBuyer: boolean;
    }>;
}
export interface AuctionView {
    id: string;
    marketId: string;
    marketName?: string;
    startPrice: MinorUnits;
    floorPrice: MinorUnits;
    decrement: MinorUnits;
    intervalSec: number;
    currentPrice: MinorUnits;
    status: AuctionStatus;
    winnerUserId: string | null;
    endsAt: string;
}
export type WsEvent = {
    type: 'snapshot';
    marketId: string;
    bids: Level2Level[];
    asks: Level2Level[];
} | {
    type: 'depth_delta';
    marketId: string;
    bids: Level2Level[];
    asks: Level2Level[];
} | {
    type: 'trade';
    marketId: string;
    tradeId: string;
    price: MinorUnits;
    qty: number;
    buyOrderId: string;
    sellOrderId: string;
    createdAt: string;
} | {
    type: 'order_update';
    orderId: string;
    userId: string;
    marketId: string;
    side: OrderSide;
    price: MinorUnits | null;
    qty: number;
    filledQty: number;
    status: OrderStatus;
} | {
    type: 'auction_tick';
    auctionId: string;
    marketId: string;
    currentPrice: MinorUnits;
    endsAt: string;
} | {
    type: 'auction_ended';
    auctionId: string;
    marketId: string;
    finalPrice: MinorUnits;
    winnerUserId: string | null;
} | {
    type: 'escrow_update';
    tradeId: string;
    status: EscrowStatus;
};
