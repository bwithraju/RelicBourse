// Single hook governing Order Book, Trades, and Live WS synchronization for a market
// Adheres strictly to MASTER rules (commit-then-broadcast, snapshot refresh on reconnect)

import { useState, useEffect, useCallback, useRef } from 'react';
import { BookSnapshot, Level2Entry, TradeView, Order, WsServerEvent } from '../types';
import { apiClient } from '../api/client';
import { wsClient } from '../ws/client';
import { useAuth } from '../context/AuthContext';

export interface UseOrderBookResult {
  book: BookSnapshot;
  trades: TradeView[];
  myMarketOrders: Order[];
  lastTradePrice: number | null;
  lastTradeChange: 'UP' | 'DOWN' | 'SAME' | null;
  isLoading: boolean;
  error: string | null;
  refreshBook: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  refreshMyOrders: () => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
}

export function useOrderBook(marketId: string): UseOrderBookResult {
  const { user, refreshPortfolio } = useAuth();

  const [book, setBook] = useState<BookSnapshot>({ bids: [], asks: [] });
  const [trades, setTrades] = useState<TradeView[]>([]);
  const [myMarketOrders, setMyMarketOrders] = useState<Order[]>([]);
  const [lastTradePrice, setLastTradePrice] = useState<number | null>(null);
  const [lastTradeChange, setLastTradeChange] = useState<'UP' | 'DOWN' | 'SAME' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const prevTradePriceRef = useRef<number | null>(null);

  // Fetch initial Level-2 Snapshot
  const refreshBook = useCallback(async () => {
    try {
      const data = await apiClient.getOrderBook(marketId);
      // Sort asks ascending by price; bids descending by price
      const sortedBids = [...(data.bids || [])].sort((a, b) => b.price - a.price);
      const sortedAsks = [...(data.asks || [])].sort((a, b) => a.price - b.price);
      setBook({ bids: sortedBids, asks: sortedAsks });
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch order book';
      setError(msg);
    }
  }, [marketId]);

  // Fetch Recent Trades
  const refreshTrades = useCallback(async () => {
    try {
      const data = await apiClient.getTrades(marketId);
      setTrades(data);
      if (data.length > 0) {
        setLastTradePrice(data[0].priceMinor);
        if (data.length > 1) {
          if (data[0].priceMinor > data[1].priceMinor) setLastTradeChange('UP');
          else if (data[0].priceMinor < data[1].priceMinor) setLastTradeChange('DOWN');
          else setLastTradeChange('SAME');
        }
        prevTradePriceRef.current = data[0].priceMinor;
      }
    } catch (err) {
      console.warn('Could not fetch trades:', err);
    }
  }, [marketId]);

  // Fetch user's orders in this market
  const refreshMyOrders = useCallback(async () => {
    if (!user) return;
    try {
      const allOrders = await apiClient.getMyOrders();
      const inThisMarket = allOrders.filter(
        (o) => o.marketId === marketId && (o.status === 'OPEN' || o.status === 'PARTIAL')
      );
      setMyMarketOrders(inThisMarket);
    } catch (err) {
      console.warn('Could not fetch user orders:', err);
    }
  }, [marketId, user]);

  // Cancel order in this market
  const cancelOrder = useCallback(
    async (orderId: string) => {
      await apiClient.cancelOrder(orderId);
      await Promise.all([refreshMyOrders(), refreshBook(), refreshPortfolio()]);
    },
    [refreshMyOrders, refreshBook, refreshPortfolio]
  );

  // Initial data load
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([refreshBook(), refreshTrades(), refreshMyOrders()]).finally(() => {
      if (mounted) setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [marketId, refreshBook, refreshTrades, refreshMyOrders]);

  // WebSocket Subscription & Live Updates
  useEffect(() => {
    // Subscribe to this market
    wsClient.subscribeMarket(marketId);

    // Reconnect hook: on reconnect, refetch fresh snapshot per Rule 8
    const unsubStatus = wsClient.onStatusChange((status) => {
      if (status === 'CONNECTED') {
        refreshBook();
        refreshTrades();
      }
    });

    // Handle incoming events
    const unsubEvent = wsClient.addEventListener((event: WsServerEvent) => {
      // 1. Snapshot event: replace book completely
      if (event.type === 'snapshot') {
        if (!event.marketId || event.marketId === marketId) {
          const rawBids = event.data?.bids || (event as any).bids || [];
          const rawAsks = event.data?.asks || (event as any).asks || [];
          const sortedBids = [...rawBids].sort((a, b) => b.price - a.price);
          const sortedAsks = [...rawAsks].sort((a, b) => a.price - b.price);
          setBook({ bids: sortedBids, asks: sortedAsks });
        }
      }

      // 2. Depth Delta event: replace or merge level changes
      else if (event.type === 'depth_delta') {
        if (!event.marketId || event.marketId === marketId) {
          // If the payload is already a full snapshot { bids, asks }
          if (event.data && typeof event.data === 'object' && 'bids' in event.data && 'asks' in event.data) {
            const sortedBids = [...(event.data.bids || [])].sort((a, b) => b.price - a.price);
            const sortedAsks = [...(event.data.asks || [])].sort((a, b) => a.price - b.price);
            setBook({ bids: sortedBids, asks: sortedAsks });
          } else if (Array.isArray(event.data)) {
            // Delta list of level updates: [{side, price, qty, orders}]
            setBook((prev) => {
              const bidsMap = new Map<number, Level2Entry>(prev.bids.map((b) => [b.price, b]));
              const asksMap = new Map<number, Level2Entry>(prev.asks.map((a) => [a.price, a]));

              (event.data as { side: string; price: number; qty: number; orders: number }[]).forEach((delta) => {
                const targetMap = delta.side === 'BUY' ? bidsMap : asksMap;
                if (delta.qty <= 0) {
                  targetMap.delete(delta.price);
                } else {
                  targetMap.set(delta.price, { price: delta.price, qty: delta.qty, orders: delta.orders || 1 });
                }
              });

              return {
                bids: Array.from(bidsMap.values()).sort((a, b) => b.price - a.price),
                asks: Array.from(asksMap.values()).sort((a, b) => a.price - b.price),
              };
            });
          }
        }
      }

      // 3. Trade event: prepend to trades list & flash
      else if (event.type === 'trade') {
        if (!event.marketId || event.marketId === marketId) {
          const newTrade = event.data;
          setTrades((prev) => [newTrade, ...prev.slice(0, 49)]);

          const prevPrice = prevTradePriceRef.current;
          if (prevPrice !== null) {
            if (newTrade.priceMinor > prevPrice) setLastTradeChange('UP');
            else if (newTrade.priceMinor < prevPrice) setLastTradeChange('DOWN');
            else setLastTradeChange('SAME');
          }
          setLastTradePrice(newTrade.priceMinor);
          prevTradePriceRef.current = newTrade.priceMinor;
        }
      }

      // 4. Order update for user: update My Orders + refetch portfolio
      else if (event.type === 'order_update') {
        const order = event.data;
        if (!event.marketId || event.marketId === marketId) {
          setMyMarketOrders((prev) => {
            if (order.status === 'FILLED' || order.status === 'CANCELLED') {
              return prev.filter((o) => o.id !== order.id);
            }
            const exists = prev.some((o) => o.id === order.id);
            if (exists) {
              return prev.map((o) => (o.id === order.id ? order : o));
            }
            return [order, ...prev];
          });
        }
        refreshPortfolio();
      }
    });

    // Cleanup: unsubscribe on unmount or market switch
    return () => {
      wsClient.unsubscribeMarket(marketId);
      unsubStatus();
      unsubEvent();
    };
  }, [marketId, refreshBook, refreshTrades, refreshPortfolio]);

  return {
    book,
    trades,
    myMarketOrders,
    lastTradePrice,
    lastTradeChange,
    isLoading,
    error,
    refreshBook,
    refreshTrades,
    refreshMyOrders,
    cancelOrder,
  };
}
