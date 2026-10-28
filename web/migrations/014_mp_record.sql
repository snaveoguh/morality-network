-- MP Record — per-MP register database (docs/MP_RECORD_SPEC.md).
-- Writers: scripts/mp-ingest.ts (lib/mp-record + lib/db/mp-record.ts).
-- Readers: /api/mp/*, /mp/*.
--
-- Facts only, from official registers. Fact tables are APPEND-ONLY: a change
-- in a register is a new version row, an entry that leaves a register is a
-- tombstone row (is_removed = TRUE), and the trigger at the bottom rejects
-- UPDATE/DELETE. Identity key: Parliament Members API member_id.

-- ── Audit + operations ──────────────────────────────────────────────────────

-- Every API response body we parsed, verbatim. Identical bodies for the same
-- URL are stored once; seen_count/last_seen_at track re-fetches.
CREATE TABLE IF NOT EXISTS pooter.mp_raw_fetches (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,           -- 'members' | 'interests' | 'electoral_commission' | ...
  url             TEXT NOT NULL,
  http_status     INTEGER NOT NULL,
  content_type    TEXT,
  body            TEXT NOT NULL,
  body_sha256     TEXT NOT NULL,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_count      INTEGER NOT NULL DEFAULT 1,
  UNIQUE (url, body_sha256)
);

CREATE TABLE IF NOT EXISTS pooter.mp_ingest_runs (
  id            TEXT PRIMARY KEY,
  sources       TEXT[] NOT NULL,
  params        JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  cursor        JSONB NOT NULL DEFAULT '{}',  -- {"done": ["5028:members", ...]} — resume skips these
  stats         JSONB NOT NULL DEFAULT '{}',
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

-- A COMPLETE fetch of one scope from one source. "As of" dates on the record
-- are the latest complete check at or before the requested date.
CREATE TABLE IF NOT EXISTS pooter.mp_source_checks (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES pooter.mp_ingest_runs(id),
  source          TEXT NOT NULL,
  scope_key       TEXT NOT NULL,           -- 'member:4366' | 'ec-entity:2863'
  member_id       INTEGER,
  checked_at      TIMESTAMPTZ NOT NULL,
  n_records       INTEGER NOT NULL,
  n_inserted      INTEGER NOT NULL DEFAULT 0,
  n_changed       INTEGER NOT NULL DEFAULT 0,
  n_removed       INTEGER NOT NULL DEFAULT 0,
  raw_fetch_ids   BIGINT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS mp_source_checks_member_idx
  ON pooter.mp_source_checks (member_id, source, checked_at DESC);
CREATE INDEX IF NOT EXISTS mp_source_checks_scope_idx
  ON pooter.mp_source_checks (scope_key, source, checked_at DESC);

-- ── Versioned fact tables ───────────────────────────────────────────────────
-- Common provenance on every row: scope_key, source_record_id, version,
-- is_removed, source_url (human page), source_api_url (endpoint fetched),
-- retrieved_at, content_hash (sha256 of canonical JSON, recipe
-- mp-record-hash-v1), raw_fetch_id, parser_version.

CREATE TABLE IF NOT EXISTS pooter.mp_members (
  row_id                  BIGSERIAL PRIMARY KEY,
  member_id               INTEGER NOT NULL,
  name_display            TEXT,
  name_list               TEXT,
  name_full_title         TEXT,
  name_address_as         TEXT,
  gender                  TEXT,
  house                   TEXT,             -- 'Commons' | 'Lords'
  latest_party_id         INTEGER,
  latest_party_name       TEXT,
  constituency_id         INTEGER,
  constituency_name       TEXT,
  membership_start_date   DATE,
  membership_end_date     DATE,
  membership_end_reason   TEXT,
  status_is_active        BOOLEAN,
  status_description      TEXT,
  thumbnail_url           TEXT,
  scope_key               TEXT NOT NULL,
  source_record_id        TEXT NOT NULL,
  version                 INTEGER NOT NULL CHECK (version >= 1),
  is_removed              BOOLEAN NOT NULL DEFAULT FALSE,
  source_url              TEXT NOT NULL,
  source_api_url          TEXT NOT NULL,
  retrieved_at            TIMESTAMPTZ NOT NULL,
  content_hash            TEXT NOT NULL,
  raw_fetch_id            BIGINT REFERENCES pooter.mp_raw_fetches(id),
  parser_version          TEXT NOT NULL,
  UNIQUE (scope_key, source_record_id, version)
);

CREATE TABLE IF NOT EXISTS pooter.mp_member_periods (
  row_id                  BIGSERIAL PRIMARY KEY,
  member_id               INTEGER NOT NULL,
  kind                    TEXT NOT NULL CHECK (kind IN (
                            'party', 'constituency', 'house', 'government_post',
                            'opposition_post', 'other_post', 'committee')),
  name                    TEXT,
  org_id                  INTEGER,
  house                   TEXT,
  start_date              DATE,
  end_date                DATE,
  additional_info         TEXT,
  additional_info_link    TEXT,
  scope_key               TEXT NOT NULL,
  source_record_id        TEXT NOT NULL,     -- '<kind>:<org_id>:<start_date>'
  version                 INTEGER NOT NULL CHECK (version >= 1),
  is_removed              BOOLEAN NOT NULL DEFAULT FALSE,
  source_url              TEXT NOT NULL,
  source_api_url          TEXT NOT NULL,
  retrieved_at            TIMESTAMPTZ NOT NULL,
  content_hash            TEXT NOT NULL,
  raw_fetch_id            BIGINT REFERENCES pooter.mp_raw_fetches(id),
  parser_version          TEXT NOT NULL,
  UNIQUE (scope_key, source_record_id, version)
);

-- Register of Members' Financial Interests. Parent and child entries are
-- flattened; a child payment carries parent_interest_id and the payer named
-- on its parent entry (copied from the register, flagged payer_from_parent).
CREATE TABLE IF NOT EXISTS pooter.mp_interests (
  row_id                  BIGSERIAL PRIMARY KEY,
  member_id               INTEGER NOT NULL,
  interest_id             INTEGER NOT NULL,
  parent_interest_id      INTEGER,
  category_id             INTEGER,
  category_number         TEXT,
  category_name           TEXT,
  summary                 TEXT,              -- register wording, verbatim
  payer_or_donor_name     TEXT,
  payer_from_parent       BOOLEAN NOT NULL DEFAULT FALSE,
  counterparty_kind       TEXT NOT NULL DEFAULT 'unknown'
                            CHECK (counterparty_kind IN ('organisation', 'person', 'unknown')),
  value_gbp               NUMERIC(14, 2),    -- stated value when currency is GBP
  value_amount            NUMERIC(14, 2),    -- stated value in value_currency
  value_currency          TEXT,
  is_regular_payment      BOOLEAN NOT NULL DEFAULT FALSE,  -- category 1.2: value is per period
  received_date           DATE,
  start_date              DATE,
  end_date                DATE,
  registration_date       DATE,
  published_date          DATE,
  updated_dates           JSONB NOT NULL DEFAULT '[]',
  rectified               BOOLEAN NOT NULL DEFAULT FALSE,
  rectified_details       TEXT,
  fields                  JSONB NOT NULL DEFAULT '[]',     -- every register field, verbatim
  scope_key               TEXT NOT NULL,
  source_record_id        TEXT NOT NULL,     -- interest id
  version                 INTEGER NOT NULL CHECK (version >= 1),
  is_removed              BOOLEAN NOT NULL DEFAULT FALSE,
  source_url              TEXT NOT NULL,
  source_api_url          TEXT NOT NULL,
  retrieved_at            TIMESTAMPTZ NOT NULL,
  content_hash            TEXT NOT NULL,
  raw_fetch_id            BIGINT REFERENCES pooter.mp_raw_fetches(id),
  parser_version          TEXT NOT NULL,
  UNIQUE (scope_key, source_record_id, version)
);

CREATE INDEX IF NOT EXISTS mp_interests_member_idx
  ON pooter.mp_interests (member_id, interest_id, version DESC);

-- Electoral Commission donations to a regulated donee. Not keyed on member:
-- joined to an MP only through a CONFIRMED mp_source_links row.
CREATE TABLE IF NOT EXISTS pooter.mp_donations (
  row_id                      BIGSERIAL PRIMARY KEY,
  ec_ref                      TEXT NOT NULL,
  regulated_entity_id         INTEGER NOT NULL,
  regulated_entity_name       TEXT,
  regulated_entity_type       TEXT,
  regulated_donee_type        TEXT,
  donor_id                    INTEGER,
  donor_name                  TEXT,
  donor_status                TEXT,
  counterparty_kind           TEXT NOT NULL DEFAULT 'unknown'
                                CHECK (counterparty_kind IN ('organisation', 'person', 'unknown')),
  company_registration_number TEXT,
  value_gbp                   NUMERIC(14, 2),
  donation_type               TEXT,
  nature_of_donation          TEXT,
  purpose_of_visit            TEXT,
  donation_action             TEXT,
  accepted_date               DATE,
  received_date               DATE,
  reported_date               DATE,
  reporting_period_name       TEXT,
  is_sponsorship              BOOLEAN,
  is_aggregation              BOOLEAN,
  is_bequest                  BOOLEAN,
  register_name               TEXT,
  raw_row                     JSONB NOT NULL DEFAULT '{}',  -- the export row, verbatim
  scope_key                   TEXT NOT NULL,     -- 'ec-entity:<regulated_entity_id>'
  source_record_id            TEXT NOT NULL,     -- ECRef
  version                     INTEGER NOT NULL CHECK (version >= 1),
  is_removed                  BOOLEAN NOT NULL DEFAULT FALSE,
  source_url                  TEXT NOT NULL,
  source_api_url              TEXT NOT NULL,
  retrieved_at                TIMESTAMPTZ NOT NULL,
  content_hash                TEXT NOT NULL,
  raw_fetch_id                BIGINT REFERENCES pooter.mp_raw_fetches(id),
  parser_version              TEXT NOT NULL,
  UNIQUE (scope_key, source_record_id, version)
);

CREATE INDEX IF NOT EXISTS mp_donations_entity_idx
  ON pooter.mp_donations (regulated_entity_id, ec_ref, version DESC);

-- Companies House officer appointments (ingester is a stub — needs API key).
CREATE TABLE IF NOT EXISTS pooter.mp_directorships (
  row_id                  BIGSERIAL PRIMARY KEY,
  ch_officer_id           TEXT NOT NULL,
  officer_name            TEXT,
  company_number          TEXT NOT NULL,
  company_name            TEXT,
  company_status          TEXT,
  officer_role            TEXT,
  appointed_on            DATE,
  resigned_on             DATE,
  scope_key               TEXT NOT NULL,     -- 'ch-officer:<officer_id>'
  source_record_id        TEXT NOT NULL,     -- '<company_number>:<role>:<appointed_on>'
  version                 INTEGER NOT NULL CHECK (version >= 1),
  is_removed              BOOLEAN NOT NULL DEFAULT FALSE,
  source_url              TEXT NOT NULL,
  source_api_url          TEXT NOT NULL,
  retrieved_at            TIMESTAMPTZ NOT NULL,
  content_hash            TEXT NOT NULL,
  raw_fetch_id            BIGINT REFERENCES pooter.mp_raw_fetches(id),
  parser_version          TEXT NOT NULL,
  UNIQUE (scope_key, source_record_id, version)
);

-- Register of All-Party Parliamentary Groups (ingester is a stub).
CREATE TABLE IF NOT EXISTS pooter.mp_appgs (
  row_id                  BIGSERIAL PRIMARY KEY,
  appg_name               TEXT NOT NULL,
  officer_name_as_registered TEXT NOT NULL,
  officer_role            TEXT,
  register_edition        DATE NOT NULL,
  scope_key               TEXT NOT NULL,     -- 'appg-officer:<name as registered>'
  source_record_id        TEXT NOT NULL,     -- '<appg_name>:<role>'
  version                 INTEGER NOT NULL CHECK (version >= 1),
  is_removed              BOOLEAN NOT NULL DEFAULT FALSE,
  source_url              TEXT NOT NULL,
  source_api_url          TEXT NOT NULL,
  retrieved_at            TIMESTAMPTZ NOT NULL,
  content_hash            TEXT NOT NULL,
  raw_fetch_id            BIGINT REFERENCES pooter.mp_raw_fetches(id),
  parser_version          TEXT NOT NULL,
  UNIQUE (scope_key, source_record_id, version)
);

-- ── Reviewed identity links (registers that do not carry member_id) ─────────

CREATE TABLE IF NOT EXISTS pooter.mp_source_links (
  id              BIGSERIAL PRIMARY KEY,
  member_id       INTEGER NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('electoral_commission', 'companies_house', 'appg')),
  external_id     TEXT NOT NULL,             -- EC regulated entity id | CH officer id | APPG name string
  external_name   TEXT,
  match_method    TEXT NOT NULL,             -- 'rule:ec-exact-name-v1' | 'llm:<model>' | 'manual'
  match_evidence  JSONB NOT NULL DEFAULT '{}',
  confidence      TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  proposed_by     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id, member_id),
  -- a confirmed or rejected link always names its human reviewer
  CONSTRAINT mp_source_links_review_named CHECK (
    status = 'proposed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  -- an LLM may propose; only a human confirms
  CONSTRAINT mp_source_links_no_llm_reviewer CHECK (
    reviewed_by IS NULL OR reviewed_by NOT LIKE 'llm:%'
  )
);

CREATE TABLE IF NOT EXISTS pooter.mp_source_link_reviews (
  id            BIGSERIAL PRIMARY KEY,
  link_id       BIGINT NOT NULL REFERENCES pooter.mp_source_links(id),
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  reviewed_by   TEXT NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Corrections log + right of reply ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooter.mp_corrections (
  id              BIGSERIAL PRIMARY KEY,
  member_id       INTEGER,                   -- NULL = site-wide
  subject_table   TEXT,                      -- e.g. 'mp_interests'
  subject_record  TEXT,                      -- source_record_id or stat id
  what_was_wrong  TEXT NOT NULL,
  what_changed    TEXT NOT NULL,
  reported_by     TEXT,                      -- 'member office' | 'reader' | 'internal'
  reported_at     TIMESTAMPTZ,
  corrected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  corrected_by    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mp_corrections_member_idx
  ON pooter.mp_corrections (member_id, corrected_at DESC);

CREATE TABLE IF NOT EXISTS pooter.mp_replies (
  id              TEXT PRIMARY KEY,          -- sha256(member|subject|contact|body), 32 hex
  member_id       INTEGER NOT NULL,
  subject_table   TEXT,
  subject_record  TEXT,
  body            TEXT NOT NULL,
  contact         TEXT NOT NULL,             -- never published
  identity        TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'withdrawn')),
  response        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mp_replies_member_idx
  ON pooter.mp_replies (member_id, status);

-- ── Current + public views ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW pooter.mp_members_current AS
  SELECT * FROM (
    SELECT DISTINCT ON (scope_key, source_record_id) *
    FROM pooter.mp_members
    ORDER BY scope_key, source_record_id, version DESC
  ) latest
  WHERE NOT is_removed;

CREATE OR REPLACE VIEW pooter.mp_member_periods_current AS
  SELECT * FROM (
    SELECT DISTINCT ON (scope_key, source_record_id) *
    FROM pooter.mp_member_periods
    ORDER BY scope_key, source_record_id, version DESC
  ) latest
  WHERE NOT is_removed;

CREATE OR REPLACE VIEW pooter.mp_interests_current AS
  SELECT * FROM (
    SELECT DISTINCT ON (scope_key, source_record_id) *
    FROM pooter.mp_interests
    ORDER BY scope_key, source_record_id, version DESC
  ) latest
  WHERE NOT is_removed;

CREATE OR REPLACE VIEW pooter.mp_donations_current AS
  SELECT * FROM (
    SELECT DISTINCT ON (scope_key, source_record_id) *
    FROM pooter.mp_donations
    ORDER BY scope_key, source_record_id, version DESC
  ) latest
  WHERE NOT is_removed;

CREATE OR REPLACE VIEW pooter.mp_directorships_current AS
  SELECT * FROM (
    SELECT DISTINCT ON (scope_key, source_record_id) *
    FROM pooter.mp_directorships
    ORDER BY scope_key, source_record_id, version DESC
  ) latest
  WHERE NOT is_removed;

CREATE OR REPLACE VIEW pooter.mp_appgs_current AS
  SELECT * FROM (
    SELECT DISTINCT ON (scope_key, source_record_id) *
    FROM pooter.mp_appgs
    ORDER BY scope_key, source_record_id, version DESC
  ) latest
  WHERE NOT is_removed;

-- Public views: external-register rows reach an MP only via a CONFIRMED link.
CREATE OR REPLACE VIEW pooter.mp_donations_public AS
  SELECT l.member_id, d.*
  FROM pooter.mp_donations_current d
  JOIN pooter.mp_source_links l
    ON l.source = 'electoral_commission'
   AND l.status = 'confirmed'
   AND l.external_id = d.regulated_entity_id::text;

CREATE OR REPLACE VIEW pooter.mp_directorships_public AS
  SELECT l.member_id, d.*
  FROM pooter.mp_directorships_current d
  JOIN pooter.mp_source_links l
    ON l.source = 'companies_house'
   AND l.status = 'confirmed'
   AND l.external_id = d.ch_officer_id;

CREATE OR REPLACE VIEW pooter.mp_appgs_public AS
  SELECT l.member_id, a.*
  FROM pooter.mp_appgs_current a
  JOIN pooter.mp_source_links l
    ON l.source = 'appg'
   AND l.status = 'confirmed'
   AND l.external_id = a.officer_name_as_registered;

-- One row per register-stated tie. Built ONLY from public views; nothing
-- inferred. counterparty_kind comes from the register's own status fields.
CREATE OR REPLACE VIEW pooter.mp_ties AS
  SELECT member_id,
         'interest:' || COALESCE(category_number, '?') AS tie_type,
         payer_or_donor_name AS counterparty_name,
         counterparty_kind,
         value_gbp,
         COALESCE(start_date, received_date, registration_date) AS period_start,
         end_date AS period_end,
         summary AS register_wording,
         source_url, source_record_id, 'mp_interests' AS source_table,
         retrieved_at, content_hash,
         -- Category 1.2 values are per period (e.g. monthly), never a total.
         CASE WHEN is_regular_payment THEN COALESCE(
           (SELECT f->>'value' FROM jsonb_array_elements(fields) f
             WHERE f->>'name' = 'RegularityOfPayment' LIMIT 1),
           'not stated') END AS payment_regularity
  FROM pooter.mp_interests_current
  WHERE payer_or_donor_name IS NOT NULL
  UNION ALL
  SELECT member_id,
         'ec_donation',
         donor_name,
         counterparty_kind,
         value_gbp,
         accepted_date,
         NULL::date,
         COALESCE(nature_of_donation, purpose_of_visit, donation_type),
         source_url, source_record_id, 'mp_donations',
         retrieved_at, content_hash, NULL::text
  FROM pooter.mp_donations_public
  UNION ALL
  SELECT member_id,
         'directorship',
         company_name,
         'organisation',
         NULL::numeric,
         appointed_on,
         resigned_on,
         officer_role,
         source_url, source_record_id, 'mp_directorships',
         retrieved_at, content_hash, NULL::text
  FROM pooter.mp_directorships_public
  UNION ALL
  SELECT member_id,
         'appg_officer',
         appg_name,
         'organisation',
         NULL::numeric,
         register_edition,
         NULL::date,
         officer_role,
         source_url, source_record_id, 'mp_appgs',
         retrieved_at, content_hash, NULL::text
  FROM pooter.mp_appgs_public;

-- ── Immutability ────────────────────────────────────────────────────────────
-- Fact rows are never updated or deleted. Break-glass (court order / valid
-- erasure request) is documented in MP_RECORD_SPEC.md §11 and must be logged
-- in mp_corrections.

CREATE OR REPLACE FUNCTION pooter.mp_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pooter.% is append-only (MP_RECORD_SPEC §4.4): % rejected',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mp_members_append_only ON pooter.mp_members;
CREATE TRIGGER mp_members_append_only BEFORE UPDATE OR DELETE ON pooter.mp_members
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_member_periods_append_only ON pooter.mp_member_periods;
CREATE TRIGGER mp_member_periods_append_only BEFORE UPDATE OR DELETE ON pooter.mp_member_periods
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_interests_append_only ON pooter.mp_interests;
CREATE TRIGGER mp_interests_append_only BEFORE UPDATE OR DELETE ON pooter.mp_interests
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_donations_append_only ON pooter.mp_donations;
CREATE TRIGGER mp_donations_append_only BEFORE UPDATE OR DELETE ON pooter.mp_donations
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_directorships_append_only ON pooter.mp_directorships;
CREATE TRIGGER mp_directorships_append_only BEFORE UPDATE OR DELETE ON pooter.mp_directorships
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_appgs_append_only ON pooter.mp_appgs;
CREATE TRIGGER mp_appgs_append_only BEFORE UPDATE OR DELETE ON pooter.mp_appgs
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_source_link_reviews_append_only ON pooter.mp_source_link_reviews;
CREATE TRIGGER mp_source_link_reviews_append_only BEFORE UPDATE OR DELETE ON pooter.mp_source_link_reviews
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
DROP TRIGGER IF EXISTS mp_corrections_append_only ON pooter.mp_corrections;
CREATE TRIGGER mp_corrections_append_only BEFORE UPDATE OR DELETE ON pooter.mp_corrections
  FOR EACH ROW EXECUTE FUNCTION pooter.mp_forbid_mutation();
