// REST API Client for RelicBourse
// Strictly adheres to MASTER API Contract

import axios from 'axios';
import { API_BASE } from '../config';
import {
  AuthResponse,
  Market,
  BookSnapshot,
  OrderPayload,
  Order,
  PortfolioView,
  TradeView,
  Auction,
  CreateAuctionPayload,
  ReconcileReport,
} from '../types';
import {
  MOCK_MARKETS,
  MOCK_BOOK_SNAPSHOTS,
  MOCK_PORTFOLIO,
  MOCK_MY_ORDERS,
  MOCK_TRADES,
  MOCK_AUCTIONS,
} from './mockData';

export const TOKEN_STORAGE_KEY = 'relicbourse_jwt';
export const USER_STORAGE_KEY = 'relicbourse_user';

// Mock state storage for full offline/standalone demo flow if backend is offline
let mockPortfolioState: PortfolioView = JSON.parse(JSON.stringify(MOCK_PORTFOLIO));
let mockOrdersState: Order[] = JSON.parse(JSON.stringify(MOCK_MY_ORDERS));
let mockTradesState: Record<string, TradeView[]> = JSON.parse(JSON.stringify(MOCK_TRADES));
let mockAuctionsState: Auction[] = JSON.parse(JSON.stringify(MOCK_AUCTIONS));

// In-memory idempotency cache for client mock fallback
const mockIdempotencyMap = new Map<string, Order>();

// Axios instance
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auto-attach JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Extract readable, verbatim server error message
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (error.response?.status === 401) return 'Session expired or invalid credentials. Please log in.';
    if (error.response?.status === 403) return 'Access denied. You do not have permission for this action.';
    if (error.response?.status === 404) return 'The requested resource was not found on the server.';
    if (error.code === 'ERR_NETWORK') return 'Cannot reach server at ' + API_BASE + ' (Network Error). Using local demo cache.';
    return error.message || 'An unexpected network error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error occurred';
}

// REST API Endpoints matching MASTER spec

export const apiClient = {
  // POST /auth/register
  async register(email: string, password: string): Promise<AuthResponse> {
    try {
      const res = await api.post<AuthResponse>('/auth/register', { email, password });
      return res.data;
    } catch (err) {
      // Offline fallback demo
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const mockUser = { id: 'usr-' + Math.random().toString(36).substring(2, 9), email };
        const mockToken = 'mock-jwt-token-' + Date.now();
        return { token: mockToken, user: mockUser };
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // POST /auth/login
  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      return res.data;
    } catch (err) {
      // Offline fallback demo
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const mockUser = { id: 'usr-demo-me', email };
        const mockToken = 'mock-jwt-token-login-' + Date.now();
        return { token: mockToken, user: mockUser };
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /markets
  async getMarkets(): Promise<Market[]> {
    try {
      const res = await api.get<Market[]>('/markets');
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        return MOCK_MARKETS;
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /markets/:id/book
  async getOrderBook(marketId: string): Promise<BookSnapshot> {
    try {
      const res = await api.get<BookSnapshot>(`/markets/${marketId}/book`);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        return MOCK_BOOK_SNAPSHOTS[marketId] || { bids: [], asks: [] };
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // POST /orders
  async createOrder(payload: OrderPayload): Promise<Order> {
    try {
      const res = await api.post<Order>('/orders', payload);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        // Handle mock fallback idempotency
        if (mockIdempotencyMap.has(payload.idempotencyKey)) {
          return mockIdempotencyMap.get(payload.idempotencyKey)!;
        }

        // Anti-scalping collar check check against mock market
        const market = MOCK_MARKETS.find((m) => m.id === payload.marketId);
        if (market && payload.price && payload.type === 'LIMIT') {
          const maxAllowed = Math.floor((market.faceValueMinor * market.capPercent) / 100);
          if (payload.price > maxAllowed) {
            throw new Error(
              `Anti-scalping collar violation: Price ₹${(payload.price / 100).toFixed(
                2
              )} exceeds 120% cap (max ₹${(maxAllowed / 100).toFixed(2)})`
            );
          }
        }

        // Balance / inventory check
        if (payload.side === 'BUY' && payload.price) {
          const required = payload.price * payload.qty;
          const available = mockPortfolioState.balanceMinor - mockPortfolioState.reservedMinor;
          if (required > available) {
            throw new Error(`Insufficient funds: requires ₹${(required / 100).toFixed(2)}, available ₹${(available / 100).toFixed(2)}`);
          }
          mockPortfolioState.reservedMinor += required;
        } else if (payload.side === 'SELL') {
          const inv = mockPortfolioState.inventory.find((i) => i.marketId === payload.marketId);
          const availQty = inv ? inv.quantity - inv.reservedQty : 0;
          if (payload.qty > availQty) {
            throw new Error(`Insufficient inventory: requires ${payload.qty} units, available ${availQty}`);
          }
          if (inv) inv.reservedQty += payload.qty;
        }

        const newOrder: Order = {
          id: 'ord-' + Math.random().toString(36).substring(2, 9),
          userId: 'usr-demo-me',
          marketId: payload.marketId,
          side: payload.side,
          type: payload.type,
          priceMinor: payload.price ?? null,
          qty: payload.qty,
          filledQty: 0,
          status: 'OPEN',
          idempotencyKey: payload.idempotencyKey,
          createdAt: new Date().toISOString(),
        };

        mockOrdersState.unshift(newOrder);
        mockIdempotencyMap.set(payload.idempotencyKey, newOrder);
        return newOrder;
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // POST /orders/:id/cancel
  async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await api.post<{ success: boolean; message?: string }>(`/orders/${orderId}/cancel`);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const order = mockOrdersState.find((o) => o.id === orderId);
        if (order) {
          order.status = 'CANCELLED';
          // Release reservations
          if (order.side === 'BUY' && order.priceMinor) {
            const release = order.priceMinor * (order.qty - order.filledQty);
            mockPortfolioState.reservedMinor = Math.max(0, mockPortfolioState.reservedMinor - release);
          } else if (order.side === 'SELL') {
            const inv = mockPortfolioState.inventory.find((i) => i.marketId === order.marketId);
            if (inv) {
              inv.reservedQty = Math.max(0, inv.reservedQty - (order.qty - order.filledQty));
            }
          }
        }
        return { success: true, message: 'Order cancelled' };
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /orders/mine
  async getMyOrders(): Promise<Order[]> {
    try {
      const res = await api.get<Order[]>('/orders/mine');
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        return [...mockOrdersState];
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /portfolio
  async getPortfolio(): Promise<PortfolioView> {
    try {
      const res = await api.get<PortfolioView>('/portfolio');
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        return JSON.parse(JSON.stringify(mockPortfolioState));
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /trades?marketId=
  async getTrades(marketId?: string): Promise<TradeView[]> {
    try {
      const url = marketId ? `/trades?marketId=${marketId}` : '/trades';
      const res = await api.get<TradeView[]>(url);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        if (marketId && mockTradesState[marketId]) {
          return mockTradesState[marketId];
        }
        return Object.values(mockTradesState).flat();
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // POST /auctions
  async createAuction(payload: CreateAuctionPayload): Promise<Auction> {
    try {
      const res = await api.post<Auction>('/auctions', payload);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const market = MOCK_MARKETS.find((m) => m.id === payload.marketId);
        const newAuction: Auction = {
          id: 'auc-' + Math.random().toString(36).substring(2, 9),
          marketId: payload.marketId,
          marketName: market?.name || 'Festival Asset',
          startPriceMinor: payload.startPriceMinor,
          floorPriceMinor: payload.floorPriceMinor,
          decrementMinor: payload.decrementMinor,
          intervalSec: payload.intervalSec,
          currentPriceMinor: payload.startPriceMinor,
          status: 'RUNNING',
          winnerUserId: null,
          endsAt: new Date(
            Date.now() +
              Math.ceil(
                ((payload.startPriceMinor - payload.floorPriceMinor) / payload.decrementMinor) * payload.intervalSec
              ) *
                1000
          ).toISOString(),
          createdAt: new Date().toISOString(),
        };
        mockAuctionsState.unshift(newAuction);
        return newAuction;
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // POST /auctions/:id/bid
  async bidAuction(auctionId: string): Promise<{ success: boolean; tradeId?: string; message?: string }> {
    try {
      const res = await api.post<{ success: boolean; tradeId?: string; message?: string }>(`/auctions/${auctionId}/bid`);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const auc = mockAuctionsState.find((a) => a.id === auctionId);
        if (!auc || auc.status === 'ENDED') {
          throw new Error('Auction ended — another bidder won or floor reached');
        }
        auc.status = 'ENDED';
        auc.winnerUserId = 'usr-demo-me';
        // Add trade & escrow
        const tradeId = 'trd-auc-' + Math.random().toString(36).substring(2, 7);
        mockPortfolioState.escrows = mockPortfolioState.escrows || [];
        mockPortfolioState.escrows.unshift({
          id: 'esc-' + Math.random().toString(36).substring(2, 7),
          tradeId,
          amountMinor: auc.currentPriceMinor,
          status: 'HELD',
          buyerUserId: 'usr-demo-me',
          marketId: auc.marketId,
          marketName: auc.marketName,
          createdAt: new Date().toISOString(),
        });
        return { success: true, tradeId, message: 'Auction won! Escrow created.' };
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /auctions
  async getAuctions(): Promise<Auction[]> {
    try {
      const res = await api.get<Auction[]>('/auctions');
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        return [...mockAuctionsState];
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /auctions/:id
  async getAuctionById(id: string): Promise<Auction> {
    try {
      const res = await api.get<Auction>(`/auctions/${id}`);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const auc = mockAuctionsState.find((a) => a.id === id);
        if (auc) return auc;
        throw new Error('Auction not found');
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // POST /trades/:id/confirm-delivery
  async confirmDelivery(tradeId: string): Promise<{ success: boolean; status: string }> {
    try {
      const res = await api.post<{ success: boolean; status: string }>(`/trades/${tradeId}/confirm-delivery`);
      return res.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (!err.response || err.code === 'ERR_NETWORK')) {
        const escrow = mockPortfolioState.escrows?.find((e) => e.tradeId === tradeId);
        if (escrow) {
          escrow.status = 'RELEASED';
          // Release reserved and update inventory
          const inv = mockPortfolioState.inventory.find((i) => i.marketId === escrow.marketId);
          if (inv) inv.quantity += 1;
        }
        return { success: true, status: 'RELEASED' };
      }
      throw new Error(getErrorMessage(err));
    }
  },

  // GET /health
  async getHealth(): Promise<{ status: string }> {
    const res = await api.get<{ status: string }>('/health');
    return res.data;
  },

  // GET /admin/reconcile
  async getReconcile(): Promise<ReconcileReport> {
    const res = await api.get<ReconcileReport>('/admin/reconcile');
    return res.data;
  },
};
