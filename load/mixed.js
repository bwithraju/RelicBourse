import { check, sleep } from 'k6';
import {
  getAuthToken,
  placeRandomLimitOrder,
  placeMarketOrder,
  cancelOrder,
  getBook,
} from './helpers.js';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '30s', target: 80 },
    { duration: '20s', target: 150 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // error rate < 5%
    http_req_duration: ['p(50)<50', 'p(95)<150', 'p(99)<300'],
  },
};

let vuToken = null;
const placedOrderIds = [];

export default function () {
  if (!vuToken) {
    vuToken = getAuthToken(__VU);
  }

  const roll = Math.random();

  if (roll < 0.70) {
    // 70% Limit orders
    const res = placeRandomLimitOrder(vuToken);
    check(res, { 'limit order ok': (r) => r.status === 201 || r.status === 200 });
    try {
      const body = res.json();
      if (body?.order?.id) {
        placedOrderIds.push(body.order.id);
        if (placedOrderIds.length > 20) placedOrderIds.shift();
      }
    } catch (_e) {}
  } else if (roll < 0.80) {
    // 10% Market orders
    const res = placeMarketOrder(vuToken);
    check(res, { 'market order ok': (r) => r.status === 201 || r.status === 200 || r.status === 400 });
  } else if (roll < 0.90) {
    // 10% Cancels
    if (placedOrderIds.length > 0) {
      const orderIdToCancel = placedOrderIds.pop();
      const res = cancelOrder(vuToken, orderIdToCancel);
      check(res, { 'cancel order processed': (r) => r.status === 200 || r.status === 400 });
    } else {
      const res = getBook();
      check(res, { 'book read ok': (r) => r.status === 200 });
    }
  } else {
    // 10% Book reads
    const res = getBook();
    check(res, { 'book read ok': (r) => r.status === 200 });
  }

  sleep(0.01);
}
