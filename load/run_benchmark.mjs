import http from 'http';
import { createApp } from '../apps/api/dist/app.js';
import { mockStore, DEMO_MARKETS } from '../apps/api/dist/db/index.js';
import { BookManager } from '../apps/api/dist/engine/book-manager.js';
import { MarketSequencer } from '../apps/api/dist/engine/sequencer.js';
import os from 'os';

async function runBenchmark() {
  mockStore.reset();
  BookManager.getInstance().clear();
  MarketSequencer.getInstance().clear();

  const app = createApp();
  const server = http.createServer(app);

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Benchmark server running on ${baseUrl}`);

  // 1. Pre-register 10 Virtual Users (VUs) and obtain JWTs
  const vus = [];
  const NUM_VUS = 10;
  for (let i = 0; i < NUM_VUS; i++) {
    const email = `bench_vu_${i}@relicbourse.com`;
    const password = 'Password123!';

    await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    vus.push({ id: i, email, token: loginData.token, placedOrderIds: [] });
  }

  console.log(`Pre-registered ${vus.length} virtual users. Starting mixed workload test...`);

  // Mixed workload: 70% Limit orders, 10% Market orders, 10% Cancels, 10% Book reads
  const TOTAL_REQUESTS = 1000;
  const CONCURRENCY = 10;
  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  const marketId = DEMO_MARKETS[0].id;
  const faceValue = DEMO_MARKETS[0].faceValueMinor;
  const capPercent = DEMO_MARKETS[0].capPercent;
  const maxPrice = Math.floor((faceValue * capPercent) / 100);
  const minPrice = Math.floor(faceValue * 0.8);

  const startTime = Date.now();

  async function worker(vu) {
    while (latencies.length + failedRequests < TOTAL_REQUESTS) {
      const opIndex = latencies.length + failedRequests;
      if (opIndex >= TOTAL_REQUESTS) break;

      const roll = Math.random();
      const reqStart = performance.now();
      let ok = false;

      try {
        if (roll < 0.70) {
          // Limit Order
          const price = Math.floor(minPrice + Math.random() * (maxPrice - minPrice));
          const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
          const qty = 1;
          const idempotencyKey = `bench-${vu.id}-${Math.random().toString(36).substring(2)}-${Date.now()}`;

          const res = await fetch(`${baseUrl}/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${vu.token}`,
            },
            body: JSON.stringify({ marketId, side, type: 'LIMIT', price, qty, idempotencyKey }),
          });

          if (res.status === 201 || res.status === 200) {
            ok = true;
            const data = await res.json();
            if (data?.order?.id) vu.placedOrderIds.push(data.order.id);
          }
        } else if (roll < 0.80) {
          // Market Order
          const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
          const qty = 1;
          const idempotencyKey = `bench-mkt-${vu.id}-${Math.random().toString(36).substring(2)}-${Date.now()}`;

          const res = await fetch(`${baseUrl}/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${vu.token}`,
            },
            body: JSON.stringify({ marketId, side, type: 'MARKET', qty, idempotencyKey }),
          });

          if (res.status === 201 || res.status === 200 || res.status === 400) {
            ok = true;
          }
        } else if (roll < 0.90) {
          // Cancel
          if (vu.placedOrderIds.length > 0) {
            const orderId = vu.placedOrderIds.pop();
            const res = await fetch(`${baseUrl}/orders/${orderId}/cancel`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${vu.token}` },
            });
            if (res.status === 200 || res.status === 400) ok = true;
          } else {
            const res = await fetch(`${baseUrl}/markets/${marketId}/book`);
            if (res.status === 200) ok = true;
          }
        } else {
          // Book read
          const res = await fetch(`${baseUrl}/markets/${marketId}/book`);
          if (res.status === 200) ok = true;
        }

        const reqEnd = performance.now();
        latencies.push(reqEnd - reqStart);
        if (ok) {
          successfulRequests++;
        } else {
          failedRequests++;
        }
      } catch (err) {
        failedRequests++;
      }
    }
  }

  // Run workers concurrently
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(vus[i % vus.length]));
  await Promise.all(workers);

  const totalDurationSec = (Date.now() - startTime) / 1000;
  server.close();

  // Calculate percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)]?.toFixed(2) || 'N/A';
  const p95 = latencies[Math.floor(latencies.length * 0.95)]?.toFixed(2) || 'N/A';
  const p99 = latencies[Math.floor(latencies.length * 0.99)]?.toFixed(2) || 'N/A';
  const throughput = (latencies.length / totalDurationSec).toFixed(2);
  const errorRate = ((failedRequests / (successfulRequests + failedRequests)) * 100).toFixed(2);

  console.log(`\n================ REAL BENCHMARK RESULTS ================`);
  console.log(`Requests processed : ${latencies.length}`);
  console.log(`Duration           : ${totalDurationSec.toFixed(2)} s`);
  console.log(`Throughput         : ${throughput} reqs/sec`);
  console.log(`Error rate         : ${errorRate}%`);
  console.log(`Latency p50        : ${p50} ms`);
  console.log(`Latency p95        : ${p95} ms`);
  console.log(`Latency p99        : ${p99} ms`);
  console.log(`Machine            : ${os.type()} ${os.release()} ${os.arch()} (${os.cpus()[0]?.model})`);
  console.log(`========================================================\n`);

  return {
    throughput,
    p50,
    p95,
    p99,
    errorRate,
    machine: `${os.type()} ${os.arch()}, ${os.cpus()[0]?.model}`,
    requests: latencies.length,
    durationSec: totalDurationSec.toFixed(2),
  };
}

runBenchmark().catch(console.error);
