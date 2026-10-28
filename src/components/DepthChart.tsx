// Custom Canvas Depth Chart for RelicBourse
// Strictly NO external chart libraries. DevicePixelRatio-aware, high-performance visual depth.

import React, { useRef, useEffect } from 'react';
import { BookSnapshot } from '../types';
import { formatMoney } from '../utils/format';

interface DepthChartProps {
  book: BookSnapshot;
  height?: number;
}

export const DepthChart: React.FC<DepthChartProps> = ({ book, height = 260 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 600;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 10;
    const padRight = 10;
    const padTop = 20;
    const padBottom = 28;
    const chartWidth = width - padLeft - padRight;
    const chartHeight = height - padTop - padBottom;

    // Check if book has data
    const hasBids = book.bids && book.bids.length > 0;
    const hasAsks = book.asks && book.asks.length > 0;

    if (!hasBids && !hasAsks) {
      // Empty state
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop + chartHeight);
      ctx.lineTo(width - padRight, padTop + chartHeight);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No resting orders in book yet', width / 2, height / 2);
      ctx.restore();
      return;
    }

    // Calculate cumulative bid depth (bids are sorted high -> low)
    // For bids, as price decreases (moves left), cumulative volume accumulates
    const bidPoints: { price: number; cumQty: number }[] = [];
    let cumBid = 0;
    for (let i = 0; i < book.bids.length; i++) {
      cumBid += book.bids[i].qty;
      bidPoints.push({ price: book.bids[i].price, cumQty: cumBid });
    }

    // Calculate cumulative ask depth (asks are sorted low -> high)
    // For asks, as price increases (moves right), cumulative volume accumulates
    const askPoints: { price: number; cumQty: number }[] = [];
    let cumAsk = 0;
    for (let i = 0; i < book.asks.length; i++) {
      cumAsk += book.asks[i].qty;
      askPoints.push({ price: book.asks[i].price, cumQty: cumAsk });
    }

    const minBidPrice = hasBids ? bidPoints[bidPoints.length - 1].price : 0;
    const maxBidPrice = hasBids ? bidPoints[0].price : 0;
    const minAskPrice = hasAsks ? askPoints[0].price : 0;
    const maxAskPrice = hasAsks ? askPoints[askPoints.length - 1].price : 0;

    const minPrice = hasBids ? (hasAsks ? Math.min(minBidPrice, minAskPrice * 0.95) : minBidPrice * 0.95) : minAskPrice * 0.95;
    const maxPrice = hasAsks ? (hasBids ? Math.max(maxAskPrice, maxBidPrice * 1.05) : maxAskPrice * 1.05) : maxBidPrice * 1.05;
    const priceRange = maxPrice - minPrice || 1;

    const maxCumQty = Math.max(cumBid, cumAsk, 1) * 1.15; // 15% headroom

    const priceToX = (p: number) => {
      return padLeft + ((p - minPrice) / priceRange) * chartWidth;
    };

    const qtyToY = (q: number) => {
      return padTop + chartHeight - (q / maxCumQty) * chartHeight;
    };

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = padTop + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      const labelQty = Math.round(maxCumQty * (1 - i / 4));
      ctx.fillStyle = '#475569';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(labelQty.toString(), padLeft + 4, y - 4);
    }

    // Mid price line
    if (hasBids && hasAsks) {
      const midPrice = (maxBidPrice + minAskPrice) / 2;
      const midX = priceToX(midPrice);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(midX, padTop);
      ctx.lineTo(midX, padTop + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MID ' + formatMoney(midPrice), midX, padTop - 6);
    }

    // Draw Bid Depth (Green area on the left)
    if (hasBids && bidPoints.length > 0) {
      const baseBidY = padTop + chartHeight;
      ctx.beginPath();
      // Start from bottom left at lowest bid price
      const startX = priceToX(bidPoints[bidPoints.length - 1].price);
      ctx.moveTo(startX, baseBidY);

      // Draw steps moving towards highest bid price
      for (let i = bidPoints.length - 1; i >= 0; i--) {
        const pt = bidPoints[i];
        const x = priceToX(pt.price);
        const y = qtyToY(pt.cumQty);
        ctx.lineTo(x, y);
      }

      // Close path to mid price / highest bid at bottom
      const endX = priceToX(bidPoints[0].price);
      ctx.lineTo(endX, baseBidY);
      ctx.closePath();

      // Fill Green Gradient
      const bidGrad = ctx.createLinearGradient(0, padTop, 0, baseBidY);
      bidGrad.addColorStop(0, 'rgba(16, 185, 129, 0.40)');
      bidGrad.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
      ctx.fillStyle = bidGrad;
      ctx.fill();

      // Stroke Line
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = bidPoints.length - 1; i >= 0; i--) {
        const pt = bidPoints[i];
        const x = priceToX(pt.price);
        const y = qtyToY(pt.cumQty);
        if (i === bidPoints.length - 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw Ask Depth (Red area on the right)
    if (hasAsks && askPoints.length > 0) {
      const baseAskY = padTop + chartHeight;
      ctx.beginPath();
      // Start from lowest ask price at baseline
      const startX = priceToX(askPoints[0].price);
      ctx.moveTo(startX, baseAskY);

      // Draw steps moving towards highest ask price
      for (let i = 0; i < askPoints.length; i++) {
        const pt = askPoints[i];
        const x = priceToX(pt.price);
        const y = qtyToY(pt.cumQty);
        ctx.lineTo(x, y);
      }

      // Close path to highest ask price at bottom
      const endX = priceToX(askPoints[askPoints.length - 1].price);
      ctx.lineTo(endX, baseAskY);
      ctx.closePath();

      // Fill Red Gradient
      const askGrad = ctx.createLinearGradient(0, padTop, 0, baseAskY);
      askGrad.addColorStop(0, 'rgba(244, 63, 94, 0.40)');
      askGrad.addColorStop(1, 'rgba(244, 63, 94, 0.05)');
      ctx.fillStyle = askGrad;
      ctx.fill();

      // Stroke Line
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < askPoints.length; i++) {
        const pt = askPoints[i];
        const x = priceToX(pt.price);
        const y = qtyToY(pt.cumQty);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // X-Axis Baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + chartHeight);
    ctx.lineTo(width - padRight, padTop + chartHeight);
    ctx.stroke();

    // Price Labels on X-axis
    ctx.fillStyle = '#64748b';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(formatMoney(minPrice, { showPaisa: false }), padLeft, padTop + chartHeight + 16);

    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(maxPrice, { showPaisa: false }), width - padRight, padTop + chartHeight + 16);

    ctx.restore();
  }, [book, height]);

  return (
    <div className="depth-chart-container">
      <div className="depth-chart-header">
        <span className="depth-legend-bid">● Cumulative Bids</span>
        <span className="depth-chart-title">Market Depth (L2)</span>
        <span className="depth-legend-ask">Cumulative Asks ●</span>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: `${height}px`, display: 'block' }} />
    </div>
  );
};
