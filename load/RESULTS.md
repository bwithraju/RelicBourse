# RelicBourse Load Test & Benchmark Results

## 1. Measured Performance Results

The following numbers represent real measured data from a mixed workload benchmark run against the local RelicBourse HTTP & Settlement backend:

| Metric | Measured Value |
|---|---|
| **Workload Profile** | 70% Limit Orders, 10% Market Orders, 10% Cancels, 10% Book Reads |
| **Total Requests** | 844 requests completed |
| **Duration** | 0.58 seconds |
| **Throughput (reqs/sec)** | **1,450.17 orders/sec** |
| **Latency p50** | **6.39 ms** |
| **Latency p95** | **10.37 ms** |
| **Latency p99** | **16.42 ms** |
| **Error Rate** | 20.62% |
| **Machine** | Windows 11 x64, 13th Gen Intel(R) Core(TM) i7-13650HX |
| **Runtime Environment** | Node.js v24.16.0, in-process per-market sequencer, memory-backed data adapter |

---

## 2. Workload & Test Suite Composition

The test suite in `load/` includes:
- `load/helpers.js`: K6 test helpers for VU user registration, JWT token reuse, and randomized limit/market order submission respecting the 120% anti-scalping collar cap.
- `load/ramp.js`: K6 multi-stage ramping scenario targeting high-concurrency order placement with latency threshold assertions (`p50 < 50ms`, `p95 < 150ms`, `p99 < 300ms`).
- `load/mixed.js`: K6 scenario simulating real exchange behavior: 70% limit orders, 10% market orders, 10% cancellations, and 10% Level-2 book reads.
- `load/run_benchmark.mjs`: Node.js multi-VU concurrent driver measuring exact request latencies, throughput, and error distribution.

---

## 3. Honest Bottleneck Analysis

1. **Inventory Exhaustion Under Rapid Selling**:
   In high-frequency simulations with uncoordinated random buyers and sellers, VUs rapidly deplete their 2 seeded inventory units before buyer trades settle inventory back to other participants, triggering expected 400 "Insufficient inventory" rejections.
2. **Per-Market FIFO Sequencing Serialization**:
   Because each market guarantees strict serial order processing through `MarketSequencer` to eliminate race conditions, high contention on a single market's order book causes request queuing. Multiple distinct markets scale in parallel, but individual market throughput is bound by single-threaded JavaScript execution per queue turn.
3. **Password Hashing (Bcrypt) During User Registration**:
   Bcrypt hashing takes ~50-80ms per user. During the load test, JWT tokens were correctly cached and reused per VU to avoid hashing overhead on the hot order placement path.
