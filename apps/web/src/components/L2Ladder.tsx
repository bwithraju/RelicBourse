// Level-2 Order Book Ladder for RelicBourse
// Displays price-time aggregated depth: Asks (ascending) above Spread, Bids (descending) below Spread

import React, { useMemo } from 'react';
import { Level2Entry } from '../types';
import { formatMoney } from '../utils/format';

interface L2LadderProps {
  bids: Level2Entry[];
  asks: Level2Entry[];
  onSelectPrice: (priceMinor: number) => void;
  faceValueMinor?: number;
  capPercent?: number;
}

export const L2Ladder: React.FC<L2LadderProps> = ({
  bids,
  asks,
  onSelectPrice,
  faceValueMinor,
  capPercent = 120,
}) => {
  const safeBids = useMemo(() => (Array.isArray(bids) ? bids : []), [bids]);
  const safeAsks = useMemo(() => (Array.isArray(asks) ? asks : []), [asks]);

  // Compute max qty for visual depth bars
  const maxQty = useMemo(() => {
    let max = 1;
    safeBids.forEach((b) => {
      if (b.qty > max) max = b.qty;
    });
    safeAsks.forEach((a) => {
      if (a.qty > max) max = a.qty;
    });
    return max;
  }, [safeBids, safeAsks]);

  // Asks are sorted ascending (lowest ask is asks[0]).
  // In trading ladders, we show top asks down to best ask (just above spread)
  const displayAsks = useMemo(() => {
    const slice = safeAsks.slice(0, 15);
    return [...slice].reverse(); // reverse so lowest ask sits at bottom next to spread
  }, [safeAsks]);

  const displayBids = useMemo(() => {
    return safeBids.slice(0, 15); // highest bid at top next to spread
  }, [safeBids]);

  const bestBid = safeBids[0]?.price ?? null;
  const bestAsk = safeAsks[0]?.price ?? null;
  const spreadMinor = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const spreadPercent = bestBid && spreadMinor !== null ? ((spreadMinor / bestBid) * 100).toFixed(2) : null;

  // Max cap collar indicator
  const collarCapMinor = faceValueMinor ? Math.floor((faceValueMinor * capPercent) / 100) : null;

  return (
    <div className="l2-ladder-container">
      <div className="ladder-header">
        <span className="ladder-title">Order Book (L2)</span>
        {collarCapMinor && (
          <span className="collar-badge" title="Anti-scalping collar: Orders above this price are rejected">
            Cap ({capPercent}%): {formatMoney(collarCapMinor)}
          </span>
        )}
      </div>

      <div className="ladder-columns-header">
        <span className="col-price">Price (₹)</span>
        <span className="col-qty">Quantity</span>
        <span className="col-orders">Orders</span>
      </div>

      {/* Asks (Red) */}
      <div className="ladder-asks-zone">
        {displayAsks.length === 0 ? (
          <div className="ladder-empty-state">No active asks</div>
        ) : (
          displayAsks.map((ask) => {
            const depthPercent = Math.min(100, Math.round((ask.qty / maxQty) * 100));
            return (
              <div
                key={`ask-${ask.price}`}
                className="ladder-row ask-row clickable"
                onClick={() => onSelectPrice(ask.price)}
                title={`Click to set limit price to ${formatMoney(ask.price)}`}
              >
                <div className="depth-bar ask-depth-bar" style={{ width: `${depthPercent}%` }} />
                <span className="col-price text-ask">{formatMoney(ask.price)}</span>
                <span className="col-qty">{ask.qty.toLocaleString()}</span>
                <span className="col-orders">{ask.orders}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Spread Row */}
      <div className="ladder-spread-row">
        <div className="spread-label">
          <span>SPREAD</span>
          <span className="spread-value">
            {spreadMinor !== null ? `${formatMoney(spreadMinor)} (${spreadPercent}%)` : '—'}
          </span>
        </div>
        <div className="spread-best-hint">
          {bestBid ? `Bid: ${formatMoney(bestBid)}` : 'No bid'} | {bestAsk ? `Ask: ${formatMoney(bestAsk)}` : 'No ask'}
        </div>
      </div>

      {/* Bids (Green) */}
      <div className="ladder-bids-zone">
        {displayBids.length === 0 ? (
          <div className="ladder-empty-state">No active bids</div>
        ) : (
          displayBids.map((bid) => {
            const depthPercent = Math.min(100, Math.round((bid.qty / maxQty) * 100));
            return (
              <div
                key={`bid-${bid.price}`}
                className="ladder-row bid-row clickable"
                onClick={() => onSelectPrice(bid.price)}
                title={`Click to set limit price to ${formatMoney(bid.price)}`}
              >
                <div className="depth-bar bid-depth-bar" style={{ width: `${depthPercent}%` }} />
                <span className="col-price text-bid">{formatMoney(bid.price)}</span>
                <span className="col-qty">{bid.qty.toLocaleString()}</span>
                <span className="col-orders">{bid.orders}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
