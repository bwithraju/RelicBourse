import pg from 'pg';
import { pool, withTransaction } from './pool.js';
import { fileURLToPath } from 'node:url';
import { Market, MinorUnits } from '@relicbourse/shared';

const __filename = fileURLToPath(import.meta.url);

export const DEMO_MARKETS: Market[] = [
  {
    id: 'market-festival-pass',
    name: 'Festival VIP Pass 2026',
    faceValueMinor: 200000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-limited-merch',
    name: 'Cyberpunk Limited Hoodie',
    faceValueMinor: 500000,
    capPercent: 120,
    status: 'ACTIVE',
  },
  {
    id: 'market-concert-pass',
    name: 'Darkhold Midnight Concert Pass',
    faceValueMinor: 150000,
    capPercent: 120,
    status: 'ACTIVE',
  },
];

export const INITIAL_USER_BALANCE_MINOR: MinorUnits = 10000000; // ₹1,00,000 = 10,000,000 paise
export const INITIAL_MARKET_INVENTORY_QTY = 2; // 2 units of each demo market

export async function seedDatabase(): Promise<void> {
  console.log('[seed] Seeding demo markets into PostgreSQL...');

  await withTransaction(async (client) => {
    for (const market of DEMO_MARKETS) {
      await client.query(
        `INSERT INTO markets (id, name, face_value_minor, cap_percent, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           face_value_minor = EXCLUDED.face_value_minor,
           cap_percent = EXCLUDED.cap_percent,
           status = EXCLUDED.status;`,
        [
          market.id,
          market.name,
          market.faceValueMinor.toString(),
          market.capPercent,
          market.status,
        ]
      );
      console.log(`[seed] Seeded market: ${market.name} (${market.id})`);
    }
  });

  console.log('[seed] Seeding completed successfully.');
}

export async function seedNewUserData(
  client: pg.PoolClient | any,
  userId: string
): Promise<void> {
  if (client?.query) {
    // 1. Create account row with ₹1,00,000 (10,000,000 paise)
    await client.query(
      `INSERT INTO accounts (user_id, balance_minor, reserved_minor)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO NOTHING;`,
      [userId, INITIAL_USER_BALANCE_MINOR.toString()]
    );

    // 2. Create inventory rows with 2 units of each demo market
    for (const market of DEMO_MARKETS) {
      await client.query(
        `INSERT INTO inventory (user_id, market_id, quantity, reserved_qty)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (user_id, market_id) DO NOTHING;`,
        [userId, market.id, INITIAL_MARKET_INVENTORY_QTY]
      );
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1] === __filename ||
    process.argv[1].endsWith('seed.ts') ||
    process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
  seedDatabase()
    .then(async () => {
      await pool.end();
    })
    .catch(async (err) => {
      console.error('[seed] Seeding failed:', err);
      await pool.end();
      process.exit(1);
    });
}
