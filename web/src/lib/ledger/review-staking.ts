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

export type ReviewVote = "approve" | "reject" | "more_evidence";

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
  stakeMo?: string;
  rewardMo?: string;
}): Promise<{ roundId: string; assigned: number } | { error: string }> {
  const quorum = params.quorum ?? DEFAULT_QUORUM;
  const threshold = params.threshold ?? DEFAULT_THRESHOLD;
  const stakeMo = params.stakeMo ?? DEFAULT_STAKE_MO;
  const rewardMo = params.rewardMo ?? DEFAULT_REWARD_MO;

  const [resolution] = await sql<{ claim_id: string; status: string }[]>`
    SELECT claim_id, status FROM pooter.ledger_resolutions WHERE id = ${params.resolutionId}
  `;
  if (!resolution) return { error: "No such resolution" };
  if (resolution.status !== "proposed") return { error: "Resolution is not awaiting review" };

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
        (resolution_id, quorum, threshold, stake_mo, reward_mo)
      VALUES (${params.resolutionId}, ${quorum}, ${threshold}, ${stakeMo}, ${rewardMo})
      RETURNING id::TEXT
    `;

    // Eligible: active, solvent enough to stake, and no declared conflict with
    // this claim's party or subject.
    const conflictKeys = [claim?.party, claim?.member_id != null ? String(claim.member_id) : null]
      .filter((v): v is string => Boolean(v));

    const candidates = await tx<{ account_id: string }[]>`
      SELECT r.account_id::TEXT
      FROM pooter.ledger_reviewers r
      JOIN pooter.mo_balances b ON b.account_id = r.account_id
      WHERE r.status = 'active'
        AND b.balance_mo >= ${stakeMo}
        AND NOT (r.conflicts ?| ${conflictKeys as unknown as string[]})
      ORDER BY
        -- Favour reviewers who have been reliable, but keep it random enough
        -- that assignment cannot be predicted or gamed.
        (COALESCE(r.reviews_agreed, 0)::float / GREATEST(r.reviews_total, 1)) DESC,
        random()
      LIMIT ${quorum}
    `;

    if (candidates.length < quorum) {
      throw new Error(
        `Not enough eligible reviewers: need ${quorum}, found ${candidates.length}`,
      );
    }

    const expiresAt = new Date(Date.now() + ASSIGNMENT_TTL_HOURS * 3_600_000);
    for (const c of candidates) {
      await tx`
        INSERT INTO pooter.ledger_review_assignments (round_id, account_id, expires_at)
        VALUES (${round.id}, ${c.account_id}, ${expiresAt})
      `;
    }
    return { roundId: round.id, assigned: candidates.length };
  });
}

/** Accept an assignment, locking the stake as a debit on the MO ledger. */
export async function acceptAssignment(
  assignmentId: string,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return sql.begin(async (tx) => {
    const [a] = await tx<{ state: string; stake_mo: string; round_id: string }[]>`
      SELECT a.state, rr.stake_mo, a.round_id::TEXT
      FROM pooter.ledger_review_assignments a
      JOIN pooter.ledger_review_rounds rr ON rr.id = a.round_id
      WHERE a.id = ${assignmentId} AND a.account_id = ${accountId}
        AND rr.status = 'open' AND a.expires_at > NOW()
      FOR UPDATE OF a
    `;
    if (!a) return { ok: false as const, error: "Assignment not found or expired" };
    if (a.state !== "assigned") return { ok: false as const, error: "Already accepted" };

    const balance = await balanceOf(accountId);
    if (balance < Number.parseFloat(a.stake_mo)) {
      return { ok: false as const, error: "Not enough MO to stake" };
    }

    await tx`
      INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
      VALUES (${accountId}, ${`-${a.stake_mo}`}, 'review_stake', ${`round:${a.round_id}`})
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
      { id: string; status: string; quorum: number; threshold: number; reward_mo: string; resolution_id: string }[]
    >`
      SELECT id::TEXT, status, quorum, threshold, reward_mo, resolution_id
      FROM pooter.ledger_review_rounds WHERE id = ${roundId} FOR UPDATE
    `;
    if (!round || round.status !== "open") return false;

    const assignments = await tx<
      { id: string; account_id: string; vote: string | null; staked_mo: string | null }[]
    >`
      SELECT id::TEXT, account_id::TEXT, vote, staked_mo
      FROM pooter.ledger_review_assignments WHERE round_id = ${roundId}
    `;
    if (assignments.some((a) => a.vote === null)) return false; // still waiting

    const tally = new Map<string, number>();
    for (const a of assignments) tally.set(a.vote!, (tally.get(a.vote!) ?? 0) + 1);
    const [topVote, topCount] = [...tally.entries()].sort((x, y) => y[1] - x[1])[0];

    const reached = topCount >= round.threshold;

    for (const a of assignments) {
      const agreed = reached && a.vote === topVote;
      // Return the stake to everyone who put one up, dissenters included.
      if (a.staked_mo) {
        await tx`
          INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
          VALUES (${a.account_id}, ${a.staked_mo}, 'review_stake_return', ${`round:${roundId}`})
        `;
      }
      if (agreed) {
        await tx`
          INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
          VALUES (${a.account_id}, ${round.reward_mo}, 'review_reward', ${`round:${roundId}`})
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
      // No majority: escalate to a senior reviewer rather than guess.
      await tx`
        UPDATE pooter.ledger_review_rounds
        SET status = 'escalated', closed_at = NOW() WHERE id = ${roundId}
      `;
      return true;
    }

    await tx`
      UPDATE pooter.ledger_review_rounds
      SET status = 'settled', outcome = ${topVote}, closed_at = NOW() WHERE id = ${roundId}
    `;

    // Publishing still runs through the migration-003 gate: reviewed_by must be
    // set, and the CHECK constraint refuses a negative verdict without it.
    if (topVote === "approve") {
      await tx`
        UPDATE pooter.ledger_resolutions
        SET status = 'published',
            reviewed_by = ${`quorum:round:${roundId}`},
            reviewed_at = NOW()
        WHERE id = ${round.resolution_id}
      `;
    } else if (topVote === "reject") {
      await tx`
        UPDATE pooter.ledger_resolutions
        SET status = 'rejected',
            reviewed_by = ${`quorum:round:${roundId}`},
            reviewed_at = NOW()
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
    const approvers = await tx<{ id: string; account_id: string; staked_mo: string }[]>`
      SELECT id::TEXT, account_id::TEXT, staked_mo
      FROM pooter.ledger_review_assignments
      WHERE round_id = ${roundId} AND vote = 'approve' AND staked_mo IS NOT NULL
        AND slashed_mo IS NULL
    `;
    let total = 0;
    for (const a of approvers) {
      await tx`
        INSERT INTO pooter.mo_ledger (account_id, delta, reason, ref)
        VALUES (${a.account_id}, ${`-${a.staked_mo}`}, 'review_slash', ${`round:${roundId}:${reason}`})
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
