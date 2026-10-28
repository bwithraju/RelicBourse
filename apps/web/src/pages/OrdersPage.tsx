// My Orders Page for RelicBourse (Route: /orders)
// Comprehensive order management with status filters (All, Open, Filled, Cancelled) and live cancellation

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Order, OrderStatus } from '../types';
import { apiClient, getErrorMessage } from '../api/client';
import { wsClient } from '../ws/client';
import { useAuth } from '../context/AuthContext';
import { formatMoney, formatDateTime } from '../utils/format';
import { EmptyState, ErrorBanner } from '../components/EmptyState';

type FilterType = 'ALL' | 'OPEN' | 'FILLED' | 'CANCELLED';

export const OrdersPage: React.FC = () => {
  const { refreshPortfolio } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMyOrders();
      setOrders(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();

    // Listen for live order updates
    const unsub = wsClient.addEventListener((event) => {
      if (event.type === 'order_update') {
        const updated = event.data;
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === updated.id);
          if (exists) {
            return prev.map((o) => (o.id === updated.id ? updated : o));
          }
          return [updated, ...prev];
        });
      }
    });

    return () => {
      unsub();
    };
  }, [fetchOrders]);

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    setActionSuccess(null);
    setError(null);
    try {
      await apiClient.cancelOrder(orderId);
      setActionSuccess(`Order ${orderId} cancelled successfully.`);
      await fetchOrders();
      await refreshPortfolio();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (filter === 'ALL') return orders;
    if (filter === 'OPEN') return orders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL');
    if (filter === 'FILLED') return orders.filter((o) => o.status === 'FILLED');
    if (filter === 'CANCELLED') return orders.filter((o) => o.status === 'CANCELLED');
    return orders;
  }, [orders, filter]);

  return (
    <div className="orders-page-container">
      <div className="page-header">
        <div className="page-header-title">
          <h1>My Order Management</h1>
          <p className="page-header-subtitle">
            Resting limit orders, market executions, partial fills, and reservation audit
          </p>
        </div>
        <button
          type="button"
          className="btn-refresh-portfolio"
          onClick={fetchOrders}
        >
          ↻ Refresh Orders
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchOrders} />}
      {actionSuccess && (
        <div className="success-banner" role="alert">
          <div className="success-body">{actionSuccess}</div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs-row">
        {(['ALL', 'OPEN', 'FILLED', 'CANCELLED'] as FilterType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`filter-tab-btn ${filter === tab ? 'active' : ''}`}
            onClick={() => setFilter(tab)}
          >
            {tab === 'OPEN' ? 'Open & Partial' : tab}
            <span className="tab-count">
              {tab === 'ALL'
                ? orders.length
                : tab === 'OPEN'
                ? orders.filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL').length
                : orders.filter((o) => o.status === (tab as OrderStatus)).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Retrieving your order ledger...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon="📋"
          title={`No ${filter === 'ALL' ? '' : filter.toLowerCase()} orders found`}
          description="Place orders directly on any market order book to view their status here."
        />
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Order ID</th>
                <th>Market</th>
                <th>Side</th>
                <th>Type</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Filled</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((ord) => {
                const isOpen = ord.status === 'OPEN' || ord.status === 'PARTIAL';
                return (
                  <tr key={ord.id}>
                    <td>{formatDateTime(ord.createdAt)}</td>
                    <td className="text-mono font-bold">{ord.id}</td>
                    <td>{ord.marketId}</td>
                    <td>
                      <span className={`badge-side ${ord.side.toLowerCase()}`}>{ord.side}</span>
                    </td>
                    <td>{ord.type}</td>
                    <td className="text-mono font-bold">
                      {ord.priceMinor ? formatMoney(ord.priceMinor) : 'MARKET'}
                    </td>
                    <td>{ord.qty}</td>
                    <td>
                      {ord.filledQty} / {ord.qty}
                    </td>
                    <td>
                      <span className={`badge-status ${ord.status.toLowerCase()}`}>
                        {ord.status}
                      </span>
                    </td>
                    <td>
                      {isOpen ? (
                        <button
                          type="button"
                          className="btn-cancel-order"
                          disabled={cancellingId === ord.id}
                          onClick={() => handleCancel(ord.id)}
                        >
                          {cancellingId === ord.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
