import "server-only";

import { sql } from "@/lib/db";

/**
 * Staked peer review for the Claim Ledger (migration 009).
 *
 * Three reviewers, blind votes, two agreeing votes settle it. Stake returns to
 * everyone including dissenters; only a later successful dispute slashes, and
 * only those who approved.
 *
 * The blindness is the load-bearing property. If a reviewer can see an earlier
 * vote they anchor on it, and you have paid three people for one person's
 * judgment. Every read path here refuses to return another reviewer's vote
 * while the round is open.
 */

export const DEFAULT_QUORUM = 3;
export const DEFAULT_THRESHOLD = 2;
export const DEFAULT_STAKE_MO = "100.00000000";
export const DEFAULT_REWARD_MO = "10.00000000";
const ASSIGNMENT_TTL_HOURS = 72;

/**
 * Vote weights. A human counts double, so two agents substitute for one human
 * on volume — but never on the human floor: a negative verdict still cannot
 * publish without a human in the majority (migration 010).
 */
export const WEIGHT_HUMAN = 2;
export const WEIGHT_AGENT = 1;
export const DEFAULT_QUORUM_WEIGHT = 6;
export const DEFAULT_THRESHOLD_WEIGHT = 4;

/** Verdicts that carry legal exposure and therefore require a human signature. */
const NEGATIVE_VERDICTS = new Set(["false", "partial"]);

/**
 * Refusal to open a round — a caller's problem to report, not a bug.
 * Thrown inside the transaction so it rolls back, then converted to a returned
 * `{ error }` so every failure from openRound has the same shape.
 */
class RoundError extends Error {}

export type ReviewVote = "approve" | "reject" | "more_evidence";
export type ReviewerKind = "human" | "agent";

export interface OpenAssignment {
  assignmentId: string;
  roundId: string;
  resolutionId: string;
  claimId: string;
  verdict: string;
  speakerName: string;
  party: string | null;
  verbatimQuote: string;
  normalizedClaim: string;
  reasoning: string;
  evidence: { url: string; excerpt: string; kind: string }[];
  sourceUrl: string;
  stakeMo: string;
  rewardMo: string;
  state: string;
  expiresAt: string;
}

/** Balance is the sum of the append-only ledger — never a stored column. */
async function balanceOf(accountId: string): Promise<number> {
  const rows = await sql<{ balance: string }[]>`
    SELECT COALESCE(SUM(delta), 0)::TEXT AS balance
    FROM pooter.mo_ledger WHERE account_id = ${accountId}
  `;
  return Number.parseFloat(rows[0]?.balance ?? "0");
}

/**
 * Open a review round and assign reviewers at random.
 *
 * Random assignment rather than self-selection is deliberate: if reviewers
 * pick their own claims, an interested party reviews their own side and
 * nothing in the vote data would reveal it.
 */
export async function openRound(params: {
  resolutionId: string;
  quorum?: number;
  threshold?: number;
  quorumWeight?: number;
  thresholdWeight?: number;
  stakeMo?: string;
  rewardMo?: string;
}): Promise<
  { roundId: string; assigned: number; weight: number; humans: number } | { error: string }
> {
  const quorum = params.quorum ?? DEFAULT_QUORUM;
  const threshold = params.threshold ?? DEFAULT_THRESHOLD;
  const stakeMo = params.stakeMo ?? DEFAULT_STAKE_MO;
  const rewardMo = params.rewardMo ?? DEFAULT_REWARD_MO;

  const [resolution] = await sql<
    { claim_id: string; status: string; verdict: string; resolved_by: string }[]
  >`
    SELECT claim_id, status, verdict, resolved_by
    FROM pooter.ledger_resolutions WHERE id = ${params.resolutionId}
  `;
  if (!resolution) return { error: "No such resolution" };
  if (resolution.status !== "proposed") return { error: "Resolution is not awaiting review" };

  const verdictIsNegative = NEGATIVE_VERDICTS.has(resolution.verdict);
  // 'agent:openai/gpt-4o@resolve-v1' -> 'openai/gpt-4o@resolve-v1'.
  // An agent must never review a verdict its own model proposed: it would be
  // agreeing with itself, which is not a second opinion.
  const proposerModel = resolution.resolved_by.startsWith("agent:")
    ? resolution.resolved_by.slice("agent:".length)
    : null;

  const [claim] = await sql<{ party: string | null; member_id: number | null }[]>`
    SELECT party, member_id FROM pooter.ledger_claims WHERE id = ${resolution.claim_id}
  `;

  return sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`
      SELECT id::TEXT FROM pooter.ledger_review_rounds
      WHERE resolution_id = ${params.resolutionId} AND status = 'open'
    `;
    if (existing) return { error: "A round is already open for this resolution" };

    const [round] = await tx<{ id: string }[]>`
      INSERT INTO pooter.ledger_review_rounds
        (resolution_id, quorum, threshold, stake_mo, reward_mo,
         quorum_weight, threshold_weight, verdict_is_negative)
      VALUES (${params.resolutionId}, ${quorum}, ${threshold}, ${stakeMo}, ${rewardMo},
              ${params.quorumWeight ?? DEFAULT_QUORUM_WEIGHT},
              ${params.thresholdWeight ?? DEFAULT_THRESHOLD_WEIGHT},
              ${verdictIsNegative})
      RETURNING id::TEXT
    `;

    // Eligible: active, solvent enough to stake, and no declared conflict with
    // this claim's party or subject.
    const conflictKeys = [claim?.party, claim?.member_id != null ? String(claim.member_id) : null]
      .filter((v): v is string => Boolean(v));

    // Stake comes from the reviewer for a human, from the operator for an
    // agent — an agent owns nothing, so its operator carries the risk.
    const candidates = await tx<
      { account_id: string; kind: ReviewerKind; model_id: string | null; staked_account_id: string }[]
    >`
      SELECT
        r.account_id::TEXT,
        r.kind,
        r.model_id,
        COALESCE(r.operator_account_id, r.account_id)::TEXT AS staked_account_id
      FROM pooter.ledger_reviewers r
      JOIN pooter.mo_balances b
        ON b.account_id = COALESCE(r.operator_account_id, r.account_id)
      WHERE r.status = 'active'
        AND b.balance_mo >= ${stakeMo}
        AND NOT (r.conflicts ?| ${conflictKeys as unknown as string[]})
        -- Never let a model review what its own model proposed.
        AND (${proposerModel}::text IS NULL OR r.model_id IS DISTINCT FROM ${proposerModel})
      ORDER BY
        -- Humans first: they carry double weight and, for a negative verdict,
        -- the round cannot settle without one of them in the majority.
        (r.kind = 'human') DESC,
        (COALESCE(r.reviews_agreed, 0)::float / GREATEST(r.reviews_total, 1)) DESC,
        random()
    `;

    // Fill to the quorum weight, taking at most one agent per model.
    const seenModels = new Set<string>();
    const picked: (typeof candidates)[number][] = [];
    let weight = 0;
    let humans = 0;
    for (const c of candidates) {
      if (weight >= (params.quorumWeight ?? DEFAULT_QUORUM_WEIGHT)) break;
      if (c.kind === "agent") {
        if (!c.model_id || seenModels.has(c.model_id)) continue;
        seenModels.add(c.model_id);
      } else {
        humans++;
      }
      picked.push(c);
      weight += c.kind === "human" ? WEIGHT_HUMAN : WEIGHT_AGENT;
    }

    // A negative verdict is unpublishable without a human, so refuse to open a
    // round that could never legally settle rather than waste everyone's stake.
    // Checked before the weight test because it is the more useful diagnosis.
    if (verdictIsNegative && humans === 0) {
      throw new RoundError(
        "A 'false' or 'partial' verdict needs at least one human reviewer",
      );
    }
    const needWeight = params.quorumWeight ?? DEFAULT_QUORUM_WEIGHT;
    if (weight < needWeight) {
      throw new RoundError(
        `Not enough eligible reviewers: need weight ${needWeight}, got ${weight}`,
      );
    }

    const expiresAt = new Date(Date.now() + ASSIGNMENT_TTL_HOURS * 3_600_000);
    for (const c of picked) {
      await tx`
        INSERT INTO pooter.ledger_review_assignments
          (round_id, account_id, expires_at, reviewer_kind, reviewer_model_id,
           vote_weight, staked_account_id)
        VALUES (${round.id}, ${c.account_id}, ${expiresAt}, ${c.kind}, ${c.model_id},
                ${c.kind === "human" ? WEIGHT_HUMAN : WEIGHT_AGENT}, ${c.staked_account_id})
      `;
    }
    return { roundId: round.id, assigned: picked.length, weight, humans };
  }).catch((err: unknown) => {
    // Every refusal leaves openRound the same way: as a returned error, with
    // the transaction already rolled back.
    if (err instanceof RoundError) return { error: err.message };
    throw err;
  });
}

/** Accept an assignment, locking the stake as a debit on the MO ledger. */
export async function acceptAssignment(
  assignmentId: string,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return sql.begin(async (tx) => {
    const [a] = await tx<
      { state: string; stake_mo: string; round_id: string; staked_account_id: string }[]
    >`
      SELECT a.state, rr.stake_mo, a.round_id::TEXT,
             COALESCE(a.staked_account_id, a.account_id)::TEXT AS staked_account_id
      FROM pooter.ledger_review_assignments a
      JOIN pooter.ledger_review_rounds rr ON rr.id = a.round_id
      WHERE a.id = ${assignmentId} AND a.account_id = ${accountId}
        AND rr.status = 'open' AND a.expires_at > NOW()
      FOR UPDATE OF a
    `;
    if (!a) return { ok: false as const, error: "Assignment not found or expired" };
    if (a.state !== "assigned") return { ok: false as const, error: "Already accepted" };

    // For an agent the stake is the operator's, not the agent's.
    const balance = await balanceOf(a.staked_account_id);
    if (balance < Number.parseFloat(a.stake_mo)) {
      return { ok: false as const, error: "Not enough MO to stake" };
    }

    await tx`
      INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
      VALUES (${a.staked_account_id}, ${`-${a.stake_mo}`}, 'review_stake', ${`round:${a.round_id}`})
    `;
    await tx`
      UPDATE pooter.ledger_review_assignments
      SET state = 'accepted', staked_mo = ${a.stake_mo}, accepted_at = NOW()
      WHERE id = ${assignmentId}
    `;
    return { ok: true as const };
  });
}

/**
 * Cast a blind vote. Nothing about other reviewers' votes is readable until
 * the round settles, so this cannot be anchored.
 */
export async function castVote(params: {
  assignmentId: string;
  accountId: string;
  vote: ReviewVote;
  basis: string;
  evidenceIndex: number | null;
}): Promise<{ ok: true; settled: boolean } | { ok: false; error: string }> {
  const basis = params.basis.trim();
  if (basis.length < 20) {
    return { ok: false, error: "Say what settles it — at least a sentence." };
  }
  if (params.vote === "approve" && params.evidenceIndex === null) {
    return { ok: false, error: "Approving requires citing the evidence that settles the claim." };
  }

  const roundId = await sql.begin(async (tx) => {
    const [a] = await tx<{ state: string; round_id: string }[]>`
      SELECT a.state, a.round_id::TEXT
      FROM pooter.ledger_review_assignments a
      JOIN pooter.ledger_review_rounds rr ON rr.id = a.round_id
      WHERE a.id = ${params.assignmentId} AND a.account_id = ${params.accountId}
        AND rr.status = 'open'
      FOR UPDATE OF a
    `;
    if (!a) throw new Error("Assignment not found");
    if (a.state !== "accepted") throw new Error("Accept the assignment before voting");

    await tx`
      UPDATE pooter.ledger_review_assignments
      SET state = 'voted', vote = ${params.vote}, basis = ${basis},
          evidence_index = ${params.evidenceIndex}, voted_at = NOW()
      WHERE id = ${params.assignmentId}
    `;
    return a.round_id;
  }).catch((err: Error) => ({ error: err.message }) as const);

  if (typeof roundId === "object") return { ok: false, error: roundId.error };

  const settled = await trySettle(roundId);
  return { ok: true, settled };
}

/**
 * Settle a round once every assignment has voted.
 *
 * Stake returns to everyone, including the dissenter. Punishing the minority
 * would end dissent inside a week and leave the appearance of review with none
 * of the substance — the reward is for turning up and reasoning, the slash is
 * reserved for being demonstrably wrong.
 */
export async function trySettle(roundId: string): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [round] = await tx<
      {
        id: string; status: string; threshold_weight: number; reward_mo: string;
        resolution_id: string; verdict_is_negative: boolean;
      }[]
    >`
      SELECT id::TEXT, status, threshold_weight, reward_mo, resolution_id, verdict_is_negative
      FROM pooter.ledger_review_rounds WHERE id = ${roundId} FOR UPDATE
    `;
    if (!round || round.status !== "open") return false;

    const assignments = await tx<
      {
        id: string; account_id: string; vote: string | null; staked_mo: string | null;
        reviewer_kind: ReviewerKind; vote_weight: number; staked_account_id: string;
      }[]
    >`
      SELECT id::TEXT, account_id::TEXT, vote, staked_mo, reviewer_kind, vote_weight,
             staked_account_id::TEXT
      FROM pooter.ledger_review_assignments WHERE round_id = ${roundId}
    `;
    if (assignments.some((a) => a.vote === null)) return false; // still waiting

    // Weighted tally: a human vote counts double.
    const tally = new Map<string, number>();
    for (const a of assignments) {
      tally.set(a.vote!, (tally.get(a.vote!) ?? 0) + a.vote_weight);
    }
    const [topVote, topWeight] = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];

    const humanInMajority = assignments.some(
      (a) => a.reviewer_kind === "human" && a.vote === topVote,
    );

    // The gate: a negative verdict cannot be approved by machines alone, and a
    // human outvoted by agents does not count — that would publish over a
    // person's stated objection, which is worse than no human at all.
    const humanFloorMet =
      !round.verdict_is_negative || topVote !== "approve" || humanInMajority;

    const reached = topWeight >= round.threshold_weight && humanFloorMet;

    for (const a of assignments) {
      const agreed = reached && a.vote === topVote;
      // Stake and reward go to whoever carried the risk: the reviewer for a
      // human, the operator for an agent.
      const payee = a.staked_account_id ?? a.account_id;
      if (a.staked_mo) {
        await tx`
          INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
          VALUES (${payee}, ${a.staked_mo}, 'review_stake_return', ${`round:${roundId}`})
        `;
      }
      if (agreed) {
        await tx`
          INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
          VALUES (${payee}, ${round.reward_mo}, 'review_reward', ${`round:${roundId}`})
        `;
      }
      await tx`
        UPDATE pooter.ledger_review_assignments
        SET state = 'resolved', agreed = ${agreed},
            payout_mo = ${agreed ? round.reward_mo : null}
        WHERE id = ${a.id}
      `;
      await tx`
        UPDATE pooter.ledger_reviewers
        SET reviews_total = reviews_total + 1,
            reviews_agreed = reviews_agreed + ${agreed ? 1 : 0}
        WHERE account_id = ${a.account_id}
      `;
    }

    if (!reached) {
      // No majority, or agents alone tried to approve a negative verdict.
      // Escalate to a human rather than guess or quietly lower the bar.
      await tx`
        UPDATE pooter.ledger_review_rounds
        SET status = 'escalated', human_in_majority = ${humanInMajority}, closed_at = NOW()
        WHERE id = ${roundId}
      `;
      return true;
    }

    await tx`
      UPDATE pooter.ledger_review_rounds
      SET status = 'settled', outcome = ${topVote},
          human_in_majority = ${humanInMajority}, closed_at = NOW()
      WHERE id = ${roundId}
    `;

    // Publishing still runs through the migration-003 gate. The reviewer
    // identity records the composition honestly — a verdict signed off by
    // machines must never read as human-reviewed.
    const humanCount = assignments.filter((a) => a.reviewer_kind === "human").length;
    const agentCount = assignments.length - humanCount;
    const reviewedBy = `quorum:round:${roundId}:humans=${humanCount}:agents=${agentCount}`;

    if (topVote === "approve") {
      await tx`
        UPDATE pooter.ledger_resolutions
        SET status = 'published', reviewed_by = ${reviewedBy}, reviewed_at = NOW()
        WHERE id = ${round.resolution_id}
      `;
    } else if (topVote === "reject") {
      await tx`
        UPDATE pooter.ledger_resolutions
        SET status = 'rejected', reviewed_by = ${reviewedBy}, reviewed_at = NOW()
        WHERE id = ${round.resolution_id}
      `;
    }
    return true;
  });
}

/**
 * Slash the reviewers who approved a verdict that was later overturned.
 *
 * This is the only path that takes MO away, and it attaches to being wrong
 * rather than to being outvoted — an overturned verdict is the only ground
 * truth the system ever gets.
 */
export async function slashOverturned(
  roundId: string,
  reason: string,
): Promise<{ slashed: number; totalMo: string }> {
  return sql.begin(async (tx) => {
    const approvers = await tx<
      { id: string; account_id: string; staked_mo: string; staked_account_id: string }[]
    >`
      SELECT id::TEXT, account_id::TEXT, staked_mo,
             COALESCE(staked_account_id, account_id)::TEXT AS staked_account_id
      FROM pooter.ledger_review_assignments
      WHERE round_id = ${roundId} AND vote = 'approve' AND staked_mo IS NOT NULL
        AND slashed_mo IS NULL
    `;
    let total = 0;
    for (const a of approvers) {
      // The operator eats the loss for an agent — running a careless model
      // has to cost the person who chose to run it.
      await tx`
        INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
        VALUES (${a.staked_account_id}, ${`-${a.staked_mo}`}, 'review_slash', ${`round:${roundId}:${reason}`})
      `;
      await tx`
        UPDATE pooter.ledger_review_assignments SET slashed_mo = ${a.staked_mo} WHERE id = ${a.id}
      `;
      await tx`
        UPDATE pooter.ledger_reviewers SET overturned = overturned + 1 WHERE account_id = ${a.account_id}
      `;
      total += Number.parseFloat(a.staked_mo);
    }
    return { slashed: approvers.length, totalMo: total.toFixed(8) };
  });
}

/**
 * A reviewer's open work. Deliberately returns nothing about other reviewers'
 * votes — the round is blind until it settles.
 */
export async function getMyAssignments(accountId: string): Promise<OpenAssignment[]> {
  return sql<OpenAssignment[]>`
    SELECT
      a.id::TEXT            AS "assignmentId",
      rr.id::TEXT           AS "roundId",
      r.id                  AS "resolutionId",
      c.id                  AS "claimId",
      r.verdict,
      c.speaker_name        AS "speakerName",
      c.party,
      c.verbatim_quote      AS "verbatimQuote",
      c.normalized_claim    AS "normalizedClaim",
      r.reasoning,
      r.evidence,
      c.source_url          AS "sourceUrl",
      rr.stake_mo::TEXT     AS "stakeMo",
      rr.reward_mo::TEXT    AS "rewardMo",
      a.state,
      a.expires_at          AS "expiresAt"
    FROM pooter.ledger_review_assignments a
    JOIN pooter.ledger_review_rounds rr ON rr.id = a.round_id
    JOIN pooter.ledger_resolutions r    ON r.id = rr.resolution_id
    JOIN pooter.ledger_claims c         ON c.id = r.claim_id
    WHERE a.account_id = ${accountId}
      AND a.state IN ('assigned', 'accepted')
      AND rr.status = 'open'
      AND a.expires_at > NOW()
    ORDER BY a.assigned_at
  `;
}
