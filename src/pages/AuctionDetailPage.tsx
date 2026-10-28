// Auction Detail View for RelicBourse (Route: /auctions/:id)
// Big live price ticker, decay progress bar, atomic CAS bid execution, and crystal-clear outcomes

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Auction } from '../types';
import { apiClient, getErrorMessage } from '../api/client';
import { wsClient } from '../ws/client';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../utils/format';
import { ErrorBanner } from '../components/EmptyState';

export const AuctionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const auctionId = id || '';
  const { user, portfolio, refreshPortfolio } = useAuth();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Bidding and outcome states
  const [isBidding, setIsBidding] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<{
    type: 'WON' | 'LOST' | 'ENDED_NO_WINNER';
    message: string;
    tradeId?: string;
  } | null>(null);

  // Visual tick flash animation state
  const [isTickFlashing, setIsTickFlashing] = useState<boolean>(false);

  const fetchAuction = useCallback(async () => {
    if (!auctionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getAuctionById(auctionId);
      setAuction(data);
      if (data.status === 'ENDED') {
        if (data.winnerUserId === user?.id) {
          setOutcome({
            type: 'WON',
            message: 'You won this auction! Funds are held in escrow. Confirm delivery in Portfolio to complete the trade.',
          });
        } else if (data.winnerUserId) {
          setOutcome({
            type: 'LOST',
            message: 'Auction ended — another bidder won.',
          });
        } else {
          setOutcome({
            type: 'ENDED_NO_WINNER',
            message: 'Auction ended — floor price reached with no winning bids.',
          });
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [auctionId, user?.id]);

  useEffect(() => {
    fetchAuction();

    // Listen for WebSocket ticks and ends
    const unsub = wsClient.addEventListener((event) => {
      if (event.type === 'auction_tick' && event.auctionId === auctionId) {
        setAuction((prev) => (prev ? { ...prev, currentPriceMinor: event.currentPriceMinor } : prev));
        // Trigger visual flash
        setIsTickFlashing(true);
        setTimeout(() => setIsTickFlashing(false), 300);
      } else if (event.type === 'auction_ended' && event.auctionId === auctionId) {
        setAuction((prev) =>
          prev
            ? {
                ...prev,
                status: 'ENDED',
                winnerUserId: event.winnerUserId,
                currentPriceMinor: event.finalPriceMinor ?? prev.currentPriceMinor,
              }
            : prev
        );

        if (event.winnerUserId === user?.id) {
          setOutcome({
            type: 'WON',
            message: 'You won this auction! Paying via escrow, confirm delivery in Portfolio.',
          });
        } else if (event.winnerUserId) {
          setOutcome({
            type: 'LOST',
            message: 'Auction ended — another bidder won.',
          });
        } else {
          setOutcome({
            type: 'ENDED_NO_WINNER',
            message: 'Auction ended — floor price reached with no winning bid.',
          });
        }
      }
    });

    return () => {
      unsub();
    };
  }, [auctionId, fetchAuction, user?.id]);

  // Handle Bid Click
  const handleBidClick = async () => {
    if (!auction || auction.status !== 'RUNNING') return;

    setIsBidding(true);
    setError(null);

    try {
      const res = await apiClient.bidAuction(auction.id);
      if (res.success) {
        setOutcome({
          type: 'WON',
          message: 'You won this auction! Paying via escrow, confirm delivery in Portfolio.',
          tradeId: res.tradeId,
        });
        setAuction((prev) =>
          prev ? { ...prev, status: 'ENDED', winnerUserId: user?.id || 'usr-me' } : prev
        );
        await refreshPortfolio();
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('another bidder') || msg.includes('Auction ended')) {
        setOutcome({
          type: 'LOST',
          message: 'Auction ended — another bidder won in the same tick.',
        });
        setAuction((prev) => (prev ? { ...prev, status: 'ENDED' } : prev));
      } else {
        setError(msg);
      }
    } finally {
      setIsBidding(false);
    }
  };

  // Progress computation
  const progressPercent = useMemo(() => {
    if (!auction) return 0;
    const totalDrop = auction.startPriceMinor - auction.floorPriceMinor;
    const currentDrop = auction.startPriceMinor - auction.currentPriceMinor;
    if (totalDrop <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((currentDrop / totalDrop) * 100)));
  }, [auction]);

  // Available cash check
  const availableCash = portfolio ? Math.max(0, portfolio.balanceMinor - portfolio.reservedMinor) : 0;
  const canAfford = auction ? availableCash >= auction.currentPriceMinor : false;

  if (isLoading) {
    return (
      <div className="auction-detail-loading">
        <div className="spinner" />
        <p>Connecting to Dutch auction clock stream...</p>
      </div>
    );
  }

  if (error && !auction) {
    return (
      <div className="auction-detail-container">
        <ErrorBanner message={error} onRetry={fetchAuction} />
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/auctions" className="btn-empty-action">
            ← Return to Auctions
          </Link>
        </div>
      </div>
    );
  }

  if (!auction) return null;

  const isRunning = auction.status === 'RUNNING';

  return (
    <div className="auction-detail-container">
      <div className="auction-detail-top">
        <Link to="/auctions" className="back-link">
          ← All Dutch Auctions
        </Link>
        <span className="auction-id-badge">ID: {auction.id}</span>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Outcome Banners */}
      {outcome && (
        <div
          className={`outcome-banner outcome-${outcome.type.toLowerCase()}`}
          role="status"
        >
          <div className="outcome-icon">
            {outcome.type === 'WON' ? '🏆' : outcome.type === 'LOST' ? '⏱️' : '⏹️'}
          </div>
          <div className="outcome-content">
            <h3 className="outcome-title">
              {outcome.type === 'WON'
                ? 'Bid Accepted — Winning Trade Settled!'
                : outcome.type === 'LOST'
                ? 'Auction Ended — Another Bidder Won'
                : 'Auction Concluded — No Winning Bid'}
            </h3>
            <p className="outcome-text">{outcome.message}</p>
            {outcome.type === 'WON' && (
              <div className="outcome-action">
                <Link to="/portfolio" className="btn-confirm-delivery">
                  Go to Portfolio to Confirm Delivery →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Central Auction Screen */}
      <div className="auction-screen-card">
        <div className="screen-header">
          <div className="asset-meta">
            <span className={`badge-auction-status ${auction.status.toLowerCase()}`}>
              ● {auction.status}
            </span>
            <h1 className="screen-asset-title">{auction.marketName || auction.marketId}</h1>
          </div>
          <div className="decay-meta">
            <span className="decay-label">Server Clock Rate:</span>
            <span className="decay-val">
              -{formatMoney(auction.decrementMinor)} every {auction.intervalSec}s
            </span>
          </div>
        </div>

        {/* Big Live Price Display */}
        <div className={`price-stage ${isTickFlashing ? 'price-tick-flash' : ''}`}>
          <div className="price-stage-label">Current Execution Price (Paise/Minor):</div>
          <div className="price-stage-value text-bid">
            {formatMoney(auction.currentPriceMinor)}
          </div>
          <div className="price-stage-clock">
            {isRunning ? '⏱️ Ticking live down toward floor...' : '⏹️ Auction Concluded'}
          </div>
        </div>

        {/* Progress Bar from Start to Floor */}
        <div className="auction-progress-section">
          <div className="progress-labels-row">
            <span>
              <strong>Start:</strong> {formatMoney(auction.startPriceMinor)}
            </span>
            <span className="progress-percent-label">{progressPercent}% Decayed</span>
            <span>
              <strong>Floor:</strong> {formatMoney(auction.floorPriceMinor)}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-indicator" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Bidding Controls */}
        <div className="bidding-control-section">
          <div className="buyer-solvency-info">
            <span>Your Available Balance: <strong>{formatMoney(availableCash)}</strong></span>
            {!canAfford && isRunning && (
              <span className="text-ask font-bold">
                (Insufficient funds to bid at current price)
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-large-bid"
            disabled={!isRunning || isBidding || !canAfford}
            onClick={handleBidClick}
          >
            {isBidding
              ? 'Transacting Bid...'
              : isRunning
              ? `BID NOW FOR ${formatMoney(auction.currentPriceMinor)}`
              : 'AUCTION ENDED'}
          </button>

          <p className="bid-subtext">
            * Compare-and-Swap Rule 11: The first valid bid at current price wins atomically. Two bids in the same tick cannot both win. Winning payment enters escrow.
          </p>
        </div>
      </div>
    </div>
  );
};
