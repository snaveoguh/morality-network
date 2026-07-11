-- Claim Ledger — Phase A storage (docs/CLAIM_LEDGER_SPEC.md).
-- Claims only: Phase A publishes UNRESOLVED claims with sources and no
-- verdicts. Resolutions/scores/disputes tables arrive with Phase B alongside
-- the human review gate.

CREATE TABLE IF NOT EXISTS pooter.ledger_claims (
  id                    TEXT PRIMARY KEY,          -- sha256(contribution ext id + verbatim quote), 32 hex chars
  member_id             INTEGER,                   -- Parliament Members API id (canonical identity)
  speaker_name          TEXT NOT NULL,
  party                 TEXT,
  constituency          TEXT,
  verbatim_quote        TEXT NOT NULL,             -- exact substring of the Hansard contribution
  normalized_claim      TEXT NOT NULL,             -- neutral restatement, ledger vocabulary only
  claim_type            TEXT NOT NULL CHECK (claim_type IN ('retrodictable', 'predictive', 'unfalsifiable')),
  topic                 TEXT NOT NULL,
  resolution_due        DATE,                      -- predictive claims with a stated deadline
  source_kind           TEXT NOT NULL,             -- e.g. 'hansard-pmqs'
  source_url            TEXT NOT NULL,             -- deep link to the contribution on hansard.parliament.uk
  contribution_ext_id   TEXT NOT NULL,
  debate_ext_id         TEXT NOT NULL,
  uttered_at            DATE NOT NULL,
  context               TEXT NOT NULL,             -- 'pmqs' for Phase A
  extracted_by          JSONB NOT NULL,            -- {provider, model, version}
  occurrences           INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'unresolved',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ledger_claims_uttered_at_idx
  ON pooter.ledger_claims (uttered_at DESC);
CREATE INDEX IF NOT EXISTS ledger_claims_member_idx
  ON pooter.ledger_claims (member_id);
CREATE INDEX IF NOT EXISTS ledger_claims_debate_idx
  ON pooter.ledger_claims (debate_ext_id);
