// Place-Order Form for RelicBourse
// Strictly enforces anti-scalping collar display, idempotency key persistence, and balance checks

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Market, OrderSide, OrderType, OrderPayload, Order } from '../types';
import { formatMoney, parseToMinor, formatMinorAmount } from '../utils/format';
import { apiClient, getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface OrderFormProps {
  market: Market;
  selectedPriceMinor?: number | null;
  onOrderSuccess: (order: Order) => void;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const OrderForm: React.FC<OrderFormProps> = ({
  market,
  selectedPriceMinor,
  onOrderSuccess,
}) => {
  const { portfolio, refreshPortfolio } = useAuth();

  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [priceInput, setPriceInput] = useState<string>('');
  const [qtyInput, setQtyInput] = useState<string>('1');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Persistent idempotency key per logical order:
  // Reused across retries / double-clicks, renewed on input change or success
  const idempotencyKeyRef = useRef<string>(generateUuid());

  // Max collar price
  const maxCollarPriceMinor = useMemo(() => {
    return Math.floor((market.faceValueMinor * market.capPercent) / 100);
  }, [market]);

  // Update price when clicked in L2 book
  useEffect(() => {
    if (selectedPriceMinor && selectedPriceMinor > 0) {
      setPriceInput(formatMinorAmount(selectedPriceMinor));
      // Regenerate idempotency key since input changed
      idempotencyKeyRef.current = generateUuid();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [selectedPriceMinor]);

  // Available cash and available inventory
  const availableBalanceMinor = useMemo(() => {
    if (!portfolio) return 0;
    return Math.max(0, portfolio.balanceMinor - portfolio.reservedMinor);
  }, [portfolio]);

  const userInventory = useMemo(() => {
    if (!portfolio?.inventory) return null;
    return portfolio.inventory.find((inv) => inv.marketId === market.id);
  }, [portfolio, market.id]);

  const availableInventoryQty = useMemo(() => {
    if (!userInventory) return 0;
    return Math.max(0, userInventory.quantity - userInventory.reservedQty);
  }, [userInventory]);

  // Parsed numerical price and quantity
  const parsedPriceMinor = useMemo(() => {
    if (type === 'MARKET') return null;
    return parseToMinor(priceInput);
  }, [priceInput, type]);

  const parsedQty = useMemo(() => {
    const q = parseInt(qtyInput, 10);
    return isNaN(q) || q < 1 ? 0 : q;
  }, [qtyInput]);

  const estimatedTotalMinor = useMemo(() => {
    if (type === 'MARKET') {
      const bestAsk = market.bestAsk || market.faceValueMinor;
      return bestAsk * parsedQty;
    }
    return (parsedPriceMinor || 0) * parsedQty;
  }, [type, parsedPriceMinor, parsedQty, market]);

  // Check collar warning locally for quick visual feedback
  const isAboveCollar = useMemo(() => {
    if (type === 'LIMIT' && parsedPriceMinor && parsedPriceMinor > maxCollarPriceMinor) {
      return true;
    }
    return false;
  }, [type, parsedPriceMinor, maxCollarPriceMinor]);

  const handlePriceChange = (val: string) => {
    setPriceInput(val);
    idempotencyKeyRef.current = generateUuid();
    setErrorMessage(null);
  };

  const handleQtyChange = (val: string) => {
    setQtyInput(val);
    idempotencyKeyRef.current = generateUuid();
    setErrorMessage(null);
  };

  const handleSideToggle = (newSide: OrderSide) => {
    setSide(newSide);
    idempotencyKeyRef.current = generateUuid();
    setErrorMessage(null);
  };

  const handleTypeToggle = (newType: OrderType) => {
    setType(newType);
    idempotencyKeyRef.current = generateUuid();
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (parsedQty <= 0) {
      setErrorMessage('Quantity must be at least 1.');
      return;
    }

    if (type === 'LIMIT' && (!parsedPriceMinor || parsedPriceMinor <= 0)) {
      setErrorMessage('Please specify a valid limit price.');
      return;
    }

    // Client safety checks (server also strictly checks)
    if (side === 'BUY' && type === 'LIMIT' && estimatedTotalMinor > availableBalanceMinor) {
      setErrorMessage(
        `Insufficient funds. Order requires ${formatMoney(estimatedTotalMinor)}, available balance is ${formatMoney(
          availableBalanceMinor
        )}.`
      );
      return;
    }

    if (side === 'SELL' && parsedQty > availableInventoryQty) {
      setErrorMessage(
        `Insufficient inventory. You have ${availableInventoryQty} available units, requested to sell ${parsedQty}.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: OrderPayload = {
        marketId: market.id,
        side,
        type,
        price: type === 'LIMIT' ? parsedPriceMinor : null,
        qty: parsedQty,
        idempotencyKey: idempotencyKeyRef.current,
      };

      const resultOrder = await apiClient.createOrder(payload);

      setSuccessMessage(
        `Order ${resultOrder.id} submitted! Status: ${resultOrder.status} (${resultOrder.filledQty}/${resultOrder.qty} filled).`
      );

      // Regenerate idempotency key for the next order
      idempotencyKeyRef.current = generateUuid();

      // Refresh parent state & portfolio
      await refreshPortfolio();
      onOrderSuccess(resultOrder);
    } catch (err) {
      // Show server errors verbatim
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="order-form-container">
      <div className="order-form-header">
        <span className="order-form-title">Place Order</span>
        <span className="idempotency-badge" title="Unique key preventing accidental duplicate submissions">
          Idempotency Active
        </span>
      </div>

      {/* Side Toggle: BUY (green) / SELL (red) */}
      <div className="side-toggle-group">
        <button
          type="button"
          className={`toggle-side-btn btn-buy ${side === 'BUY' ? 'active' : ''}`}
          onClick={() => handleSideToggle('BUY')}
        >
          BUY
        </button>
        <button
          type="button"
          className={`toggle-side-btn btn-sell ${side === 'SELL' ? 'active' : ''}`}
          onClick={() => handleSideToggle('SELL')}
        >
          SELL
        </button>
      </div>

      {/* Type Toggle: LIMIT / MARKET */}
      <div className="type-toggle-group">
        <button
          type="button"
          className={`toggle-type-btn ${type === 'LIMIT' ? 'active' : ''}`}
          onClick={() => handleTypeToggle('LIMIT')}
        >
          LIMIT
        </button>
        <button
          type="button"
          className={`toggle-type-btn ${type === 'MARKET' ? 'active' : ''}`}
          onClick={() => handleTypeToggle('MARKET')}
        >
          MARKET
        </button>
      </div>

      <form onSubmit={handleSubmit} className="order-form-body">
        {/* Price Input (disabled for MARKET) */}
        <div className="form-group">
          <label className="form-label">
            <span>Price (₹)</span>
            {type === 'LIMIT' && (
              <span className="form-sublabel">Max Collar: {formatMoney(maxCollarPriceMinor)}</span>
            )}
          </label>
          <div className="input-with-adornment">
            <span className="adornment">₹</span>
            <input
              type="text"
              className={`text-input ${isAboveCollar ? 'input-error' : ''}`}
              placeholder={type === 'MARKET' ? 'Best Market Execution' : '0.00'}
              disabled={type === 'MARKET'}
              value={type === 'MARKET' ? '' : priceInput}
              onChange={(e) => handlePriceChange(e.target.value)}
            />
          </div>
          {isAboveCollar && (
            <div className="collar-warning-text">
              ⚠ Price exceeds {market.capPercent}% cap ({formatMoney(maxCollarPriceMinor)}). Server will reject!
            </div>
          )}
        </div>

        {/* Quantity Input */}
        <div className="form-group">
          <label className="form-label">
            <span>Quantity</span>
            <span className="form-sublabel">
              {side === 'SELL'
                ? `Available Inventory: ${availableInventoryQty}`
                : `Balance: ${formatMoney(availableBalanceMinor)}`}
            </span>
          </label>
          <div className="input-with-adornment">
            <input
              type="number"
              min="1"
              step="1"
              className="text-input"
              value={qtyInput}
              onChange={(e) => handleQtyChange(e.target.value)}
            />
            <span className="adornment-unit">units</span>
          </div>
        </div>

        {/* Live Estimate Line */}
        <div className="estimate-box">
          <div className="estimate-row">
            <span className="estimate-label">Total Estimated Value:</span>
            <span className="estimate-val">{formatMoney(estimatedTotalMinor)}</span>
          </div>
          <div className="estimate-row secondary">
            <span className="estimate-label">
              {side === 'BUY' ? 'Available Cash:' : 'Available to Sell:'}
            </span>
            <span className="estimate-val">
              {side === 'BUY' ? formatMoney(availableBalanceMinor) : `${availableInventoryQty} items`}
            </span>
          </div>
        </div>

        {/* Verbatim Server Error Banner */}
        {errorMessage && (
          <div className="error-banner" role="alert">
            <div className="error-title">Submission Error</div>
            <div className="error-body">{errorMessage}</div>
          </div>
        )}

        {/* Order Success Banner */}
        {successMessage && (
          <div className="success-banner" role="alert">
            <div className="success-body">{successMessage}</div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          className={`submit-order-btn ${side === 'BUY' ? 'submit-buy' : 'submit-sell'}`}
          disabled={isSubmitting || parsedQty <= 0}
        >
          {isSubmitting
            ? 'Transacting...'
            : `${side} ${parsedQty > 0 ? parsedQty : ''} ${market.name.split(' ')[0]}`}
        </button>
      </form>
    </div>
  );
};
