-- Claim Ledger — track ingested debates explicitly.
-- Previously "ingested" was inferred from stored claims, which retries a
-- debate forever when extraction legitimately yields zero claims (observed
-- on the 2010-03-24 Financial Statement). Attempts are recorded here
-- regardless of claim count, so the backfill actually advances.

CREATE TABLE IF NOT EXISTS pooter.ledger_ingested_debates (
  debate_ext_id  TEXT PRIMARY KEY,
  context        TEXT NOT NULL,
  sitting_date   DATE,
  claims_count   INTEGER NOT NULL DEFAULT 0,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed from claims already stored, so past ingests are not repeated.
INSERT INTO pooter.ledger_ingested_debates (debate_ext_id, context, sitting_date, claims_count)
SELECT debate_ext_id, MIN(context), MIN(uttered_at), COUNT(*)
FROM pooter.ledger_claims
GROUP BY debate_ext_id
ON CONFLICT (debate_ext_id) DO NOTHING;
