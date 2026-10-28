import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:4000';
export const DEMO_MARKET_ID = 'market-culrav-2026';
export const DEMO_FACE_VALUE = 200000;
export const DEMO_CAP_PERCENT = 120; // max allowed: 240,000 paise

/**
 * Registers or logs in a VU, returning a reusable JWT token.
 */
export function getAuthToken(vuId) {
  const email = `vu_${vuId}_${Date.now()}@relicbourse.com`;
  const password = 'BenchmarkPassword123!';

  // 1. Register
  const regPayload = JSON.stringify({ email, password });
  const regParams = { headers: { 'Content-Type': 'application/json' } };
  const regRes = http.post(`${BASE_URL}/auth/register`, regPayload, regParams);

  // 2. Login to obtain 24h JWT
  const loginPayload = JSON.stringify({ email, password });
  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, regParams);

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'jwt token present': (r) => !!r.json('token'),
  });

  return loginRes.json('token');
}

/**
 * Places a random limit order within the anti-scalping collar.
 */
export function placeRandomLimitOrder(token, marketId = DEMO_MARKET_ID) {
  const maxPrice = Math.floor((DEMO_FACE_VALUE * DEMO_CAP_PERCENT) / 100);
  const minPrice = Math.floor(DEMO_FACE_VALUE * 0.8);
  const price = Math.floor(minPrice + Math.random() * (maxPrice - minPrice));
  const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
  const qty = Math.floor(1 + Math.random() * 2);
  const idempotencyKey = `k6-ord-${Math.random().toString(36).substring(2)}-${Date.now()}`;

  const payload = JSON.stringify({
    marketId,
    side,
    type: 'LIMIT',
    price,
    qty,
    idempotencyKey,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };

  return http.post(`${BASE_URL}/orders`, payload, params);
}

/**
 * Places a market order.
 */
export function placeMarketOrder(token, marketId = DEMO_MARKET_ID) {
  const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
  const qty = 1;
  const idempotencyKey = `k6-mkt-${Math.random().toString(36).substring(2)}-${Date.now()}`;

  const payload = JSON.stringify({
    marketId,
    side,
    type: 'MARKET',
    qty,
    idempotencyKey,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };

  return http.post(`${BASE_URL}/orders`, payload, params);
}

/**
 * Cancels an order.
 */
export function cancelOrder(token, orderId) {
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
  return http.post(`${BASE_URL}/orders/${orderId}/cancel`, null, params);
}

/**
 * Reads Level-2 order book.
 */
export function getBook(marketId = DEMO_MARKET_ID) {
  return http.get(`${BASE_URL}/markets/${marketId}/book`);
}
