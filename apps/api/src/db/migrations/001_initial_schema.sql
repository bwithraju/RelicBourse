-- 001_initial_schema.sql
-- RelicBourse Core Schema

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    balance_minor BIGINT NOT NULL DEFAULT 0 CONSTRAINT chk_accounts_balance_minor CHECK (balance_minor >= 0),
    reserved_minor BIGINT NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS markets (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    face_value_minor BIGINT NOT NULL CHECK (face_value_minor > 0),
    cap_percent INTEGER NOT NULL DEFAULT 120 CHECK (cap_percent > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_inventory PRIMARY KEY (user_id, market_id),
    CONSTRAINT chk_available_inventory CHECK (quantity >= reserved_qty)
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    side VARCHAR(8) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    type VARCHAR(8) NOT NULL CHECK (type IN ('LIMIT', 'MARKET')),
    price_minor BIGINT NULL CHECK (price_minor IS NULL OR price_minor > 0),
    qty INTEGER NOT NULL CHECK (qty > 0),
    filled_qty INTEGER NOT NULL DEFAULT 0 CHECK (filled_qty >= 0 AND filled_qty <= qty),
    status VARCHAR(16) NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'FILLED', 'CANCELLED')),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_limit_order_price CHECK (type != 'LIMIT' OR price_minor IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    buy_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    sell_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    price_minor BIGINT NOT NULL CHECK (price_minor > 0),
    qty INTEGER NOT NULL CHECK (qty > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE RESTRICT,
    account_user_id VARCHAR(64) NOT NULL,
    debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
    credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ledger_entry_non_zero CHECK (debit_minor > 0 OR credit_minor > 0)
);

CREATE TABLE IF NOT EXISTS escrow_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE RESTRICT UNIQUE,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    status VARCHAR(16) NOT NULL CHECK (status IN ('HELD', 'RELEASED', 'REFUNDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auctions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id VARCHAR(64) NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    start_price_minor BIGINT NOT NULL CHECK (start_price_minor > 0),
    floor_price_minor BIGINT NOT NULL CHECK (floor_price_minor > 0 AND floor_price_minor <= start_price_minor),
    decrement_minor BIGINT NOT NULL CHECK (decrement_minor > 0),
    interval_sec INTEGER NOT NULL CHECK (interval_sec > 0),
    current_price_minor BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('RUNNING', 'ENDED')),
    winner_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_hash VARCHAR(64) NOT NULL,
    stored_response JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_market_status ON orders(market_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_book_rebuild ON orders(market_id, side, price_minor, created_at) WHERE status IN ('OPEN', 'PARTIAL');
CREATE INDEX IF NOT EXISTS idx_trades_market_created ON trades(market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_trade ON ledger_entries(trade_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account_user ON ledger_entries(account_user_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_id);
