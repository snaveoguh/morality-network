-- Claim Ledger — negative-verdict clearance gate (solicitor review 2026-07-24).
--
-- The instructed media solicitor's clear view: do NOT publish negative
-- (false/partial) verdicts about a living natural person on the current
-- public-facing structure. Deceased subjects carry no UK GDPR exposure and
-- may pilot first, but only as a deliberate, audited decision.
--
-- The data model has NO living/deceased signal, so the system cannot decide
-- this automatically. The only safe rule is: negative verdicts are OFF by
-- default for every attributed subject, and a subject must be EXPLICITLY
-- cleared before a negative verdict about them can publish. Clearing a
-- subject is a human act on the record — deceased, or a completed
-- living-person legal pass (lawful basis, Article 14 notice, rectification
-- route, criminal-offence-data review).
--
-- This mirrors the existing human-review gate: enforced at the DB layer
-- (a trigger, since a CHECK constraint cannot read another table), not just
-- in application code.

CREATE TABLE IF NOT EXISTS pooter.ledger_negative_clearance (
  member_id   INTEGER PRIMARY KEY,          -- canonical Parliament Members API id
  reason      TEXT NOT NULL,                 -- e.g. 'deceased 2023; solicitor-cleared 2026-07-24'
  cleared_by  TEXT NOT NULL,                 -- 'human:<address|bearer>'
  cleared_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pooter.ledger_negative_clearance IS
  'Subjects explicitly cleared for negative (false/partial) verdicts. Empty = no negatives publish. Append-only in practice; each row is an audited decision.';

-- The gate. Blocks any false/partial verdict from reaching status=published
-- when its claim is attributed to a natural person (member_id NOT NULL) who
-- is not on the clearance list. Party/institutional claims (member_id NULL,
-- e.g. manifesto lines attributed to a party) are not natural-person verdicts
-- and are not gated here — they still pass the human-review gate.
CREATE OR REPLACE FUNCTION pooter.ledger_enforce_negative_clearance()
RETURNS TRIGGER AS $$
DECLARE
  subject_member INTEGER;
BEGIN
  IF NEW.status = 'published' AND NEW.verdict IN ('false', 'partial') THEN
    SELECT member_id INTO subject_member
      FROM pooter.ledger_claims
      WHERE id = NEW.claim_id;

    IF subject_member IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pooter.ledger_negative_clearance
         WHERE member_id = subject_member
       )
    THEN
      RAISE EXCEPTION
        'negative verdict for member % blocked: subject not cleared for negative verdicts (pooter.ledger_negative_clearance)',
        subject_member
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_negative_clearance_gate ON pooter.ledger_resolutions;
CREATE TRIGGER ledger_negative_clearance_gate
  BEFORE INSERT OR UPDATE ON pooter.ledger_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION pooter.ledger_enforce_negative_clearance();

-- To pilot the deceased Darling specimens, an operator adds the clearance as a
-- deliberate audited act, using his verified Members API id, e.g.:
--   INSERT INTO pooter.ledger_negative_clearance (member_id, reason, cleared_by)
--   VALUES (<darling_member_id>, 'deceased 2023; solicitor-cleared 2026-07-24 (deceased-subject pilot)', 'human:<operator>');
-- Do NOT guess the id — clearing the wrong id could clear a living person.
