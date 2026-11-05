-- Claim Ledger — hardware manufacturers (new entity kind) + security/privacy.
--
-- The ledger so far only records UK MPs, keyed on member_id. This adds the
-- smallest thing that lets it record what a hardware manufacturer published
-- about privacy/security, and check it against a documented outcome, through
-- the SAME pipeline: ledger_claims → ledger_resolutions (proposed) → review
-- queue / staked rounds → published; right of reply via ledger_disputes;
-- calibration via score.ts (n≥20 display gate unchanged).
--
-- What's new:
--   1. pooter.ledger_entities — non-MP entities. Only kind 'manufacturer'.
--   2. ledger_claims.entity_id — who a non-MP claim is attributed to.
--   3. ledger_claims.review_hold — a held claim is NOT public anywhere. Every
--      manufacturer claim must start held (enforced below) and is released
--      only when a resolution on it is published WITH a reviewer identity
--      (enforced by trigger). MP claims are unaffected (default FALSE).
--   4. New vocabulary (TEXT columns, no CHECKs to alter): context
--      'company-statement', topic 'security-privacy', source_kind
--      'company-statement', evidence kinds 'regulator' and 'company'.
--
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING / CREATE OR REPLACE).

CREATE TABLE IF NOT EXISTS pooter.ledger_entities (
  id          TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  kind        TEXT NOT NULL CHECK (kind IN ('manufacturer')),
  name        TEXT NOT NULL,                     -- display name, e.g. 'Ledger'
  legal_name  TEXT,                              -- as stated in a primary source
  country     TEXT,
  website     TEXT,
  products    TEXT[] NOT NULL DEFAULT '{}',      -- product lines the claims concern
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pooter.ledger_claims
  ADD COLUMN IF NOT EXISTS entity_id   TEXT REFERENCES pooter.ledger_entities(id),
  ADD COLUMN IF NOT EXISTS review_hold BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ledger_claims_entity_idx
  ON pooter.ledger_claims (entity_id) WHERE entity_id IS NOT NULL;

-- A claim belongs to an MP or an entity, never both.
ALTER TABLE pooter.ledger_claims DROP CONSTRAINT IF EXISTS ledger_claims_one_subject;
ALTER TABLE pooter.ledger_claims ADD CONSTRAINT ledger_claims_one_subject
  CHECK (entity_id IS NULL OR member_id IS NULL);

-- An entity claim can only be un-held once it has been resolved through
-- review. (The release itself happens in the trigger below.)
ALTER TABLE pooter.ledger_claims DROP CONSTRAINT IF EXISTS ledger_claims_entity_held_until_reviewed;
ALTER TABLE pooter.ledger_claims ADD CONSTRAINT ledger_claims_entity_held_until_reviewed
  CHECK (entity_id IS NULL OR review_hold OR status = 'resolved');

-- Release gate. Both publish paths (approveResolution and a settled staked
-- round) end in ledger_resolutions.status = 'published'; this trigger:
--   * refuses to publish ANY verdict (including 'unresolved', which
--     migration 003 lets through unreviewed) on an entity claim without a
--     reviewer identity, and
--   * releases the claim from hold and marks it resolved.
CREATE OR REPLACE FUNCTION pooter.ledger_release_held_claim() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  claim_entity TEXT;
BEGIN
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  SELECT entity_id INTO claim_entity FROM pooter.ledger_claims WHERE id = NEW.claim_id;
  IF claim_entity IS NOT NULL AND NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'ledger: entity claim % cannot publish without a reviewer', NEW.claim_id;
  END IF;
  UPDATE pooter.ledger_claims
     SET review_hold = FALSE, status = 'resolved'
   WHERE id = NEW.claim_id AND review_hold;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_release_held_claim ON pooter.ledger_resolutions;
CREATE TRIGGER ledger_release_held_claim
  AFTER INSERT OR UPDATE OF status ON pooter.ledger_resolutions
  FOR EACH ROW EXECUTE FUNCTION pooter.ledger_release_held_claim();

-- ── Seed: hardware manufacturers (review-queue entries, NOT published) ─────
-- (seed rows follow in the next commit, once every source is verified)
