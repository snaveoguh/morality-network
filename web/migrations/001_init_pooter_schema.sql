-- Migration 001: Initial pooter schema (TradeDecision + Signal).
--
-- All tables live in a separate `pooter` schema isolated from Ponder's
-- versioned tables in `public`. Hyperliquid is the source of truth for
-- positions, fills, PnL, fees, and timestamps — these tables only carry
-- metadata HL can't carry (rationale, signals, moral gate, Kelly).
--
-- Apply with: node web/scripts/migrate.js
-- Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS pooter;

-- ─────────────────────────────────────────────────────────────────────────
-- pooter.trade_decisions
-- One row per intended trade. JOIN to HL fills via cloid (32-byte client
-- order ID echoed by HL on every fill). Updated mid-position with trailing
-- state and on close with exit rationale.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pooter.trade_decisions (
  id                  TEXT PRIMARY KEY,
  cloid               VARCHAR(80) UNIQUE,
  hl_oid              VARCHAR(64),

  wallet              VARCHAR(64)  NOT NULL,
  market_symbol       VARCHAR(24)  NOT NULL,
  venue               VARCHAR(32)  NOT NULL,
  direction           VARCHAR(8)   NOT NULL CHECK (direction IN ('long','short')),
  leverage            INTEGER,

  opened_at           TIMESTAMPTZ  NOT NULL,
  closed_at           TIMESTAMPTZ,

  entry_notional_usd  NUMERIC(20, 8),

  signal_source       VARCHAR(64),
  signal_confidence   DOUBLE PRECISION,
  kelly_fraction      DOUBLE PRECISION,

  moral_score             INTEGER,
  moral_justification     TEXT,

  stop_loss_pct       DOUBLE PRECISION,
  take_profit_pct     DOUBLE PRECISION,
  trailing_stop_pct   DOUBLE PRECISION,

  high_water_mark     DOUBLE PRECISION,
  low_water_mark      DOUBLE PRECISION,
  dynamic_tp_levels   JSONB,

  entry_rationale     JSONB,
  exit_rationale      JSONB,
  exit_reason         VARCHAR(40),

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_decisions_wallet_symbol_opened
  ON pooter.trade_decisions (wallet, market_symbol, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_decisions_wallet_closed
  ON pooter.trade_decisions (wallet, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_decisions_symbol_opened
  ON pooter.trade_decisions (market_symbol, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_decisions_cloid
  ON pooter.trade_decisions (cloid);

-- ─────────────────────────────────────────────────────────────────────────
-- pooter.signals
-- Unified signal feed — every signal producer (swarm, editorial, scanner,
-- web-intel, council, pattern, wallet-flow, technical, market-data) writes
-- here. Trader reads from here. TTL trims stale rows.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pooter.signals (
  id                  TEXT PRIMARY KEY,

  produced_at         TIMESTAMPTZ NOT NULL,
  produced_by         VARCHAR(40) NOT NULL,
  symbol              VARCHAR(24) NOT NULL,
  direction           VARCHAR(10) NOT NULL CHECK (direction IN ('bullish','bearish','neutral')),
  strength            DOUBLE PRECISION NOT NULL,
  score               DOUBLE PRECISION,
  claim               TEXT,

  entity_hash         VARCHAR(80),
  market_impact_json  JSONB,
  cluster_id          VARCHAR(160),
  contradiction_count INTEGER,
  token_address       VARCHAR(80),
  support_levels      DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  resistance_levels   DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  regime              VARCHAR(40),
  source_detail       JSONB,

  ttl_expires_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_produced
  ON pooter.signals (symbol, produced_at DESC);

CREATE INDEX IF NOT EXISTS idx_signals_producer_produced
  ON pooter.signals (produced_by, produced_at DESC);

CREATE INDEX IF NOT EXISTS idx_signals_ttl
  ON pooter.signals (ttl_expires_at);

-- ─────────────────────────────────────────────────────────────────────────
-- pooter.schema_migrations
-- Tracks applied migration files. Updated by web/scripts/migrate.js.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pooter.schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum    TEXT
);
