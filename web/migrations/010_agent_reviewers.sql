-- Agent reviewers — labelled as agents, weighted below humans, and structurally
-- incapable of publishing a negative verdict on their own.
--
-- Agents can carry the volume: 1,780 claims are unresolved and humans will not
-- get through them. But three things make naive agent review worse than none.
--
-- 1. CORRELATED FAILURE. 14 of the first 15 resolutions were proposed by
--    agent:openai/gpt-4o@resolve-v1. Three gpt-4o reviewers agreeing with a
--    gpt-4o proposal is one judgment repeated, not three. Hence: no agent may
--    review a resolution proposed by its own model, and no two agents from the
--    same model may sit in the same round.
--
-- 2. THE LEGAL GATE. Migration 003 exists because publishing "this MP said
--    something false" without a person signing off is legal exposure. A weight
--    system alone would let four agents out-vote the threshold and publish with
--    no human involved, quietly repealing that gate. Hence: a 'false' or
--    'partial' verdict cannot publish unless a HUMAN voted with the majority —
--    enforced here, not in application code.
--
-- 3. STAKE NEEDS AN OWNER. An agent owns nothing, so it cannot be punished. Its
--    operator stakes and its operator is slashed. That way running a careless
--    model costs money.
--
-- Weighting: human votes count 2, agent votes count 1, so two agents substitute
-- for one human on volume — but never on the human floor above.

ALTER TABLE pooter.ledger_reviewers
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'human'
    CHECK (kind IN ('human', 'agent')),
  -- 'provider/model@version', matching ledger_resolutions.resolved_by's suffix.
  ADD COLUMN IF NOT EXISTS model_id TEXT,
  -- Whose MO is staked and slashed for this reviewer's votes. For a human this
  -- is their own account; for an agent it is the operator who runs it.
  ADD COLUMN IF NOT EXISTS operator_account_id BIGINT
    REFERENCES pooter.accounts (id) ON DELETE CASCADE;

-- An agent must declare its model and its operator. A human must not claim one.
ALTER TABLE pooter.ledger_reviewers DROP CONSTRAINT IF EXISTS reviewer_kind_shape;
ALTER TABLE pooter.ledger_reviewers ADD CONSTRAINT reviewer_kind_shape CHECK (
  (kind = 'agent' AND model_id IS NOT NULL AND operator_account_id IS NOT NULL)
  OR (kind = 'human' AND model_id IS NULL)
);

CREATE INDEX IF NOT EXISTS ledger_reviewers_kind_idx ON pooter.ledger_reviewers (kind, status);

-- ── Weighted rounds ────────────────────────────────────────────────────────
ALTER TABLE pooter.ledger_review_rounds
  ADD COLUMN IF NOT EXISTS quorum_weight    SMALLINT NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS threshold_weight SMALLINT NOT NULL DEFAULT 4,
  -- Set at settle: did a human vote WITH the winning side? Not merely "was a
  -- human present" — a human outvoted by agents is worse than no human at all,
  -- because it publishes over a person's stated objection.
  ADD COLUMN IF NOT EXISTS human_in_majority BOOLEAN,
  -- Copied from the resolution at open time so the constraint below can see it
  -- without a join.
  ADD COLUMN IF NOT EXISTS verdict_is_negative BOOLEAN NOT NULL DEFAULT FALSE;

-- THE GATE, restated for weighted quorums: a negative verdict may not settle as
-- 'approve' unless a human was in the majority.
ALTER TABLE pooter.ledger_review_rounds DROP CONSTRAINT IF EXISTS review_negative_needs_human;
ALTER TABLE pooter.ledger_review_rounds ADD CONSTRAINT review_negative_needs_human CHECK (
  status <> 'settled'
  OR outcome <> 'approve'
  OR verdict_is_negative = FALSE
  OR human_in_majority = TRUE
);

-- ── Per-assignment reviewer identity ───────────────────────────────────────
-- Denormalised onto the assignment so a settled round's composition stays
-- readable even if a reviewer later changes kind or leaves.
ALTER TABLE pooter.ledger_review_assignments
  ADD COLUMN IF NOT EXISTS reviewer_kind TEXT NOT NULL DEFAULT 'human'
    CHECK (reviewer_kind IN ('human', 'agent')),
  ADD COLUMN IF NOT EXISTS reviewer_model_id TEXT,
  ADD COLUMN IF NOT EXISTS vote_weight SMALLINT NOT NULL DEFAULT 2,
  -- The account actually staked/slashed — the operator for agents.
  ADD COLUMN IF NOT EXISTS staked_account_id BIGINT
    REFERENCES pooter.accounts (id) ON DELETE CASCADE;

-- One agent model appears at most once per round: two instances of the same
-- model are one opinion, and paying twice for it buys nothing.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_review_one_model_per_round_idx
  ON pooter.ledger_review_assignments (round_id, reviewer_model_id)
  WHERE reviewer_model_id IS NOT NULL;

-- ── Published-verdict provenance ───────────────────────────────────────────
-- Readers are entitled to know whether a verdict was signed off by people or
-- by machines. Never present an agent-reviewed verdict as human-reviewed.
CREATE OR REPLACE VIEW pooter.ledger_verdict_provenance AS
SELECT
  r.id                                                            AS resolution_id,
  r.claim_id,
  r.verdict,
  r.status,
  rr.id                                                           AS round_id,
  COUNT(*) FILTER (WHERE a.reviewer_kind = 'human'
                     AND a.vote IS NOT NULL)::int                 AS human_votes,
  COUNT(*) FILTER (WHERE a.reviewer_kind = 'agent'
                     AND a.vote IS NOT NULL)::int                 AS agent_votes,
  rr.human_in_majority,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT a.reviewer_model_id), NULL)     AS agent_models
FROM pooter.ledger_resolutions r
JOIN pooter.ledger_review_rounds rr       ON rr.resolution_id = r.id
LEFT JOIN pooter.ledger_review_assignments a ON a.round_id = rr.id
GROUP BY r.id, r.claim_id, r.verdict, r.status, rr.id, rr.human_in_majority;
