-- Claim Ledger — Phase B: resolutions + disputes (docs/CLAIM_LEDGER_SPEC.md).
--
-- The human review gate is enforced HERE, not just in application code:
-- a 'false' or 'partial' verdict physically cannot reach status='published'
-- without a reviewer identity. Agents propose; humans sign off.

CREATE TABLE IF NOT EXISTS pooter.ledger_resolutions (
  id            TEXT PRIMARY KEY,                -- sha256(claim_id + proposal nonce), 32 hex
  claim_id      TEXT NOT NULL REFERENCES pooter.ledger_claims(id),
  verdict       TEXT NOT NULL CHECK (verdict IN ('true', 'false', 'partial', 'unresolved')),
  -- evidence: [{url, excerpt, kind}] — urls are constructed server-side from
  -- verified records, never model output. Everything except 'unresolved'
  -- requires at least one evidence entry (enforced below).
  evidence      JSONB NOT NULL DEFAULT '[]',
  reasoning     TEXT NOT NULL DEFAULT '',        -- agent's stated basis, shown to the reviewer
  resolved_by   TEXT NOT NULL,                   -- 'agent:<provider>/<model>@<version>' or 'human:<id>'
  reviewed_by   TEXT,                            -- 'human:<address|bearer>' — set on approval
  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'published', 'rejected')),
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ,

  -- THE GATE (spec §Pipeline, non-negotiable): negative verdicts require a
  -- human reviewer before publication.
  CONSTRAINT ledger_negative_verdict_requires_review CHECK (
    status <> 'published'
    OR verdict NOT IN ('false', 'partial')
    OR reviewed_by IS NOT NULL
  ),
  -- No verdict without a document chain: only 'unresolved' may publish
  -- with empty evidence.
  CONSTRAINT ledger_verdict_requires_evidence CHECK (
    status <> 'published'
    OR verdict = 'unresolved'
    OR jsonb_array_length(evidence) >= 1
  )
);

CREATE INDEX IF NOT EXISTS ledger_resolutions_claim_idx
  ON pooter.ledger_resolutions (claim_id);
CREATE INDEX IF NOT EXISTS ledger_resolutions_status_idx
  ON pooter.ledger_resolutions (status, created_at DESC);

-- One live (non-rejected) resolution per claim.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_resolutions_one_live_per_claim
  ON pooter.ledger_resolutions (claim_id)
  WHERE status <> 'rejected';

-- Right of reply (spec §Legal guardrails): scored figures can attach a
-- dispute/response to any claim. Phase B creates the table; the verified
-- submission flow ships with per-entity pages.
CREATE TABLE IF NOT EXISTS pooter.ledger_disputes (
  id          TEXT PRIMARY KEY,
  claim_id    TEXT NOT NULL REFERENCES pooter.ledger_claims(id),
  raised_by   TEXT NOT NULL,                     -- 'entity:<member_id>' | 'public:<contact>'
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'withdrawn')),
  response    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ledger_disputes_claim_idx
  ON pooter.ledger_disputes (claim_id);
