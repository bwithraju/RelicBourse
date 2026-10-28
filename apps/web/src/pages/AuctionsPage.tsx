// Dutch Auctions Page for RelicBourse (Route: /auctions)
// Lists active and completed Dutch auctions + Create Auction form for inventory holders

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Auction, CreateAuctionPayload } from '../types';
import { apiClient, getErrorMessage } from '../api/client';
import { wsClient } from '../ws/client';
import { useAuth } from '../context/AuthContext';
import { formatMoney, parseToMinor } from '../utils/format';
import { EmptyState, ErrorBanner } from '../components/EmptyState';

export const AuctionsPage: React.FC = () => {
  const { portfolio, refreshPortfolio } = useAuth();

  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Create auction form state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [startPriceInput, setStartPriceInput] = useState<string>('');
  const [floorPriceInput, setFloorPriceInput] = useState<string>('');
  const [decrementInput, setDecrementInput] = useState<string>('');
  const [intervalSecInput, setIntervalSecInput] = useState<string>('5');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchAuctions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getAuctions();
      setAuctions(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuctions();

    // Listen for auction tick and ended events
    const unsub = wsClient.addEventListener((event) => {
      if (event.type === 'auction_tick') {
        setAuctions((prev) =>
          prev.map((auc) =>
            auc.id === event.auctionId
              ? { ...auc, currentPriceMinor: event.currentPriceMinor }
              : auc
          )
        );
      } else if (event.type === 'auction_ended') {
        setAuctions((prev) =>
          prev.map((auc) =>
            auc.id === event.auctionId
              ? {
                  ...auc,
                  status: 'ENDED',
                  winnerUserId: event.winnerUserId,
                  currentPriceMinor: event.finalPriceMinor ?? auc.currentPriceMinor,
                }
              : auc
          )
        );
      }
    });

    return () => {
      unsub();
    };
  }, [fetchAuctions]);

  // Markets user holds inventory of
  const availableInventory = useMemo(() => {
    if (!portfolio?.inventory) return [];
    return portfolio.inventory.filter((inv) => inv.quantity - inv.reservedQty > 0);
  }, [portfolio]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!selectedMarketId) {
      setCreateError('Please select a market asset from your inventory.');
      return;
    }

    const startMinor = parseToMinor(startPriceInput);
    const floorMinor = parseToMinor(floorPriceInput);
    const decMinor = parseToMinor(decrementInput);
    const interval = parseInt(intervalSecInput, 10);

    if (startMinor <= 0 || floorMinor <= 0 || decMinor <= 0 || isNaN(interval) || interval < 1) {
      setCreateError('All prices and intervals must be positive valid amounts.');
      return;
    }

    if (startMinor <= floorMinor) {
      setCreateError('Starting price must be strictly higher than the floor price.');
      return;
    }

    setIsCreating(true);
    try {
      const payload: CreateAuctionPayload = {
        marketId: selectedMarketId,
        startPriceMinor: startMinor,
        floorPriceMinor: floorMinor,
        decrementMinor: decMinor,
        intervalSec: interval,
      };

      const newAuc = await apiClient.createAuction(payload);
      setCreateSuccess(`Auction "${newAuc.id}" created successfully! Now ticking on server clock.`);
      await fetchAuctions();
      await refreshPortfolio();
      setShowCreateModal(false);
      // Reset form
      setStartPriceInput('');
      setFloorPriceInput('');
      setDecrementInput('');
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="auctions-page-container">
      <div className="page-header">
        <div className="page-header-title">
          <h1>Dutch Auctions Desk</h1>
          <p className="page-header-subtitle">
            Reverse-decay auctions: price descends automatically every interval. First bidder wins atomically.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-primary-action"
            onClick={() => setShowCreateModal(true)}
          >
            + Create Dutch Auction
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchAuctions} />}
      {createSuccess && (
        <div className="success-banner" role="alert">
          <div className="success-body">{createSuccess}</div>
        </div>
      )}

      {/* Create Auction Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Create Dutch Auction</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="error-banner" role="alert">
                <div className="error-body">{createError}</div>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Asset from Your Inventory</label>
                {availableInventory.length === 0 ? (
                  <div className="form-helper-text text-warning">
                    You have 0 available inventory to auction. Acquire passes via trading first.
                  </div>
                ) : (
                  <select
                    className="select-input"
                    value={selectedMarketId}
                    onChange={(e) => setSelectedMarketId(e.target.value)}
                    required
                  >
                    <option value="">Select an asset...</option>
                    {availableInventory.map((inv) => (
                      <option key={inv.marketId} value={inv.marketId}>
                        {inv.marketName || inv.marketId} ({inv.quantity - inv.reservedQty} available)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Start Price (₹)</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. 18000"
                    value={startPriceInput}
                    onChange={(e) => setStartPriceInput(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Floor Price (₹)</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. 12000"
                    value={floorPriceInput}
                    onChange={(e) => setFloorPriceInput(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Price Decrement (₹ / tick)</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. 500"
                    value={decrementInput}
                    onChange={(e) => setDecrementInput(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Interval (Seconds / tick)</label>
                  <input
                    type="number"
                    min="1"
                    className="text-input"
                    value={intervalSecInput}
                    onChange={(e) => setIntervalSecInput(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-action"
                  disabled={isCreating || availableInventory.length === 0}
                >
                  {isCreating ? 'Creating Auction...' : 'Launch Dutch Auction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auction Cards Grid */}
      {isLoading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Syncing Dutch auction order streams...</p>
        </div>
      ) : auctions.length === 0 ? (
        <EmptyState
          icon="⏳"
          title="No Active Auctions"
          description="There are currently no Dutch auctions running. Launch one using festival inventory!"
          actionText="+ Launch First Auction"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="auctions-grid">
          {auctions.map((auc) => {
            const isRunning = auc.status === 'RUNNING';
            // Compute percentage progressed towards floor
            const totalDrop = auc.startPriceMinor - auc.floorPriceMinor;
            const currentDrop = auc.startPriceMinor - auc.currentPriceMinor;
            const progressPercent =
              totalDrop > 0 ? Math.min(100, Math.max(0, Math.round((currentDrop / totalDrop) * 100))) : 0;

            return (
              <div key={auc.id} className={`auction-card ${isRunning ? 'running' : 'ended'}`}>
                <div className="auction-card-header">
                  <span className={`badge-auction-status ${auc.status.toLowerCase()}`}>
                    ● {auc.status}
                  </span>
                  <span className="auction-decay-rate">
                    -{formatMoney(auc.decrementMinor)} / {auc.intervalSec}s
                  </span>
                </div>

                <h3 className="auction-asset-title">{auc.marketName || auc.marketId}</h3>
                <div className="auction-id-tag">ID: {auc.id}</div>

                {/* Big Live Price Display */}
                <div className="auction-price-highlight">
                  <span className="price-sub">Current Price</span>
                  <div className="price-big text-bid animate-tick">
                    {formatMoney(auc.currentPriceMinor)}
                  </div>
                </div>

                {/* Progress bar towards floor */}
                <div className="auction-progress-container">
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="progress-labels">
                    <span>Start: {formatMoney(auc.startPriceMinor)}</span>
                    <span>Floor: {formatMoney(auc.floorPriceMinor)}</span>
                  </div>
                </div>

                <div className="auction-card-footer">
                  <Link to={`/auctions/${auc.id}`} className="btn-enter-auction">
                    {isRunning ? 'Enter Live Auction & Bid →' : 'View Auction Result →'}
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
