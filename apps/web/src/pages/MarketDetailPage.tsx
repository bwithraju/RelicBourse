// Market Detail Page for RelicBourse (Route: /market/:id)
// Core trading screen: 3 columns desktop (L2 Ladder | Depth Chart + Order Form + Resting Orders | Trades Tape)

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Market } from '../types';
import { apiClient } from '../api/client';
import { useOrderBook } from '../hooks/useOrderBook';
import { L2Ladder } from '../components/L2Ladder';
import { DepthChart } from '../components/DepthChart';
import { OrderForm } from '../components/OrderForm';
import { TradesPanel } from '../components/TradesPanel';
import { MyOpenOrders } from '../components/MyOpenOrders';
import { ErrorBanner } from '../components/EmptyState';
import { formatMoney } from '../utils/format';

export const MarketDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const marketId = id || '';

  const [market, setMarket] = useState<Market | null>(null);
  const [marketLoading, setMarketLoading] = useState<boolean>(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Selected price clicked in ladder to auto-fill into order form
  const [selectedPriceMinor, setSelectedPriceMinor] = useState<number | null>(null);

  // Order Book & live synchronized data
  const {
    book,
    trades,
    myMarketOrders,
    lastTradePrice,
    lastTradeChange,
    error: bookError,
    refreshBook,
    refreshTrades,
    refreshMyOrders,
    cancelOrder,
  } = useOrderBook(marketId);

  // Fetch market meta
  const fetchMarketMeta = useCallback(async () => {
    if (!marketId) return;
    setMarketLoading(true);
    setMarketError(null);
    try {
      const allMarkets = await apiClient.getMarkets();
      const current = allMarkets.find(
        (m) => m.id.toLowerCase() === marketId.toLowerCase()
      );
      if (current) {
        setMarket(current);
      } else {
        setMarketError(`Market "${marketId}" not found on exchange.`);
      }
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : 'Failed to fetch market details');
    } finally {
      setMarketLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchMarketMeta();
  }, [fetchMarketMeta]);

  const handleSelectPrice = (priceMinor: number) => {
    setSelectedPriceMinor(priceMinor);
  };

  const handleOrderSuccess = () => {
    refreshBook();
    refreshTrades();
    refreshMyOrders();
  };

  if (marketLoading) {
    return (
      <div className="trading-loading-screen">
        <div className="spinner" />
        <p>Loading market data and Level-2 order book...</p>
      </div>
    );
  }

  if (marketError || !market) {
    return (
      <div className="trading-error-container">
        <ErrorBanner message={marketError || 'Market does not exist.'} onRetry={fetchMarketMeta} />
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/" className="btn-empty-action">
            ← Return to Markets
          </Link>
        </div>
      </div>
    );
  }

  const collarCeilingMinor = Math.floor((market.faceValueMinor * market.capPercent) / 100);

  return (
    <div className="trading-screen-container">
      {/* Top Ticker Bar */}
      <div className="ticker-bar">
        <div className="ticker-left">
          <Link to="/" className="back-link" title="Return to markets list">
            ← All Markets
          </Link>
          <div className="ticker-market-name">
            <h2>{market.name}</h2>
            <span className="ticker-badge">L2 ORDER BOOK</span>
          </div>
        </div>

        <div className="ticker-metrics">
          <div className="ticker-stat">
            <span className="ticker-stat-label">Last Execution</span>
            <span
              className={`ticker-stat-val ${
                lastTradeChange === 'UP'
                  ? 'text-bid'
                  : lastTradeChange === 'DOWN'
                  ? 'text-ask'
                  : ''
              }`}
            >
              {lastTradePrice ? formatMoney(lastTradePrice) : 'No trades yet'}
            </span>
          </div>

          <div className="ticker-stat">
            <span className="ticker-stat-label">Face Value</span>
            <span className="ticker-stat-val">{formatMoney(market.faceValueMinor)}</span>
          </div>

          <div className="ticker-stat">
            <span className="ticker-stat-label">Anti-Scalp Ceiling ({market.capPercent}%)</span>
            <span className="ticker-stat-val text-warning">{formatMoney(collarCeilingMinor)}</span>
          </div>

          <div className="ticker-stat">
            <span className="ticker-stat-label">Status</span>
            <span className="ticker-stat-val text-bid">● {market.status}</span>
          </div>
        </div>
      </div>

      {bookError && <ErrorBanner message={bookError} onRetry={refreshBook} />}

      {/* 3-Column Trading Screen Grid */}
      <div className="trading-grid-layout">
        {/* Column 1: Level 2 Order Book Ladder */}
        <section className="trading-column col-ladder">
          <L2Ladder
            bids={book.bids}
            asks={book.asks}
            onSelectPrice={handleSelectPrice}
            faceValueMinor={market.faceValueMinor}
            capPercent={market.capPercent}
          />
        </section>

        {/* Column 2: Center - Depth Chart + Place Order Form + Resting Orders Strip */}
        <section className="trading-column col-center">
          {/* Depth Chart */}
          <div className="center-card depth-chart-box">
            <DepthChart book={book} height={240} />
          </div>

          {/* Place Order Form */}
          <div className="center-card order-form-box">
            <OrderForm
              market={market}
              selectedPriceMinor={selectedPriceMinor}
              onOrderSuccess={handleOrderSuccess}
            />
          </div>

          {/* User's Resting Orders Strip */}
          <div className="center-card my-orders-box">
            <MyOpenOrders orders={myMarketOrders} onCancel={cancelOrder} />
          </div>
        </section>

        {/* Column 3: Recent Trades Panel */}
        <section className="trading-column col-trades">
          <TradesPanel trades={trades} />
        </section>
      </div>
    </div>
  );
};
