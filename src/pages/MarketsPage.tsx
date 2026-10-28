// Markets Home Page for RelicBourse (Route: /)
// Displays active secondary markets, face values, anti-scalping caps, and best bid/ask spreads

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Market } from '../types';
import { apiClient, getErrorMessage } from '../api/client';
import { formatMoney } from '../utils/format';
import { EmptyState, ErrorBanner } from '../components/EmptyState';

export const MarketsPage: React.FC = () => {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMarkets();
      setMarkets(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
  }, [fetchMarkets]);

  return (
    <div className="markets-page-container">
      <div className="page-hero">
        <div className="hero-badge">THE DARKHOLD SECONDARY ORDER BOOK</div>
        <h1 className="hero-title">Live Festival Pass & Merch Markets</h1>
        <p className="hero-subtitle">
          Protected secondary trading with automated anti-scalping price collars, atomic multi-table settlement, and verified escrow custody.
        </p>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchMarkets} />}

      {isLoading ? (
        <div className="markets-loading-state">
          <div className="spinner" />
          <p>Syncing active order books from RelicBourse engine...</p>
        </div>
      ) : markets.length === 0 ? (
        <EmptyState
          icon="🎪"
          title="No Markets Available"
          description="There are currently no active markets registered on the exchange."
          actionText="Refresh Engine"
          onAction={fetchMarkets}
        />
      ) : (
        <div className="markets-grid">
          {markets.map((mkt) => {
            const collarCapMinor = Math.floor((mkt.faceValueMinor * mkt.capPercent) / 100);
            const spreadMinor =
              mkt.bestBid && mkt.bestAsk ? mkt.bestAsk - mkt.bestBid : null;

            return (
              <div key={mkt.id} className="market-card">
                <div className="market-card-header">
                  <div className="market-status-row">
                    <span className="badge-market-active">● {mkt.status}</span>
                    <span className="badge-collar">Collar: max {mkt.capPercent}%</span>
                  </div>
                  <h3 className="market-card-title">{mkt.name}</h3>
                </div>

                <div className="market-card-metrics">
                  <div className="metric-box">
                    <span className="metric-label">Face Value</span>
                    <span className="metric-val">{formatMoney(mkt.faceValueMinor)}</span>
                  </div>

                  <div className="metric-box">
                    <span className="metric-label">Price Ceiling (Cap)</span>
                    <span className="metric-val text-warning">
                      {formatMoney(collarCapMinor)}
                    </span>
                  </div>

                  <div className="metric-box">
                    <span className="metric-label">Best Bid</span>
                    <span className="metric-val text-bid">
                      {mkt.bestBid ? formatMoney(mkt.bestBid) : 'None'}
                    </span>
                  </div>

                  <div className="metric-box">
                    <span className="metric-label">Best Ask</span>
                    <span className="metric-val text-ask">
                      {mkt.bestAsk ? formatMoney(mkt.bestAsk) : 'None'}
                    </span>
                  </div>
                </div>

                <div className="market-card-footer">
                  <div className="spread-info">
                    {spreadMinor !== null ? (
                      <span>Spread: <strong>{formatMoney(spreadMinor)}</strong></span>
                    ) : (
                      <span className="text-muted">Spread: Open</span>
                    )}
                  </div>
                  <Link to={`/market/${mkt.id}`} className="btn-trade-market">
                    Open Order Book →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
