export type Side = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED';

export interface MatchingOrder {
  id: string;
  userId: string;
  marketId: string;
  side: Side;
  type: OrderType;
  priceMinor: number | null; // null for MARKET orders; integer paise for LIMIT
  qty: number;
  filledQty: number;
  status: OrderStatus;
  seq: number;
}

export interface Fill {
  buyOrderId: string;
  sellOrderId: string;
  priceMinor: number;
  qty: number;
  makerOrderId: string;
  takerOrderId: string;
}

export interface MatchResult {
  fills: Fill[];
  restingOrder: MatchingOrder | null;
  fullyFilled: boolean;
  cancelledRemainderQty: number;
}

export interface Level2Level {
  price: number;
  qty: number;
  orders: number;
}

export interface BookSnapshot {
  bids: Level2Level[];
  asks: Level2Level[];
}
