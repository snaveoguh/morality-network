-- Claim Ledger — published basis summary (solicitor review 2026-07-24, Q4/§c).
--
-- The solicitor requires "a short basis summary next to every verdict label".
-- The agent's `reasoning` is internal (shown to the reviewer, never published).
-- This is the SEPARATE, published, one-sentence basis authored/confirmed by the
-- reviewer at approval, screened against the motive-vocabulary blocklist before
-- it can be stored. Null for pre-existing verdicts; the public UI falls back to
-- the evidence chain when absent.

ALTER TABLE pooter.ledger_resolutions
  ADD COLUMN IF NOT EXISTS basis_summary TEXT;

COMMENT ON COLUMN pooter.ledger_resolutions.basis_summary IS
  'Published one-sentence basis shown beside the verdict label. Reviewer-authored at approval, motive-screened. Distinct from reasoning (internal).';
