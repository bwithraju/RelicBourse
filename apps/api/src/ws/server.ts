import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { WsEvent } from '@relicbourse/shared';
import { BookManager } from '../engine/book-manager.js';
import { registerBroadcaster } from './broadcast.js';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  markets: Set<string>;
}

export class WsHub {
  private static instance: WsHub;
  private wss: WebSocketServer | null = null;
  private marketSubscribers = new Map<string, Set<ExtendedWebSocket>>();
  private depthDebounceTimers = new Map<string, NodeJS.Timeout>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public static getInstance(): WsHub {
    if (!WsHub.instance) {
      WsHub.instance = new WsHub();
    }
    return WsHub.instance;
  }

  /**
   * Initializes WebSocket server attached to HTTP server.
   * Path: /ws
   */
  public init(server: Server): WebSocketServer {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const pathname = request.url?.split('?')[0];
      if (pathname === '/ws') {
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.isAlive = true;
      extWs.markets = new Set();

      extWs.on('pong', () => {
        extWs.isAlive = true;
      });

      extWs.on('message', (data: Buffer | string) => {
        this.handleClientMessage(extWs, data);
      });

      extWs.on('close', () => {
        this.removeSocket(extWs);
      });

      extWs.on('error', (_err) => {
        this.removeSocket(extWs);
      });
    });

    // 30s Heartbeat: ping all clients, terminate dead sockets
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      for (const client of this.wss.clients) {
        const extWs = client as ExtendedWebSocket;
        if (extWs.isAlive === false) {
          extWs.terminate();
          continue;
        }
        extWs.isAlive = false;
        extWs.ping();
      }
    }, 30000);

    // Register active broadcaster hook
    registerBroadcaster((marketId: string, events: WsEvent[]) => {
      this.broadcast(marketId, events);
    });

    return this.wss;
  }

  private handleClientMessage(ws: ExtendedWebSocket, raw: Buffer | string): void {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'subscribe' && typeof msg.marketId === 'string') {
        const marketId = msg.marketId;
        ws.markets.add(marketId);

        let subs = this.marketSubscribers.get(marketId);
        if (!subs) {
          subs = new Set();
          this.marketSubscribers.set(marketId, subs);
        }
        subs.add(ws);

        // Immediately send full Level-2 snapshot upon subscribe/reconnect
        const book = BookManager.getInstance().getBook(marketId);
        const snapshot = book.getSnapshot();
        const snapshotEvent: any = {
          type: 'snapshot',
          marketId,
          bids: snapshot.bids,
          asks: snapshot.asks,
          data: {
            bids: snapshot.bids,
            asks: snapshot.asks,
          },
        };
        ws.send(JSON.stringify(snapshotEvent));
      } else if (msg.type === 'unsubscribe' && typeof msg.marketId === 'string') {
        ws.markets.delete(msg.marketId);
        const subs = this.marketSubscribers.get(msg.marketId);
        if (subs) {
          subs.delete(ws);
        }
      }
    } catch (_err) {
      // Malformed client messages are safely ignored; never crash the server
    }
  }

  private removeSocket(ws: ExtendedWebSocket): void {
    for (const marketId of ws.markets) {
      const subs = this.marketSubscribers.get(marketId);
      if (subs) {
        subs.delete(ws);
      }
    }
    ws.markets.clear();
  }

  /**
   * Broadcast events to subscribers of a market.
   *
   * CONTRACT:
   * This broadcast function is called ONLY AFTER the database transaction has committed.
   * Never called inside a transaction.
   *
   * Features:
   * 1. Selective isolation: events in market A are only dispatched to subscribers of market A.
   * 2. Burst coalescing: depth updates are buffered for 50ms and sent as the latest Level-2 snapshot.
   */
  public broadcast(marketId: string, events: WsEvent[]): void {
    let hasDepthUpdate = false;

    for (const event of events) {
      if (event.type === 'depth_delta') {
        hasDepthUpdate = true;
      } else {
        // Direct broadcast for trade, order_update, auction, escrow
        this.sendToSubscribers(marketId, event);
      }
    }

    if (hasDepthUpdate && marketId) {
      this.coalesceDepthUpdate(marketId);
    }
  }

  private coalesceDepthUpdate(marketId: string): void {
    // If a timer already exists for this market, the burst will be flushed by it
    if (this.depthDebounceTimers.has(marketId)) {
      return;
    }

    // Buffer for 50ms then send single coalesced snapshot
    const timer = setTimeout(() => {
      this.depthDebounceTimers.delete(marketId);
      const book = BookManager.getInstance().getBook(marketId);
      const snapshot = book.getSnapshot();
      const deltaEvent: any = {
        type: 'depth_delta',
        marketId,
        bids: snapshot.bids,
        asks: snapshot.asks,
        data: {
          bids: snapshot.bids,
          asks: snapshot.asks,
        },
      };
      this.sendToSubscribers(marketId, deltaEvent);
    }, 50);

    this.depthDebounceTimers.set(marketId, timer);
  }

  private sendToSubscribers(marketId: string, event: any): void {
    const formattedEvent = { ...event };
    if (!formattedEvent.data) {
      if (event.type === 'snapshot' || event.type === 'depth_delta') {
        formattedEvent.data = { bids: event.bids, asks: event.asks };
      } else if (event.type === 'trade') {
        formattedEvent.data = {
          id: event.tradeId,
          marketId: event.marketId,
          buyOrderId: event.buyOrderId,
          sellOrderId: event.sellOrderId,
          priceMinor: event.price,
          qty: event.qty,
          createdAt: event.createdAt,
        };
      } else if (event.type === 'order_update') {
        formattedEvent.data = {
          id: event.orderId,
          userId: event.userId,
          marketId: event.marketId,
          side: event.side,
          priceMinor: event.price,
          qty: event.qty,
          filledQty: event.filledQty,
          status: event.status,
        };
      }
    }

    const payload = JSON.stringify(formattedEvent);

    if (!marketId) {
      // Global broadcast (e.g. system escrow update or auction ended without market constraint)
      if (!this.wss) return;
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
      return;
    }

    const subs = this.marketSubscribers.get(marketId);
    if (!subs) return;

    for (const client of subs) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public close(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const timer of this.depthDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.depthDebounceTimers.clear();
    this.marketSubscribers.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
