-- Bearometer global supply-chain layer — signal record for later scoring.
-- Writers: web/src/lib/bearometer/global-supply-record.ts (each fresh snapshot).
-- Readers: none yet — a backtest will join these against price moves.
-- Like 015, deliberately NOT pooter.signals: nothing trades on these readings.

-- One row per indicator per snapshot. Data indicators fill latest/baseline/
-- change/as_of; news indicators fill item_count. assets are Bearometer engine
-- symbols copied at write time, so later taxonomy edits do not rewrite history.
CREATE TABLE IF NOT EXISTS pooter.bearometer_global_readings (
  recorded_at   TIMESTAMPTZ NOT NULL,
  indicator_id  TEXT NOT NULL,
  region        TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('data', 'news')),
  label         TEXT NOT NULL CHECK (label IN ('STRAINED', 'EASING', 'STEADY', 'STALE', 'NO DATA')),
  pressure      REAL NOT NULL,
  latest        DOUBLE PRECISION,
  baseline      DOUBLE PRECISION,
  change        DOUBLE PRECISION,
  as_of         TEXT,             -- source's own date: YYYY-MM-DD or YYYY-MM
  item_count    INTEGER,
  assets        TEXT[] NOT NULL,
  PRIMARY KEY (indicator_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS bearometer_global_readings_recorded_idx
  ON pooter.bearometer_global_readings (recorded_at DESC);
CREATE INDEX IF NOT EXISTS bearometer_global_readings_region_idx
  ON pooter.bearometer_global_readings (region, recorded_at DESC);

-- Headlines shown under a news indicator, stamped the first time we saw them.
CREATE TABLE IF NOT EXISTS pooter.bearometer_global_items (
  id             TEXT PRIMARY KEY,   -- sha256 of the link
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indicator_id   TEXT NOT NULL,
  pub_date       TIMESTAMPTZ,
  source         TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('disrupting', 'easing', 'neutral')),
  title          TEXT NOT NULL,
  link           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bearometer_global_items_seen_idx
  ON pooter.bearometer_global_items (first_seen_at DESC);
