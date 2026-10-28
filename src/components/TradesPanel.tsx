// Recent Trades Panel for RelicBourse
// Displays execution tape with color changes vs previous trades and entry flash animations

import React from 'react';
import { TradeView } from '../types';
import { formatMoney, formatTradeTime } from '../utils/format';

interface TradesPanelProps {
  trades: TradeView[];
}

export const TradesPanel: React.FC<TradesPanelProps> = ({ trades }) => {
  return (
    <div className="trades-panel-container">
      <div className="trades-header">
        <span className="trades-title">Recent Trades</span>
        <span className="trades-count">{trades.length} executions</span>
      </div>

      <div className="trades-columns-header">
        <span className="col-time">Time</span>
        <span className="col-price">Price (₹)</span>
        <span className="col-qty">Size</span>
      </div>

      <div className="trades-tape">
        {trades.length === 0 ? (
          <div className="trades-empty-state">No trades executed yet</div>
        ) : (
          trades.slice(0, 35).map((trade, idx) => {
            // Compare price against subsequent trade in time (i.e. trades[idx + 1])
            const prevTrade = trades[idx + 1];
            let priceClass = 'text-neutral';
            if (prevTrade) {
              if (trade.priceMinor > prevTrade.priceMinor) {
                priceClass = 'text-bid'; // Price ticked up
              } else if (trade.priceMinor < prevTrade.priceMinor) {
                priceClass = 'text-ask'; // Price ticked down
              }
            }

            return (
              <div
                key={trade.id || `trade-${idx}`}
                className={`trade-row ${idx === 0 ? 'trade-row-flash' : ''}`}
              >
                <span className="col-time">{formatTradeTime(trade.createdAt)}</span>
                <span className={`col-price ${priceClass}`}>
                  {formatMoney(trade.priceMinor)}
                </span>
                <span className="col-qty">{trade.qty.toLocaleString()}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
