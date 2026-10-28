import { check, sleep } from 'k6';
import { getAuthToken, placeRandomLimitOrder } from './helpers.js';

export const options = {
  stages: [
    { duration: '15s', target: 20 },   // Warm-up ramp
    { duration: '30s', target: 100 },  // Moderate throughput
    { duration: '30s', target: 300 },  // High load
    { duration: '30s', target: 800 },  // Peak load toward ~1000 orders/sec
    { duration: '15s', target: 0 },    // Cool-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // error rate < 5%
    http_req_duration: ['p(50)<50', 'p(95)<150', 'p(99)<300'], // ms latency
  },
};

let vuToken = null;

export function setup() {
  console.log('Initiating RelicBourse Ramp Load Test...');
}

export default function () {
  if (!vuToken) {
    vuToken = getAuthToken(__VU);
  }

  const res = placeRandomLimitOrder(vuToken);
  check(res, {
    'order accepted': (r) => r.status === 201 || r.status === 200,
  });

  // Short pause between iterations per virtual user
  sleep(0.01);
}
