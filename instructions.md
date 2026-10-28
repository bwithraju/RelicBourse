# RelicBourse — Database Layer Implementation Instructions (For Raju / Database Agent)

> **Handover Note**:  
> The backend (`apps/api`), matching engine (`packages/matching`), shared contracts (`packages/shared`), load testing suite (`load/`), and frontend UI (`apps/web`) have been fully developed and integrated. All 45 unit and integration tests are passing against typed repository interfaces.
>
> **Your Role**: As RAJU (Database Owner), your responsibility is to implement the real PostgreSQL schema, migration runner, connection pool, and repository query functions in `apps/api/src/db/`. **Do NOT alter existing REST routes, engine algorithms, or frontend components.**

---

## 1. Ownership & Allowed Directories

- **Your Allowed Folders**:
  - `apps/api/src/db/` (`migrations/`, `repositories/`, `pool.ts`, `migrate.ts`, `seed.ts`, `reconcile.ts`)
  - `tests/db/` (your database constraint & repository tests)
  - `docker-compose.yml` (PostgreSQL service configuration)
- **Do NOT Edit**:
  - `apps/api/src/routes/`
  - `apps/api/src/services/`
  - `apps/api/src/engine/`
  - `packages/matching/`
  - `apps/web/`

---

## 2. PostgreSQL Schema & Constraints Specification

Create migration SQL files under `apps/api/src/db/migrations/` (e.g. `001_initial_schema.sql`, `002_indexes.sql`). All money must be stored as **`BIGINT` minor units (paise)**. **NEVER use `FLOAT`, `REAL`, or `NUMERIC` with decimals.**

### Database Tables:

1. **`users`**
   - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `email`: `VARCHAR(255) NOT NULL UNIQUE`
   - `password_hash`: `VARCHAR(255) NOT NULL`
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

2. **`accounts`**
   - `user_id`: `UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT`
   - `balance_minor`: `BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0)`
   - `reserved_minor`: `BIGINT NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0)`

3. **`markets`**
   - `id`: `VARCHAR(64) PRIMARY KEY`
   - `name`: `VARCHAR(255) NOT NULL`
   - `face_value_minor`: `BIGINT NOT NULL CHECK (face_value_minor > 0)`
   - `cap_percent`: `INTEGER NOT NULL DEFAULT 120 CHECK (cap_percent > 0)`
   - `status`: `VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'`

4. **`inventory`**
   - `user_id`: `UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
   - `market_id`: `VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT`
   - `quantity`: `INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0)`
   - `reserved_qty`: `INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0)`
   - `CONSTRAINT pk_inventory PRIMARY KEY (user_id, market_id)`
   - `CONSTRAINT chk_available_inventory CHECK (quantity >= reserved_qty)`

5. **`orders`**
   - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `user_id`: `UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
   - `market_id`: `VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT`
   - `side`: `VARCHAR(8) NOT NULL CHECK (side IN ('BUY', 'SELL'))`
   - `type`: `VARCHAR(8) NOT NULL CHECK (type IN ('LIMIT', 'MARKET'))`
   - `price_minor`: `BIGINT NULL CHECK (price_minor IS NULL OR price_minor > 0)` (NULL for MARKET orders)
   - `qty`: `INTEGER NOT NULL CHECK (qty > 0)`
   - `filled_qty`: `INTEGER NOT NULL DEFAULT 0 CHECK (filled_qty >= 0 AND filled_qty <= qty)`
   - `status`: `VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'FILLED', 'CANCELLED'))`
   - `idempotency_key`: `VARCHAR(255) NOT NULL UNIQUE`
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

6. **`trades`**
   - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `market_id`: `VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT`
   - `buy_order_id`: `UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT`
   - `sell_order_id`: `UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT`
   - `price_minor`: `BIGINT NOT NULL CHECK (price_minor > 0)`
   - `qty`: `INTEGER NOT NULL CHECK (qty > 0)`
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

7. **`ledger_entries`**
   - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `trade_id`: `UUID NOT NULL REFERENCES trades(id) ON DELETE RESTRICT`
   - `account_user_id`: `VARCHAR(64) NOT NULL` (User UUID or `'ESCROW_SYSTEM'`)
   - `debit_minor`: `BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0)`
   - `credit_minor`: `BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0)`
   - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - *Core Invariant*: Every trade's sum of `debit_minor` MUST equal sum of `credit_minor`.

8. **`escrow_holds`**
   - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `trade_id`: `UUID NOT NULL REFERENCES trades(id) ON DELETE RESTRICT UNIQUE`
   - `amount_minor`: `BIGINT NOT NULL CHECK (amount_minor > 0)`
   - `status`: `VARCHAR(16) NOT NULL CHECK (status IN ('HELD', 'RELEASED', 'REFUNDED'))`

9. **`auctions`**
   - `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `market_id`: `VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT`
   - `start_price_minor`: `BIGINT NOT NULL CHECK (start_price_minor > 0)`
   - `floor_price_minor`: `BIGINT NOT NULL CHECK (floor_price_minor > 0 AND floor_price_minor <= start_price_minor)`
   - `decrement_minor`: `BIGINT NOT NULL CHECK (decrement_minor > 0)`
   - `interval_sec`: `INTEGER NOT NULL CHECK (interval_sec > 0)`
   - `current_price_minor`: `BIGINT NOT NULL`
   - `status`: `VARCHAR(16) NOT NULL CHECK (status IN ('RUNNING', 'ENDED'))`
   - `winner_user_id`: `UUID NULL REFERENCES users(id) ON DELETE SET NULL`
   - `ends_at`: `TIMESTAMPTZ NOT NULL`

10. **`idempotency_keys`**
    - `key`: `VARCHAR(255) PRIMARY KEY`
    - `user_id`: `UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
    - `request_hash`: `VARCHAR(64) NOT NULL`
    - `stored_response`: `JSONB NOT NULL`
    - `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### Performance Indexes to Create:
```sql
CREATE INDEX idx_orders_market_status ON orders(market_id, status);
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_book_rebuild ON orders(market_id, side, price_minor, created_at) WHERE status IN ('OPEN', 'PARTIAL');
CREATE INDEX idx_trades_market_created ON trades(market_id, created_at DESC);
CREATE INDEX idx_ledger_trade ON ledger_entries(trade_id);
CREATE INDEX idx_ledger_account_user ON ledger_entries(account_user_id);
CREATE INDEX idx_auctions_status ON auctions(status);
CREATE INDEX idx_idempotency_user ON idempotency_keys(user_id);
```

---

## 3. Database Connection Pool & Transaction Helper

File: `apps/api/src/db/pool.ts`
- Use `pg.Pool` reading connection string from `process.env.DATABASE_URL` (fallback `postgresql://postgres:postgres@localhost:5432/relicbourse`).
- Implement and export `withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>`:
  ```typescript
  export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  ```

---

## 4. Repositories to Implement in `apps/api/src/db/repositories/`

Every function receives `client: pg.PoolClient | DbClient` as its first parameter when called inside `withTransaction`.

### 1. `users.repo.ts`
- `createUser(client, { email, passwordHash })`: inserts and returns `{ id, email, passwordHash, createdAt }`.
- `findByEmail(client, email)`: returns user or null.
- `findById(client, id)`: returns user or null.

### 2. `accounts.repo.ts`
- `createAccount(client, userId, initialBalanceMinor)`: inserts row with `balance_minor = initialBalanceMinor, reserved_minor = 0`.
- `getAccount(client, userId)`: returns account or null.
- `reserveFunds(client, userId, amountMinor)`:
  Atomic funds reservation query:
  ```sql
  UPDATE accounts
  SET balance_minor = balance_minor - $2,
      reserved_minor = reserved_minor + $2
  WHERE user_id = $1 AND balance_minor >= $2;
  ```
  Check `rowCount > 0` (returns boolean).
- `releaseReservation(client, userId, amountMinor)`: moves reserved back to balance.
- `settleDebit(client, userId, amountMinor)`: decrements `reserved_minor`.
- `settleCredit(client, userId, amountMinor)`: increments `balance_minor`.
- `lockAccount(client, userId)`: `SELECT * FROM accounts WHERE user_id = $1 FOR UPDATE`.

### 3. `inventory.repo.ts`
- `seedInventory(client, userId, marketId, quantity)`: inserts initial inventory row.
- `getInventory(client, userId, marketId)`: returns inventory row or null.
- `listInventoryByUser(client, userId)`: returns list of user inventory items.
- `reserveInventory(client, userId, marketId, qty)`:
  Atomic inventory reservation query:
  ```sql
  UPDATE inventory
  SET reserved_qty = reserved_qty + $3
  WHERE user_id = $1 AND market_id = $2 AND (quantity - reserved_qty) >= $3;
  ```
  Check `rowCount > 0` (returns boolean).
- `releaseInventoryReservation(client, userId, marketId, qty)`: decrements `reserved_qty`.
- `settleInventoryMove(client, buyerId, sellerId, marketId, qty)`:
  Decrements seller `quantity` and `reserved_qty`; upserts/increments buyer `quantity`.

### 4. `markets.repo.ts`
- `listMarkets(client)`: returns all active markets.
- `getMarket(client, marketId)`: returns market details.
- `getOpenOrdersForBook(client, marketId)`:
  ```sql
  SELECT * FROM orders
  WHERE market_id = $1 AND status IN ('OPEN', 'PARTIAL')
  ORDER BY created_at ASC;
  ```

### 5. `orders.repo.ts`
- `insertOrder(client, order)`: inserts order into `orders` table.
- `updateOrderFill(client, orderId, filledQty, status)`: updates `filled_qty` and `status`.
- `getOrder(client, orderId)`: selects order by ID.
- `listOrdersByUser(client, userId)`: selects user's orders sorted by `created_at DESC`.
- `storeIdempotentResponse(client, key, userId, requestHash, storedResponse)`: inserts into `idempotency_keys`.
- `getIdempotentResponse(client, key)`: returns `{ storedResponse, requestHash }` or null.

### 6. `trades.repo.ts`
- `insertTrade(client, trade)`: inserts into `trades` table.
- `listTradesByMarket(client, marketId, limit)`: returns recent trades for market.
- `getTrade(client, tradeId)`: selects trade by ID.

### 7. `ledger.repo.ts`
- `insertEntries(client, tradeId, entries)`: batch inserts double-entry rows.
- `getLedgerTotals(client)`:
  ```sql
  SELECT COALESCE(SUM(debit_minor), 0) AS total_debits,
         COALESCE(SUM(credit_minor), 0) AS total_credits
  FROM ledger_entries;
  ```

### 8. `escrow.repo.ts`
- `createHold(client, tradeId, amountMinor)`: inserts row with status `'HELD'`.
- `releaseHold(client, tradeId)`: updates status to `'RELEASED'`.
- `refundHold(client, tradeId)`: updates status to `'REFUNDED'`.
- `listHoldsByUser(client, userId)`: returns escrow rows where user is party to the trade.

### 9. `auctions.repo.ts`
- `insertAuction(client, auction)`: inserts Dutch auction row in `'RUNNING'` status.
- `getAuction(client, auctionId)`: selects auction by ID.
- `listAuctions(client)`: selects all auctions.
- `atomicBidUpdate(client, auctionId, expectedPrice, winnerId)`:
  Atomic Compare-And-Swap query:
  ```sql
  UPDATE auctions
  SET status = 'ENDED', winner_user_id = $3
  WHERE id = $1 AND status = 'RUNNING' AND current_price_minor = $2
  RETURNING *;
  ```
  Returns row if update succeeded; `null` if another bid won in the same tick.
- `updateAuctionPrice(client, auctionId, currentPriceMinor)`: updates `current_price_minor`.
- `endAuction(client, auctionId, winnerUserId)`: sets status `'ENDED'`.

---

## 5. Seed Data & Helpers

File: `apps/api/src/db/seed.ts`
- **3 Demo Markets**:
  1. `market-festival-pass`: Name: "Festival VIP Pass 2026", Face: ₹2,000 (200000 paise), Cap: 120%
  2. `market-limited-merch`: Name: "Cyberpunk Limited Hoodie", Face: ₹5,000 (500000 paise), Cap: 120%
  3. `market-concert-pass`: Name: "Darkhold Midnight Concert Pass", Face: ₹1,500 (150000 paise), Cap: 120%
- **`seedNewUserData(client, userId)` Helper**:
  Export this helper so that user registration calls it inside its signup transaction:
  - Creates `accounts` row with ₹1,00,000 balance (`10000000` paise).
  - Creates `inventory` rows with 2 units for each demo market.

---

## 6. Solvency & Restart-Recovery Queries

File: `apps/api/src/db/reconcile.ts`
- `reconcileDb()` function powering `GET /admin/reconcile`:
  - Verifies `sum(debit_minor) == sum(credit_minor)` across `ledger_entries`.
  - Verifies no account or inventory row violates non-negativity.
  - Returns:
    ```typescript
    {
      ok: boolean,
      totalBalances: number,
      totalLedgerNet: number,
      totalAvailable: number,
      totalReserved: number,
      totalDebits: number,
      totalCredits: number,
      escrowHeld: number,
      negativeRows: number
    }
    ```

File: `apps/api/src/db/recovery.ts` (or in `index.ts`)
- `getAllOpenOrdersGroupedByMarket()`:
  - Fetches all orders where `status IN ('OPEN', 'PARTIAL')` ordered by `created_at ASC`.
  - Groups them into a map `{ [marketId: string]: Order[] }` so `RestartRecovery.recover()` rebuilds in-memory order books on startup.

---

## 7. How to Test & Verify

1. Start PostgreSQL with Docker Compose:
   ```bash
   docker compose up -d
   ```
2. Run database migrations and seed:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
3. Run the full monorepo test suite:
   ```bash
   npm test
   ```
   All 45 unit, matching engine, and API integration tests will run against your database!
