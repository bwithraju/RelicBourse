// Realistic mock data for RelicBourse demo/offline fallback
// Money is in integer minor units (paise: 100 paise = 1 INR)

import { Market, BookSnapshot, TradeView, PortfolioView, Auction, Order } from '../types';

export const MOCK_MARKETS: Market[] = [
  {
    id: 'mkt-sunburn-vip',
    name: 'Sunburn Goa 2026 VIP Pass',
    faceValueMinor: 1200000, // ₹12,000.00
    capPercent: 120, // Max collar: ₹14,400.00
    status: 'ACTIVE',
    bestBid: 1350000,
    bestAsk: 1380000,
    volume24hMinor: 48500000,
  },
  {
    id: 'mkt-cyberpunk-merch',
    name: 'Cyberpunk Limited Edition Bomber Jacket',
    faceValueMinor: 1850000, // ₹18,500.00
    capPercent: 120, // Max collar: ₹22,200.00
    status: 'ACTIVE',
    bestBid: 2020000,
    bestAsk: 2090000,
    volume24hMinor: 31200000,
  },
  {
    id: 'mkt-coldplay-infinity',
    name: 'Coldplay Mumbai Infinity Stand (General)',
    faceValueMinor: 800000, // ₹8,000.00
    capPercent: 120, // Max collar: ₹9,600.00
    status: 'ACTIVE',
    bestBid: 910000,
    bestAsk: 940000,
    volume24hMinor: 67200000,
  },
];

export const MOCK_BOOK_SNAPSHOTS: Record<string, BookSnapshot> = {
  'mkt-sunburn-vip': {
    bids: [
      { price: 1350000, qty: 4, orders: 2 },
      { price: 1340000, qty: 10, orders: 4 },
      { price: 1330000, qty: 7, orders: 3 },
      { price: 1315000, qty: 15, orders: 6 },
      { price: 1300000, qty: 22, orders: 8 },
      { price: 1280000, qty: 30, orders: 12 },
    ],
    asks: [
      { price: 1380000, qty: 5, orders: 2 },
      { price: 1395000, qty: 8, orders: 3 },
      { price: 1410000, qty: 14, orders: 5 },
      { price: 1425000, qty: 9, orders: 3 },
      { price: 1435000, qty: 20, orders: 7 },
      { price: 1440000, qty: 12, orders: 4 }, // at 120% cap limit
    ],
  },
  'mkt-cyberpunk-merch': {
    bids: [
      { price: 2020000, qty: 3, orders: 1 },
      { price: 2000000, qty: 6, orders: 2 },
      { price: 1980000, qty: 11, orders: 4 },
    ],
    asks: [
      { price: 2090000, qty: 4, orders: 2 },
      { price: 2120000, qty: 7, orders: 3 },
      { price: 2180000, qty: 10, orders: 5 },
    ],
  },
  'mkt-coldplay-infinity': {
    bids: [
      { price: 910000, qty: 8, orders: 3 },
      { price: 900000, qty: 16, orders: 5 },
      { price: 885000, qty: 25, orders: 9 },
    ],
    asks: [
      { price: 940000, qty: 6, orders: 2 },
      { price: 950000, qty: 12, orders: 4 },
      { price: 960000, qty: 18, orders: 6 },
    ],
  },
};

export const MOCK_TRADES: Record<string, TradeView[]> = {
  'mkt-sunburn-vip': [
    {
      id: 'trd-101',
      marketId: 'mkt-sunburn-vip',
      buyOrderId: 'ord-b-01',
      sellOrderId: 'ord-s-01',
      priceMinor: 1365000,
      qty: 2,
      createdAt: new Date(Date.now() - 45000).toISOString(),
    },
    {
      id: 'trd-102',
      marketId: 'mkt-sunburn-vip',
      buyOrderId: 'ord-b-02',
      sellOrderId: 'ord-s-02',
      priceMinor: 1360000,
      qty: 1,
      createdAt: new Date(Date.now() - 120000).toISOString(),
    },
    {
      id: 'trd-103',
      marketId: 'mkt-sunburn-vip',
      buyOrderId: 'ord-b-03',
      sellOrderId: 'ord-s-03',
      priceMinor: 1370000,
      qty: 3,
      createdAt: new Date(Date.now() - 340000).toISOString(),
    },
    {
      id: 'trd-104',
      marketId: 'mkt-sunburn-vip',
      buyOrderId: 'ord-b-04',
      sellOrderId: 'ord-s-04',
      priceMinor: 1350000,
      qty: 1,
      createdAt: new Date(Date.now() - 780000).toISOString(),
    },
  ],
};

export const MOCK_PORTFOLIO: PortfolioView = {
  balanceMinor: 10000000, // ₹1,00,000.00
  reservedMinor: 2700000, // ₹27,000.00
  inventory: [
    {
      marketId: 'mkt-sunburn-vip',
      marketName: 'Sunburn Goa 2026 VIP Pass',
      quantity: 5,
      reservedQty: 1,
    },
    {
      marketId: 'mkt-cyberpunk-merch',
      marketName: 'Cyberpunk Limited Edition Bomber Jacket',
      quantity: 2,
      reservedQty: 0,
    },
    {
      marketId: 'mkt-coldplay-infinity',
      marketName: 'Coldplay Mumbai Infinity Stand (General)',
      quantity: 0,
      reservedQty: 0,
    },
  ],
  trades: [
    {
      id: 'trd-escrow-demo-1',
      marketId: 'mkt-sunburn-vip',
      buyOrderId: 'ord-my-buy-1',
      sellOrderId: 'ord-s-88',
      priceMinor: 1350000,
      qty: 2,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
  escrows: [
    {
      id: 'esc-001',
      tradeId: 'trd-escrow-demo-1',
      amountMinor: 2700000, // ₹27,000.00
      status: 'HELD',
      buyerUserId: 'usr-demo-me',
      sellerUserId: 'usr-seller-42',
      marketId: 'mkt-sunburn-vip',
      marketName: 'Sunburn Goa 2026 VIP Pass',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
};

export const MOCK_MY_ORDERS: Order[] = [
  {
    id: 'ord-my-01',
    userId: 'usr-demo-me',
    marketId: 'mkt-sunburn-vip',
    side: 'BUY',
    type: 'LIMIT',
    priceMinor: 1350000,
    qty: 2,
    filledQty: 0,
    status: 'OPEN',
    createdAt: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: 'ord-my-02',
    userId: 'usr-demo-me',
    marketId: 'mkt-sunburn-vip',
    side: 'SELL',
    type: 'LIMIT',
    priceMinor: 1420000,
    qty: 1,
    filledQty: 0,
    status: 'OPEN',
    createdAt: new Date(Date.now() - 1500000).toISOString(),
  },
  {
    id: 'ord-my-03',
    userId: 'usr-demo-me',
    marketId: 'mkt-coldplay-infinity',
    side: 'BUY',
    type: 'LIMIT',
    priceMinor: 910000,
    qty: 1,
    filledQty: 1,
    status: 'FILLED',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

export const MOCK_AUCTIONS: Auction[] = [
  {
    id: 'auc-01',
    marketId: 'mkt-sunburn-vip',
    marketName: 'Sunburn Goa 2026 VIP Pass',
    startPriceMinor: 1800000, // starts at ₹18,000
    floorPriceMinor: 1200000, // floor at ₹12,000 (face value)
    decrementMinor: 50000, // -₹500 per tick
    intervalSec: 5,
    currentPriceMinor: 1450000, // currently ₹14,500
    status: 'RUNNING',
    winnerUserId: null,
    endsAt: new Date(Date.now() + 180000).toISOString(),
    createdAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 'auc-02',
    marketId: 'mkt-cyberpunk-merch',
    marketName: 'Cyberpunk Limited Edition Bomber Jacket',
    startPriceMinor: 2500000,
    floorPriceMinor: 1850000,
    decrementMinor: 100000,
    intervalSec: 10,
    currentPriceMinor: 1850000,
    status: 'ENDED',
    winnerUserId: 'usr-collector-99',
    endsAt: new Date(Date.now() - 1200000).toISOString(),
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];
