-- Claim Ledger — staked peer review.
--
-- Migration 003 established the gate: a 'false' or 'partial' verdict cannot
-- publish without a human reviewer. That gate currently has exactly one human
-- behind it, and 14 of 15 proposed resolutions are stuck against it. This
-- migration widens the gate without lowering it.
--
-- Three reviewers are assigned at random, each stakes MO to accept, and each
-- submits BLIND — nobody sees another vote until all are in. Two agreeing
-- votes publish. Stake is returned to everyone including dissenters; only a
-- later successful dispute slashes, and only those who approved.
--
-- Every design choice below exists to make careless approval unprofitable
-- WITHOUT punishing honest disagreement. Punishing the minority would end
-- dissent within a week and leave the appearance of review with none of the
-- substance.
--
-- MO never moves directly here. All credits and slashes are written as rows in
-- pooter.mo_ledger, so a reviewer's balance remains the sum of an append-only
-- history and every payment has a traceable reason.

-- ── Reviewer roster ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pooter.ledger_reviewers (
  account_id      BIGINT PRIMARY KEY REFERENCES pooter.accounts (id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'suspended')),
  -- Declared conflicts: parties or member_ids this reviewer must never be
  -- assigned. Self-declared, and assignment honours it.
  conflicts       JSONB NOT NULL DEFAULT '[]',
  reviews_total   INTEGER NOT NULL DEFAULT 0,
  reviews_agreed  INTEGER NOT NULL DEFAULT 0,   -- landed with the majority
  overturned      INTEGER NOT NULL DEFAULT 0,   -- approved something later reversed
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Review rounds ──────────────────────────────────────────────────────────
-- One round per resolution needing human sign-off.
CREATE TABLE IF NOT EXISTS pooter.ledger_review_rounds (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resolution_id   TEXT NOT NULL REFERENCES pooter.ledger_resolutions (id) ON DELETE CASCADE,
  quorum          SMALLINT NOT NULL DEFAULT 3,
  threshold       SMALLINT NOT NULL DEFAULT 2,   -- agreeing votes needed to settle
  stake_mo        NUMERIC(38, 8) NOT NULL,       -- per reviewer, locked on accept
  reward_mo       NUMERIC(38, 8) NOT NULL,       -- per agreeing reviewer, on settle
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'settled', 'escalated', 'abandoned')),
  outcome         TEXT CHECK (outcome IN ('approve', 'reject', 'more_evidence')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,

  -- Stake must meaningfully exceed the reward, or lazy approval stays
  -- profitable. 5x is the floor; see docs for the expected-value argument.
  CONSTRAINT review_stake_exceeds_reward CHECK (stake_mo >= reward_mo * 5),
  CONSTRAINT review_threshold_sane CHECK (threshold > quorum / 2 AND threshold <= quorum),
  CONSTRAINT review_settled_has_outcome CHECK (status <> 'settled' OR outcome IS NOT NULL)
);

-- One live round per resolution.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_review_rounds_one_live_idx
  ON pooter.ledger_review_rounds (resolution_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS ledger_review_rounds_status_idx
  ON pooter.ledger_review_rounds (status, opened_at DESC);

-- ── Assignments and blind votes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pooter.ledger_review_assignments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id      BIGINT NOT NULL REFERENCES pooter.ledger_review_rounds (id) ON DELETE CASCADE,
  account_id    BIGINT NOT NULL REFERENCES pooter.accounts (id) ON DELETE CASCADE,

  -- Lifecycle: assigned -> accepted (stake locked) -> voted -> resolved
  state         TEXT NOT NULL DEFAULT 'assigned'
                  CHECK (state IN ('assigned', 'accepted', 'voted', 'resolved', 'expired', 'declined')),

  staked_mo     NUMERIC(38, 8),                  -- set on accept
  vote          TEXT CHECK (vote IN ('approve', 'reject', 'more_evidence')),
  -- A vote without a stated basis is not a review. Enforced below.
  basis         TEXT,
  -- The specific evidence entry the reviewer says settles it. Index into the
  -- resolution's evidence array. Required to approve.
  evidence_index SMALLINT,

  agreed        BOOLEAN,                         -- landed with the majority; set on settle
  payout_mo     NUMERIC(38, 8),                  -- reward paid, if any
  slashed_mo    NUMERIC(38, 8),                  -- set only on later overturn

  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  voted_at      TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,

  -- No reasoning-free approvals. Approving without citing the evidence that
  -- settles the claim is the exact behaviour staking is meant to price out.
  CONSTRAINT review_vote_requires_basis CHECK (
    vote IS NULL
    OR (basis IS NOT NULL AND length(btrim(basis)) >= 20)
  ),
  CONSTRAINT review_approve_requires_evidence CHECK (
    vote <> 'approve' OR evidence_index IS NOT NULL
  ),
  CONSTRAINT review_voted_has_vote CHECK (state <> 'voted' OR vote IS NOT NULL)
);

-- A reviewer appears at most once per round.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_review_assignments_unique_idx
  ON pooter.ledger_review_assignments (round_id, account_id);

CREATE INDEX IF NOT EXISTS ledger_review_assignments_account_idx
  ON pooter.ledger_review_assignments (account_id, state);
CREATE INDEX IF NOT EXISTS ledger_review_assignments_round_idx
  ON pooter.ledger_review_assignments (round_id, state);

-- ── Bias monitoring ────────────────────────────────────────────────────────
-- Stake and quorum catch laziness. They do not catch a diligent reviewer who
-- only ever votes against one party — a biased majority agrees with itself.
-- This view surfaces per-reviewer verdict distribution by party so asymmetry
-- is visible rather than inferred.
CREATE OR REPLACE VIEW pooter.ledger_reviewer_bias AS
SELECT
  a.account_id,
  c.party,
  COUNT(*)::int                                                   AS votes,
  COUNT(*) FILTER (WHERE a.vote = 'approve')::int                 AS approvals,
  COUNT(*) FILTER (WHERE a.vote = 'reject')::int                  AS rejections,
  COUNT(*) FILTER (
    WHERE a.vote = 'approve' AND r.verdict IN ('false', 'partial')
  )::int                                                          AS approved_negative
FROM pooter.ledger_review_assignments a
JOIN pooter.ledger_review_rounds rr ON rr.id = a.round_id
JOIN pooter.ledger_resolutions r    ON r.id = rr.resolution_id
JOIN pooter.ledger_claims c         ON c.id = r.claim_id
WHERE a.vote IS NOT NULL
GROUP BY a.account_id, c.party;
