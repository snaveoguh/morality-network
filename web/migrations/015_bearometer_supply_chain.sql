-- Bearometer China supply-chain layer — signal record for later scoring.
-- Writers: web/src/lib/bearometer/supply-chain-record.ts (each fresh snapshot).
-- Readers: none yet — a backtest will join these against price moves.
-- Deliberately NOT pooter.signals: the trader reads that table, and nothing
-- trades on these indicators until they have a track record.

-- One row per tagged headline, stamped the first time we saw it. first_seen_at
-- (not pub_date) is the honest "we knew at" time for a backtest.
CREATE TABLE IF NOT EXISTS pooter.bearometer_supply_items (
  id             TEXT PRIMARY KEY,   -- sha256 of the item id/link
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pub_date       TIMESTAMPTZ,
  source         TEXT NOT NULL,
  source_kind    TEXT NOT NULL CHECK (source_kind IN ('government', 'state-media', 'independent', 'aggregator')),
  groups         TEXT[] NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('tightening', 'easing', 'neutral')),
  direction_by   TEXT NOT NULL DEFAULT 'regex' CHECK (direction_by IN ('regex', 'llm')),
  title          TEXT NOT NULL,
  link           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bearometer_supply_items_seen_idx
  ON pooter.bearometer_supply_items (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS bearometer_supply_items_groups_idx
  ON pooter.bearometer_supply_items USING GIN (groups);

-- One row per group per snapshot: the indicator as it was shown, with the
-- watchlists it pointed at. Tickers are copied so later taxonomy edits do not
-- rewrite history.
CREATE TABLE IF NOT EXISTS pooter.bearometer_supply_indicators (
  recorded_at     TIMESTAMPTZ NOT NULL,
  group_id        TEXT NOT NULL,
  label           TEXT NOT NULL CHECK (label IN ('TIGHTENING', 'EASING', 'MIXED', 'QUIET')),
  pressure        REAL NOT NULL,
  activity        REAL NOT NULL,
  item_count      INTEGER NOT NULL,
  ex_china_supply TEXT[] NOT NULL,
  exposed         TEXT[] NOT NULL,
  PRIMARY KEY (group_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS bearometer_supply_indicators_recorded_idx
  ON pooter.bearometer_supply_indicators (recorded_at DESC);
