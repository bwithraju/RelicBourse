// Realistic mock data for RelicBourse demo/offline fallback
// Money is in integer minor units (paise: 100 paise = 1 INR)

import { Market, BookSnapshot, TradeView, PortfolioView, Auction, Order } from '../types';

export const MOCK_MARKETS: Market[] = [
  {
    id: 'market-culrav-2026',
    name: 'Culrav 2026',
    faceValueMinor: 200000, // ₹2,000.00
    capPercent: 120, // Max collar: ₹2,400.00
    status: 'ACTIVE',
    bestBid: 210000,
    bestAsk: 225000,
    volume24hMinor: 4850000,
  },
  {
    id: 'market-renesiance-2026',
    name: 'Renesiance 2026',
    faceValueMinor: 150000, // ₹1,500.00
    capPercent: 120, // Max collar: ₹1,800.00
    status: 'ACTIVE',
    bestBid: 160000,
    bestAsk: 175000,
    volume24hMinor: 3120000,
  },
  {
    id: 'market-avishkar-2026',
    name: 'Avishkar 2026',
    faceValueMinor: 250000, // ₹2,500.00
    capPercent: 120, // Max collar: ₹3,000.00
    status: 'ACTIVE',
    bestBid: 260000,
    bestAsk: 285000,
    volume24hMinor: 6720000,
  },
  {
    id: 'market-rangtaadi-2026',
    name: 'Rangtaadi 2026',
    faceValueMinor: 100000, // ₹1,000.00
    capPercent: 120, // Max collar: ₹1,200.00
    status: 'ACTIVE',
    bestBid: 105000,
    bestAsk: 115000,
    volume24hMinor: 2150000,
  },
];

export const MOCK_BOOK_SNAPSHOTS: Record<string, BookSnapshot> = {
  'market-culrav-2026': {
    bids: [
      { price: 210000, qty: 4, orders: 2 },
      { price: 205000, qty: 10, orders: 4 },
      { price: 200000, qty: 15, orders: 5 },
      { price: 195000, qty: 22, orders: 8 },
    ],
    asks: [
      { price: 225000, qty: 5, orders: 2 },
      { price: 230000, qty: 8, orders: 3 },
      { price: 235000, qty: 14, orders: 5 },
      { price: 240000, qty: 12, orders: 4 }, // at 120% cap limit
    ],
  },
  'market-renesiance-2026': {
    bids: [
      { price: 160000, qty: 3, orders: 1 },
      { price: 155000, qty: 6, orders: 2 },
      { price: 150000, qty: 11, orders: 4 },
    ],
    asks: [
      { price: 175000, qty: 4, orders: 2 },
      { price: 180000, qty: 7, orders: 3 },
    ],
  },
  'market-avishkar-2026': {
    bids: [
      { price: 260000, qty: 8, orders: 3 },
      { price: 250000, qty: 16, orders: 5 },
    ],
    asks: [
      { price: 285000, qty: 6, orders: 2 },
      { price: 295000, qty: 12, orders: 4 },
      { price: 300000, qty: 18, orders: 6 }, // at 120% cap limit
    ],
  },
  'market-rangtaadi-2026': {
    bids: [
      { price: 105000, qty: 10, orders: 4 },
      { price: 100000, qty: 20, orders: 6 },
    ],
    asks: [
      { price: 115000, qty: 8, orders: 3 },
      { price: 120000, qty: 15, orders: 5 },
    ],
  },
};

export const MOCK_TRADES: Record<string, TradeView[]> = {
  'market-culrav-2026': [
    {
      id: 'trd-101',
      marketId: 'market-culrav-2026',
      buyOrderId: 'ord-b-01',
      sellOrderId: 'ord-s-01',
      priceMinor: 215000,
      qty: 2,
      createdAt: new Date(Date.now() - 45000).toISOString(),
    },
    {
      id: 'trd-102',
      marketId: 'market-culrav-2026',
      buyOrderId: 'ord-b-02',
      sellOrderId: 'ord-s-02',
      priceMinor: 210000,
      qty: 1,
      createdAt: new Date(Date.now() - 120000).toISOString(),
    },
  ],
};

export const MOCK_PORTFOLIO: PortfolioView = {
  balanceMinor: 10000000, // ₹1,00,000.00
  reservedMinor: 200000, // ₹2,000.00
  inventory: [
    {
      marketId: 'market-culrav-2026',
      marketName: 'Culrav 2026',
      quantity: 2,
      reservedQty: 0,
    },
    {
      marketId: 'market-renesiance-2026',
      marketName: 'Renesiance 2026',
      quantity: 2,
      reservedQty: 0,
    },
    {
      marketId: 'market-avishkar-2026',
      marketName: 'Avishkar 2026',
      quantity: 2,
      reservedQty: 0,
    },
    {
      marketId: 'market-rangtaadi-2026',
      marketName: 'Rangtaadi 2026',
      quantity: 2,
      reservedQty: 0,
    },
  ],
  trades: [
    {
      id: 'trd-escrow-demo-1',
      marketId: 'market-culrav-2026',
      buyOrderId: 'ord-my-buy-1',
      sellOrderId: 'ord-s-88',
      priceMinor: 210000,
      qty: 1,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
  escrows: [
    {
      id: 'esc-001',
      tradeId: 'trd-escrow-demo-1',
      amountMinor: 210000,
      status: 'HELD',
      buyerUserId: 'usr-demo-me',
      sellerUserId: 'usr-seller-42',
      marketId: 'market-culrav-2026',
      marketName: 'Culrav 2026',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
};

export const MOCK_MY_ORDERS: Order[] = [
  {
    id: 'ord-my-01',
    userId: 'usr-demo-me',
    marketId: 'market-culrav-2026',
    side: 'BUY',
    type: 'LIMIT',
    priceMinor: 210000,
    qty: 1,
    filledQty: 0,
    status: 'OPEN',
    createdAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: 'ord-my-02',
    userId: 'usr-demo-me',
    marketId: 'market-renesiance-2026',
    side: 'SELL',
    type: 'LIMIT',
    priceMinor: 170000,
    qty: 1,
    filledQty: 0,
    status: 'OPEN',
    createdAt: new Date(Date.now() - 1500000).toISOString(),
  },
];

export const MOCK_AUCTIONS: Auction[] = [
  {
    id: 'auc-01',
    marketId: 'market-culrav-2026',
    marketName: 'Culrav 2026',
    startPriceMinor: 240000,
    floorPriceMinor: 180000,
    decrementMinor: 5000,
    intervalSec: 5,
    currentPriceMinor: 210000,
    status: 'RUNNING',
    winnerUserId: null,
    endsAt: new Date(Date.now() + 180000).toISOString(),
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 'auc-02',
    marketId: 'market-avishkar-2026',
    marketName: 'Avishkar 2026',
    startPriceMinor: 300000,
    floorPriceMinor: 220000,
    decrementMinor: 10000,
    intervalSec: 10,
    currentPriceMinor: 250000,
    status: 'ENDED',
    winnerUserId: 'usr-collector-99',
    endsAt: new Date(Date.now() - 1200000).toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];
