import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import { DbClient } from './contract.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDataDir = path.resolve(process.cwd(), 'data');
const PGDATA_DIR = process.env.PGDATA_PATH || path.join(rootDataDir, 'pgdata');

let pgliteInstance: PGlite | null = null;
let useRealPostgres = false;
let isInitAttempted = false;

const rawPool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://relic:relicsecret@localhost:5432/relicbourse',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 1000,
});

function getPglite(): PGlite {
  if (!pgliteInstance) {
    if (process.env.VITEST) {
      // In-memory PGlite for isolated concurrent test runners
      pgliteInstance = new PGlite();
    } else {
      // Persistent PGlite on disk for live server
      if (!fs.existsSync(rootDataDir)) {
        fs.mkdirSync(rootDataDir, { recursive: true });
      }
      const pidPath = path.join(PGDATA_DIR, 'postmaster.pid');
      if (fs.existsSync(pidPath)) {
        try {
          fs.unlinkSync(pidPath);
        } catch {}
      }
      pgliteInstance = new PGlite(PGDATA_DIR);
    }
  }
  return pgliteInstance;
}

export async function initDbConnection(): Promise<void> {
  if (isInitAttempted) return;
  isInitAttempted = true;

  try {
    const client = await rawPool.connect();
    await client.query('SELECT 1 AS connected;');
    client.release();
    useRealPostgres = true;
    console.log('[DB] Connected to external PostgreSQL database.');
  } catch {
    useRealPostgres = false;
    let pgl = getPglite();
    try {
      await pgl.waitReady;
    } catch (err) {
      console.warn(`[DB] PGlite failed to recover data at ${PGDATA_DIR}. Re-creating data directory...`, err);
      try {
        await pgl.close();
      } catch {}
      pgliteInstance = null;
      try {
        fs.rmSync(PGDATA_DIR, { recursive: true, force: true });
      } catch {}
      pgl = getPglite();
      await pgl.waitReady;
    }
    if (!process.env.VITEST) {
      console.log(`[DB] Connected to persistent PostgreSQL (PGlite) at ${PGDATA_DIR}`);
    }
  }
}

export function getRunner(client?: DbClient): any {
  if (client && typeof (client as any).query === 'function') {
    return client;
  }
  if (useRealPostgres) {
    return rawPool;
  }
  return getPglite();
}

export const pool = {
  async query<T = any>(
    text: string,
    params?: any[]
  ): Promise<{ rows: T[]; rowCount: number; fields?: any[] }> {
    if (!isInitAttempted) await initDbConnection();
    const runner = getRunner();
    return await runner.query(text, params);
  },
  async exec(sql: string): Promise<void> {
    if (!isInitAttempted) await initDbConnection();
    if (useRealPostgres) {
      await rawPool.query(sql);
      return;
    }
    const db = getPglite();
    await db.exec(sql);
  },
  async connect(): Promise<any> {
    if (!isInitAttempted) await initDbConnection();
    if (useRealPostgres) {
      return await rawPool.connect();
    }
    const db = getPglite();
    return {
      query: <T = any>(text: string, params?: any[]) => db.query(text, params),
      release: () => {},
    };
  },
  async end(): Promise<void> {
    if (useRealPostgres) {
      await rawPool.end();
      return;
    }
    if (pgliteInstance) {
      await pgliteInstance.close();
      pgliteInstance = null;
    }
  },
};

export async function withTransaction<T>(
  fn: (client: any) => Promise<T>
): Promise<T> {
  if (!isInitAttempted) await initDbConnection();
  if (useRealPostgres) {
    const client = await rawPool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Failed to rollback transaction:', rollbackErr);
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    const db = getPglite();
    return await db.transaction(async (tx) => {
      return await fn(tx);
    });
  }
}

export function getMigrationsDir(): string {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '../../src/db/migrations'),
    path.join(__dirname, '../src/db/migrations'),
    path.resolve(process.cwd(), 'apps/api/src/db/migrations'),
    path.resolve(process.cwd(), 'src/db/migrations'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.sql'))) {
      return dir;
    }
  }
  return path.join(__dirname, 'migrations');
}

// Automatic schema migration and demo market initialization
export async function autoMigrate(): Promise<void> {
  await initDbConnection();
  const migrationsDir = getMigrationsDir();
  const runner = getRunner();

  await runner.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const versionMatch = file.match(/^(\d+)/);
      const version = versionMatch ? versionMatch[1] : file;
      const { rows } = await runner.query('SELECT version FROM schema_migrations WHERE version = $1;', [version]);
      if (rows.length === 0) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        if (useRealPostgres) {
          await rawPool.query(sql);
        } else {
          const db = getPglite();
          await db.exec(sql);
        }
        await runner.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2);', [version, file]);
        if (!process.env.VITEST) {
          console.log(`[DB] Applied migration: ${file}`);
        }
      }
    }
  }

  // Seed default 4 demo markets
  const DEMO_MARKETS = [
    { id: 'market-culrav-2026', name: 'Culrav 2026', faceValueMinor: 200000, capPercent: 120, status: 'ACTIVE' },
    { id: 'market-renesiance-2026', name: 'Renesiance 2026', faceValueMinor: 150000, capPercent: 120, status: 'ACTIVE' },
    { id: 'market-avishkar-2026', name: 'Avishkar 2026', faceValueMinor: 250000, capPercent: 120, status: 'ACTIVE' },
    { id: 'market-rangtaadi-2026', name: 'Rangtaadi 2026', faceValueMinor: 100000, capPercent: 120, status: 'ACTIVE' },
  ];

  for (const m of DEMO_MARKETS) {
    await runner.query(
      `INSERT INTO markets (id, name, face_value_minor, cap_percent, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         face_value_minor = EXCLUDED.face_value_minor,
         cap_percent = EXCLUDED.cap_percent,
         status = EXCLUDED.status;`,
      [m.id, m.name, m.faceValueMinor.toString(), m.capPercent, m.status]
    );
  }

  // Restore and guarantee persistence for user account ytanay710@gmail.com and saved users
  const usersBackupFile = path.join(rootDataDir, 'registered_users.json');
  let savedUsers: Array<{ email: string; passwordHash: string }> = [];
  if (fs.existsSync(usersBackupFile)) {
    try {
      savedUsers = JSON.parse(fs.readFileSync(usersBackupFile, 'utf-8'));
    } catch {}
  }

  // Ensure ytanay710@gmail.com is in savedUsers
  if (!savedUsers.some((u) => u.email.toLowerCase() === 'ytanay710@gmail.com')) {
    const defaultHash = await bcrypt.hash('Password123!', 8);
    savedUsers.push({ email: 'ytanay710@gmail.com', passwordHash: defaultHash });
    try {
      fs.writeFileSync(usersBackupFile, JSON.stringify(savedUsers, null, 2), 'utf-8');
    } catch {}
  }

  for (const savedUser of savedUsers) {
    const checkUser = await runner.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1);', [savedUser.email]);
    if (checkUser.rows.length === 0) {
      const uRes = await runner.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id;',
        [savedUser.email.toLowerCase(), savedUser.passwordHash]
      );
      const uid = uRes.rows[0].id;
      await runner.query('INSERT INTO accounts (user_id, balance_minor, reserved_minor) VALUES ($1, 10000000, 0);', [uid]);
      for (const m of DEMO_MARKETS) {
        await runner.query('INSERT INTO inventory (user_id, market_id, quantity, reserved_qty) VALUES ($1, $2, 2, 0);', [uid, m.id]);
      }
      if (!process.env.VITEST) {
        console.log(`[DB] Restored account ${savedUser.email} with seeded demo balance and inventory.`);
      }
    }
  }
}
