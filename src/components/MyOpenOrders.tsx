// My Open Orders Strip under the order form
// Displays user's resting orders in the current market with instant cancellation

import React, { useState } from 'react';
import { Order } from '../types';
import { formatMoney, formatDateTime } from '../utils/format';

interface MyOpenOrdersProps {
  orders: Order[];
  onCancel: (orderId: string) => Promise<void>;
}

export const MyOpenOrders: React.FC<MyOpenOrdersProps> = ({ orders, onCancel }) => {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleCancelClick = async (orderId: string) => {
    try {
      setCancellingId(orderId);
      await onCancel(orderId);
    } catch (err) {
      console.error('Failed to cancel order:', err);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="my-open-orders-strip">
      <div className="strip-header">
        <span className="strip-title">My Resting Orders (This Market)</span>
        <span className="strip-count">{orders.length} active</span>
      </div>

      {orders.length === 0 ? (
        <div className="strip-empty">You have no open resting orders in this market.</div>
      ) : (
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Time</th>
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
              {orders.map((ord) => (
                <tr key={ord.id}>
                  <td>{formatDateTime(ord.createdAt)}</td>
                  <td>
                    <span className={`badge-side ${ord.side.toLowerCase()}`}>{ord.side}</span>
                  </td>
                  <td>{ord.type}</td>
                  <td className="text-mono">
                    {ord.priceMinor ? formatMoney(ord.priceMinor) : 'MARKET'}
                  </td>
                  <td>{ord.qty}</td>
                  <td>{ord.filledQty}</td>
                  <td>
                    <span className={`badge-status ${ord.status.toLowerCase()}`}>{ord.status}</span>
                  </td>
                  <td>
                    <button
                      className="btn-cancel-order"
                      disabled={cancellingId === ord.id}
                      onClick={() => handleCancelClick(ord.id)}
                    >
                      {cancellingId === ord.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
