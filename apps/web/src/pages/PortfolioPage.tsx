// Portfolio Page for RelicBourse (Route: /portfolio)
// Shows balances, inventory per market, trade history, and escrow holds with delivery confirmation

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient, getErrorMessage } from '../api/client';
import { formatMoney, formatDateTime } from '../utils/format';
import { EmptyState, ErrorBanner } from '../components/EmptyState';

export const PortfolioPage: React.FC = () => {
  const { portfolio, refreshPortfolio } = useAuth();

  const [confirmingTradeId, setConfirmingTradeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    refreshPortfolio();
  }, [refreshPortfolio]);

  const handleConfirmDelivery = async (tradeId: string) => {
    setActionError(null);
    setActionSuccess(null);
    setConfirmingTradeId(tradeId);

    try {
      const res = await apiClient.confirmDelivery(tradeId);
      setActionSuccess(`Delivery confirmed for trade ${tradeId}! Status: ${res.status}. Funds released from escrow.`);
      await refreshPortfolio();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setConfirmingTradeId(null);
    }
  };

  const balanceMinor = portfolio?.balanceMinor ?? 0;
  const reservedMinor = portfolio?.reservedMinor ?? 0;
  const availableBalanceMinor = Math.max(0, balanceMinor - reservedMinor);

  const inventory = portfolio?.inventory || [];
  const trades = portfolio?.trades || [];
  const escrows = portfolio?.escrows || [];

  return (
    <div className="portfolio-page-container">
      <div className="page-header">
        <div className="page-header-title">
          <h1>Account Portfolio & Settlement</h1>
          <p className="page-header-subtitle">
            Custody balances, festival asset allocations, trade history, and escrow settlement contracts
          </p>
        </div>
        <button
          type="button"
          className="btn-refresh-portfolio"
          onClick={() => refreshPortfolio()}
        >
          ↻ Refresh Portfolio
        </button>
      </div>

      {actionError && <ErrorBanner message={actionError} />}
      {actionSuccess && (
        <div className="success-banner" role="alert">
          <div className="success-body">{actionSuccess}</div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="portfolio-cards-grid">
        <div className="portfolio-card highlight-card">
          <span className="card-label">Available Balance</span>
          <span className="card-value text-bid">{formatMoney(availableBalanceMinor)}</span>
          <span className="card-subtext">Free liquid funds for bidding & placing buy orders</span>
        </div>

        <div className="portfolio-card">
          <span className="card-label">Reserved Funds</span>
          <span className="card-value text-warning">{formatMoney(reservedMinor)}</span>
          <span className="card-subtext">Locked in active resting BUY orders or pending escrows</span>
        </div>

        <div className="portfolio-card">
          <span className="card-label">Total Account Equity</span>
          <span className="card-value">{formatMoney(balanceMinor)}</span>
          <span className="card-subtext">100% solvency audited with double-entry ledger</span>
        </div>
      </div>

      {/* Escrow Holds Section */}
      <section className="portfolio-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h2>Escrow Protection & Custody Holds</h2>
            <span className="section-badge">Rule 12 Solvency</span>
          </div>
          <span className="section-hint">
            Buyers confirm delivery to release funds to the seller
          </span>
        </div>

        {escrows.length === 0 ? (
          <EmptyState
            icon="🔒"
            title="No Active Escrow Holds"
            description="When a trade executes or you win an auction, funds are held securely in escrow until delivery confirmation."
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trade ID</th>
                  <th>Asset / Market</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {escrows.map((escrow) => {
                  const isHeld = escrow.status === 'HELD';
                  return (
                    <tr key={escrow.id}>
                      <td className="text-mono font-bold">{escrow.tradeId}</td>
                      <td>{escrow.marketName || escrow.marketId || 'Festival Pass'}</td>
                      <td className="text-mono text-bid">{formatMoney(escrow.amountMinor)}</td>
                      <td>
                        <span className={`badge-status ${escrow.status.toLowerCase()}`}>
                          {escrow.status}
                        </span>
                      </td>
                      <td>
                        <span className="badge-role">Buyer</span>
                      </td>
                      <td>
                        {isHeld ? (
                          <button
                            type="button"
                            className="btn-confirm-delivery"
                            disabled={confirmingTradeId === escrow.tradeId}
                            onClick={() => handleConfirmDelivery(escrow.tradeId)}
                          >
                            {confirmingTradeId === escrow.tradeId
                              ? 'Confirming...'
                              : 'Confirm Delivery'}
                          </button>
                        ) : (
                          <span className="text-muted">Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inventory Section */}
      <section className="portfolio-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h2>Inventory Allocation</h2>
            <span className="section-badge">Festival Passes & Merch</span>
          </div>
        </div>

        {inventory.length === 0 ? (
          <EmptyState
            icon="🎫"
            title="No Inventory Owned"
            description="You do not currently hold any festival passes or merchandise items in this account."
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Market Asset</th>
                  <th>Total Quantity</th>
                  <th>Reserved (Resting Sells)</th>
                  <th>Available to Sell</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((inv) => {
                  const available = Math.max(0, inv.quantity - inv.reservedQty);
                  return (
                    <tr key={inv.marketId}>
                      <td className="font-bold">{inv.marketName || inv.marketId}</td>
                      <td>{inv.quantity}</td>
                      <td className="text-warning">{inv.reservedQty}</td>
                      <td className="text-bid font-bold">{available} units</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Trade History Section */}
      <section className="portfolio-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h2>Execution & Trade History</h2>
            <span className="section-badge">{trades.length} Executed</span>
          </div>
        </div>

        {trades.length === 0 ? (
          <EmptyState
            icon="📜"
            title="No Trade Executions Yet"
            description="Your completed buy and sell order fills will appear here once executed by the matching engine."
          />
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Trade ID</th>
                  <th>Market</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Total Consideration</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((tr) => (
                  <tr key={tr.id}>
                    <td>{formatDateTime(tr.createdAt)}</td>
                    <td className="text-mono">{tr.id}</td>
                    <td>{tr.marketId}</td>
                    <td className="text-mono text-bid">{formatMoney(tr.priceMinor)}</td>
                    <td>{tr.qty}</td>
                    <td className="text-mono font-bold">
                      {formatMoney(tr.priceMinor * tr.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
