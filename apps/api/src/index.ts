import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { createApp } from './app.js';
import { WsHub } from './ws/server.js';
import { RestartRecovery } from './engine/recovery.js';
import { autoMigrate, pool } from './db/pool.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const app = createApp();
const server = http.createServer(app);

// Initialize WebSocket hub on /ws endpoint
const wsHub = WsHub.getInstance();
wsHub.init(server);

// Initialize database schema, seeds, and rebuild order books from PostgreSQL
autoMigrate()
  .then(() => RestartRecovery.recover())
  .then(() => {
    server.listen(PORT, () => {
      console.log(`RelicBourse API & WS server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database and recover order books:', err);
    process.exit(1);
  });

const gracefulShutdown = async () => {
  try {
    server.close();
    await pool.end();
  } catch {}
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { app, server, wsHub };
