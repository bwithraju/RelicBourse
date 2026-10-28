import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { createApp } from './app.js';
import { WsHub } from './ws/server.js';
import { RestartRecovery } from './engine/recovery.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const app = createApp();
const server = http.createServer(app);

// Initialize WebSocket hub on /ws endpoint
const wsHub = WsHub.getInstance();
wsHub.init(server);

// Restart recovery: rebuild order books from PostgreSQL
RestartRecovery.recover()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`RelicBourse API & WS server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to recover order books during startup:', err);
    process.exit(1);
  });

export { app, server, wsHub };
