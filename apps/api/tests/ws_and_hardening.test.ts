import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { WebSocket } from 'ws';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { WsHub } from '../src/ws/server.js';
import { mockStore, DEMO_MARKETS } from '../src/db/index.js';
import { BookManager } from '../src/engine/book-manager.js';
import { MarketSequencer } from '../src/engine/sequencer.js';
import { rateLimitConfig } from '../src/config/rate-limit.config.js';
import { clearRateLimits } from '../src/middleware/rate-limit.js';

describe('WebSocket Hub & Hardening Guards Tests (Task B4)', () => {
  let server: http.Server;
  let port: number;
  let wsUrl: string;
  const marketA = DEMO_MARKETS[0].id; // market-festival-pass
  const marketB = DEMO_MARKETS[1].id; // market-limited-merch

  beforeEach(async () => {
    mockStore.reset();
    BookManager.getInstance().clear();
    MarketSequencer.getInstance().clear();
    clearRateLimits();

    const app = createApp();
    server = http.createServer(app);
    WsHub.getInstance().init(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    WsHub.getInstance().close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  const connectWs = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  };

  it('1. subscriber receives snapshot on subscribe', async () => {
    const ws = await connectWs();

    const snapshotPromise = new Promise<any>((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'snapshot') {
          resolve(msg);
        }
      });
    });

    ws.send(JSON.stringify({ type: 'subscribe', marketId: marketA }));
    const snapshot = await snapshotPromise;

    expect(snapshot.type).toBe('snapshot');
    expect(snapshot.marketId).toBe(marketA);
    expect(Array.isArray(snapshot.bids)).toBe(true);
    expect(Array.isArray(snapshot.asks)).toBe(true);

    ws.close();
  });

  it('2. trade in market A reaches A subscribers and NOT B subscribers', async () => {
    const wsA = await connectWs();
    const wsB = await connectWs();

    // Subscribe A to marketA, B to marketB
    wsA.send(JSON.stringify({ type: 'subscribe', marketId: marketA }));
    wsB.send(JSON.stringify({ type: 'subscribe', marketId: marketB }));

    // Wait for initial snapshots
    await new Promise((r) => setTimeout(r, 100));

    const eventsA: any[] = [];
    const eventsB: any[] = [];

    wsA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'trade') eventsA.push(msg);
    });

    wsB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'trade') eventsB.push(msg);
    });

    // Broadcast a trade event specifically on marketA
    WsHub.getInstance().broadcast(marketA, [
      {
        type: 'trade',
        marketId: marketA,
        tradeId: 't-123',
        price: 200000,
        qty: 1,
        buyOrderId: 'b-1',
        sellOrderId: 's-1',
        createdAt: new Date().toISOString(),
      },
    ]);

    await new Promise((r) => setTimeout(r, 100));

    expect(eventsA).toHaveLength(1);
    expect(eventsA[0].tradeId).toBe('t-123');
    expect(eventsB).toHaveLength(0); // Market B received NOTHING!

    wsA.close();
    wsB.close();
  });

  it('3. garbage/malformed WS message keeps server alive', async () => {
    const ws = await connectWs();

    // Send malformed non-JSON garbage
    ws.send('THIS IS CORRUPT GARBAGE NOT JSON {{{');
    ws.send(Buffer.from([0x00, 0xff, 0xee, 0xdd]));
    ws.send(JSON.stringify({ invalidField: true }));

    // Verify connection remains open and server responds to valid subscribe
    await new Promise((r) => setTimeout(r, 50));
    expect(ws.readyState).toBe(WebSocket.OPEN);

    const snapshotPromise = new Promise<any>((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'snapshot') resolve(msg);
      });
    });

    ws.send(JSON.stringify({ type: 'subscribe', marketId: marketA }));
    const snapshot = await snapshotPromise;
    expect(snapshot.type).toBe('snapshot');

    ws.close();
  });

  it('4. rate limiting returns 429 when max orders exceeded', async () => {
    const app = createApp();

    // Register a test user
    const reg = await request(app).post('/auth/register').send({
      email: 'ratelimit@relicbourse.com',
      password: 'password123',
    });
    const login = await request(app).post('/auth/login').send({
      email: 'ratelimit@relicbourse.com',
      password: 'password123',
    });
    const token = login.body.token;

    // Send max allowed requests
    for (let i = 0; i < rateLimitConfig.maxOrdersPerWindow; i++) {
      await request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          marketId: marketA,
          side: 'BUY',
          type: 'LIMIT',
          price: 150000,
          qty: 1,
          idempotencyKey: `rl-order-${i}`,
        });
    }

    // Next request must trigger 429
    const breachRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        marketId: marketA,
        side: 'BUY',
        type: 'LIMIT',
        price: 150000,
        qty: 1,
        idempotencyKey: 'rl-order-breach',
      });

    expect(breachRes.status).toBe(429);
    expect(breachRes.body.error).toMatch(/Rate limit exceeded/i);
  });

  it('5. bounded queue rejects with 503 when market queue is full', async () => {
    const miniSequencer = new MarketSequencer(2); // queue limit of 2

    // Fill the queue with pending tasks
    let resolveFirst: () => void;
    const task1 = miniSequencer.enqueue(marketA, () => new Promise<void>((r) => { resolveFirst = r; }));
    const task2 = miniSequencer.enqueue(marketA, async () => 'task2');
    const task3 = miniSequencer.enqueue(marketA, async () => 'task3');

    // 4th task exceeds queue depth (limit: 2) -> throws 503
    expect(() => {
      miniSequencer.enqueue(marketA, async () => 'task4');
    }).toThrowError(/503|busy/i);

    resolveFirst!();
    await Promise.all([task1, task2, task3]);
  });
});
