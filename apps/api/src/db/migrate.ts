import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const applied: string[] = [];
  const skipped: string[] = [];

  // 1. Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 2. Fetch list of already-applied migrations
  const { rows: existingRows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC;'
  );
  const appliedVersions = new Set(existingRows.map((r) => r.version));

  // 3. Read migration files sorted by name
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found: ${migrationsDir}`);
    return { applied, skipped };
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const versionMatch = file.match(/^(\d+)/);
    const version = versionMatch ? versionMatch[1] : file;

    if (appliedVersions.has(version)) {
      skipped.push(file);
      console.log(`[migrate] Migration ${file} (v${version}) already applied. Skipping.`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log(`[migrate] Applying migration ${file} (v${version})...`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2);',
        [version, file]
      );
    });

    applied.push(file);
    console.log(`[migrate] Successfully applied migration ${file}.`);
  }

  return { applied, skipped };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1] === __filename ||
    process.argv[1].endsWith('migrate.ts') ||
    process.argv[1].endsWith('migrate.js'));

if (isDirectRun) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(
        `[migrate] Done. Applied: ${applied.length}, Skipped: ${skipped.length}.`
      );
      return pool.end();
    })
    .catch(async (err) => {
      console.error('[migrate] Migration failed:', err);
      await pool.end();
      process.exit(1);
    });
}
