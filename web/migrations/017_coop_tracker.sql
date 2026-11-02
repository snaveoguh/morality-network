-- Co-op tracker — new co-ops moving through a development programme.
-- Writers: web/src/lib/db/coop-pipeline.ts (starter-flow submissions, operator updates).
-- Readers: /coops/<area>, /coops/c/<slug>, /api/coops/<area>.
--
-- The existing co-op economy (every registered society in the area) is NOT
-- here: it is a committed snapshot of the FCA register, rebuilt by
-- web/scripts/build-coop-economy.mjs. This table only holds co-ops that asked
-- to be tracked.
--
-- Nothing is public until an operator sets is_public. contact_email is never
-- served by a public read.

CREATE TABLE IF NOT EXISTS pooter.coop_pipeline (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  area           TEXT NOT NULL,                 -- key in src/data/coops/areas.json
  name           TEXT NOT NULL,
  model          TEXT NOT NULL CHECK (model IN (
                   'worker', 'consumer', 'producer', 'multi-stakeholder',
                   'community-benefit', 'housing', 'undecided')),
  sector         TEXT NOT NULL,
  district       TEXT,
  summary        TEXT NOT NULL DEFAULT '',
  website        TEXT,
  stage          TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN (
                   'idea', 'forming', 'registered', 'trading', 'reporting', 'closed')),
  fca_reg_no     TEXT,                          -- set once registered; links to the register
  founders       INTEGER NOT NULL DEFAULT 0 CHECK (founders >= 0),
  members        INTEGER NOT NULL DEFAULT 0 CHECK (members >= 0),
  jobs_fte       NUMERIC(8, 1) NOT NULL DEFAULT 0 CHECK (jobs_fte >= 0),
  support_pence  BIGINT NOT NULL DEFAULT 0 CHECK (support_pence >= 0),  -- programme money received
  contact_email  TEXT NOT NULL,
  is_public      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coop_pipeline_area_idx
  ON pooter.coop_pipeline (area, is_public, stage);

-- Append-only history: every stage change or figure update is a row, so the
-- tracker can show when each co-op moved and what changed.
CREATE TABLE IF NOT EXISTS pooter.coop_pipeline_events (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coop_id        BIGINT NOT NULL REFERENCES pooter.coop_pipeline (id) ON DELETE CASCADE,
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage          TEXT NOT NULL,
  members        INTEGER NOT NULL,
  jobs_fte       NUMERIC(8, 1) NOT NULL,
  support_pence  BIGINT NOT NULL,
  note           TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS coop_pipeline_events_coop_idx
  ON pooter.coop_pipeline_events (coop_id, at DESC);
