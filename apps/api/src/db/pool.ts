import pg from 'pg';
import dotenv from 'dotenv';
import { DbClient } from './contract.js';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://relic:relicsecret@localhost:5432/relicbourse',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export function getRunner(client?: DbClient): pg.Pool | pg.PoolClient {
  if (client && typeof client.query === 'function') {
    return client as unknown as pg.PoolClient;
  }
  return pool;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
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
}
