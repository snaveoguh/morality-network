-- Corrections register (prototype) — ministers correcting the record.
-- Writers: scripts/backfill-corrections.ts. Readers: /ledger/corrections.
-- Facts only: a correction is on the official record; nothing here is a
-- verdict. Matches to ledger claims are PROPOSALS for human review.

CREATE TABLE IF NOT EXISTS pooter.ministerial_corrections (
  id               TEXT PRIMARY KEY,   -- 'wq:<questionId>' | 'wms:<uin>' | 'poo:<contributionExtId>'
  kind             TEXT NOT NULL CHECK (kind IN ('written-answer', 'written-statement', 'oral-point-of-order')),
  house            TEXT NOT NULL,
  corrected_on     DATE NOT NULL,
  member_id        INTEGER,            -- Parliament Members API id
  member_name      TEXT NOT NULL,
  party            TEXT,
  member_role      TEXT,
  department       TEXT,
  heading          TEXT NOT NULL,
  original_date    DATE,               -- date of the statement being corrected, when the record fixes it
  original_url     TEXT,
  original_ref     TEXT,               -- UIN of the corrected PQ / WMS
  original_text    TEXT,
  corrected_text   TEXT NOT NULL,
  correction_url   TEXT NOT NULL,
  days_to_correct  INTEGER,
  needs_review     BOOLEAN NOT NULL DEFAULT FALSE,  -- oral candidates: a human confirms it is a ministerial self-correction
  also_laid_in     TEXT,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ministerial_corrections_corrected_on_idx
  ON pooter.ministerial_corrections (corrected_on DESC);
CREATE INDEX IF NOT EXISTS ministerial_corrections_member_idx
  ON pooter.ministerial_corrections (member_id);

-- Correction ↔ claim match proposals (deterministic matcher, no model).
-- status stays 'proposed' until a human confirms or rejects.
CREATE TABLE IF NOT EXISTS pooter.correction_claim_matches (
  correction_id    TEXT NOT NULL REFERENCES pooter.ministerial_corrections(id),
  claim_id         TEXT NOT NULL REFERENCES pooter.ledger_claims(id),
  score            REAL NOT NULL,
  confidence       TEXT NOT NULL CHECK (confidence IN ('high', 'low')),
  reasons          JSONB NOT NULL DEFAULT '[]',
  matcher_version  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  reviewed_by      TEXT,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (correction_id, claim_id)
);
