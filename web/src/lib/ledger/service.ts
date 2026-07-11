import "server-only";

// Claim Ledger — Phase A service.
// Pipeline (spec §Pipeline): ingest (Hansard) → extract → publish UNRESOLVED.
// No verdicts exist anywhere in Phase A; there is nothing to review or score
// yet, and the page renders sourced quotes only.

import { unstable_cache } from "next/cache";
import { hasAIProviderForTask } from "../ai-models";
import { extractClaimsFromDebate } from "./extract";
import { fetchDebate, fetchLatestPmqs, findBudgetSittings } from "./hansard";
import type { HansardDebate, LedgerClaim, LedgerWeekSnapshot } from "./types";

function buildSnapshot(
  debate: HansardDebate,
  claims: LedgerClaim[],
  contributionsWithClaims: number,
): LedgerWeekSnapshot {
  return {
    debate: {
      extId: debate.extId,
      title: debate.title,
      house: debate.house,
      date: debate.date,
      sourceUrl: debate.sourceUrl,
    },
    claims,
    contributionsScanned: debate.contributions.length,
    contributionsWithClaims,
    generatedAt: new Date().toISOString(),
  };
}

async function tryDbClaims(debateExtId: string): Promise<LedgerClaim[] | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { listLedgerClaimsForDebate } = await import("../db/ledger-claims");
    const claims = await listLedgerClaimsForDebate(debateExtId);
    return claims.length > 0 ? claims : null;
  } catch (error) {
    console.warn("[ledger] DB read failed, falling back to live:", error);
    return null;
  }
}

async function tryPersist(
  claims: LedgerClaim[],
  debateExtId: string,
): Promise<boolean> {
  if (!process.env.DATABASE_URL || claims.length === 0) return false;
  try {
    const { recordLedgerClaims } = await import("../db/ledger-claims");
    await recordLedgerClaims(claims, debateExtId);
    return true;
  } catch (error) {
    console.warn("[ledger] persist failed (claims still served live):", error);
    return false;
  }
}

/**
 * Ingest the latest PMQs: fetch text, extract claims, persist when a DB is
 * configured. Re-runnable — claim ids are deterministic and inserts are
 * ON CONFLICT DO NOTHING.
 */
export async function ingestLatestPmqs(): Promise<
  | { ok: true; snapshot: LedgerWeekSnapshot; persisted: boolean }
  | { ok: false; reason: string }
> {
  const debate = await fetchLatestPmqs();
  if (!debate) return { ok: false, reason: "no PMQs sitting found in window" };
  if (!hasAIProviderForTask("claimLedgerExtraction")) {
    return { ok: false, reason: "no AI provider configured for extraction" };
  }

  const { claims, contributionsWithClaims } =
    await extractClaimsFromDebate(debate);
  const persisted = await tryPersist(claims, debate.extId);
  return {
    ok: true,
    snapshot: buildSnapshot(debate, claims, contributionsWithClaims),
    persisted,
  };
}

async function loadWeekSnapshotUncached(): Promise<LedgerWeekSnapshot | null> {
  const debate = await fetchLatestPmqs();
  if (!debate) return null;

  // Prefer persisted claims (cron-ingested); fall back to live extraction.
  const dbClaims = await tryDbClaims(debate.extId);
  if (dbClaims) {
    const withClaims = new Set(dbClaims.map((c) => c.contributionExternalId))
      .size;
    return buildSnapshot(debate, dbClaims, withClaims);
  }

  if (!hasAIProviderForTask("claimLedgerExtraction")) {
    return buildSnapshot(debate, [], 0);
  }

  const { claims, contributionsWithClaims } =
    await extractClaimsFromDebate(debate);
  await tryPersist(claims, debate.extId);
  return buildSnapshot(debate, claims, contributionsWithClaims);
}

const getCachedWeekSnapshot = unstable_cache(
  loadWeekSnapshotUncached,
  // v2: resolved claims stay in the snapshot (they display their verdict —
  // dropping them from the page on approval was a bug).
  ["ledger-pmqs-week-v2"],
  { revalidate: 21_600 }, // 6h — PMQs is weekly; cron ingest refreshes sooner
);

/** The current "this week's checkable claims" snapshot, cached. */
export async function getLedgerWeekSnapshot(): Promise<LedgerWeekSnapshot | null> {
  return getCachedWeekSnapshot();
}

// ── Phase C: Tier 2 backfill (Budget speeches, 2010 → now) ─────────────────

/**
 * Ingest the next not-yet-ingested Budget ("Financial Statement") sitting,
 * oldest first. Self-exhausting: returns done=true once the corpus is in.
 * Designed for a daily cron — ~20 sittings ≈ three weeks of quiet backfill.
 */
export async function ingestNextBudget(): Promise<
  | { ok: true; done: boolean; debate?: { extId: string; date: string }; claims?: number; persisted?: boolean }
  | { ok: false; reason: string }
> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, reason: "backfill requires DATABASE_URL" };
  }
  if (!hasAIProviderForTask("claimLedgerExtraction")) {
    return { ok: false, reason: "no AI provider configured for extraction" };
  }

  const sittings = await findBudgetSittings(2010);
  if (sittings.length === 0) return { ok: false, reason: "no Budget sittings found" };

  const { ingestedDebateExtIds, markDebateIngested } = await import(
    "../db/ledger-claims"
  );
  const already = await ingestedDebateExtIds(sittings.map((s) => s.extId));
  const next = sittings.find((s) => !already.has(s.extId));
  if (!next) return { ok: true, done: true };

  const debate = await fetchDebate(next.extId);
  if (!debate || debate.contributions.length === 0) {
    return { ok: false, reason: `debate ${next.extId} (${next.date}) fetch failed or empty` };
  }

  const { claims } = await extractClaimsFromDebate(debate, { context: "budget" });
  const persisted = await tryPersist(claims, debate.extId);
  // Mark the attempt regardless of yield so the backfill always advances.
  await markDebateIngested({
    debateExtId: debate.extId,
    context: "budget",
    sittingDate: debate.date,
    claimsCount: claims.length,
  }).catch((error) => console.warn("[ledger] markDebateIngested failed:", error));
  return {
    ok: true,
    done: false,
    debate: { extId: debate.extId, date: debate.date },
    claims: claims.length,
    persisted,
  };
}

// ── Phase B: resolution ─────────────────────────────────────────────────────

/**
 * Published verdicts for the given claims. Read fresh (not inside the
 * snapshot cache) so review-queue approvals surface at page revalidation.
 * Returns an empty map without a DB — verdicts only exist with persistence.
 */
export async function getPublishedVerdicts(
  claimIds: string[],
): Promise<Map<string, import("./types").LedgerResolution>> {
  if (!process.env.DATABASE_URL || claimIds.length === 0) return new Map();
  try {
    const { publishedResolutionsForClaims } = await import(
      "../db/ledger-resolutions"
    );
    return await publishedResolutionsForClaims(claimIds);
  } catch (error) {
    console.warn("[ledger] verdict read failed:", error);
    return new Map();
  }
}

/** Answered (publicly displayable) disputes for the given claims. */
export async function getAnsweredDisputes(
  claimIds: string[],
): Promise<Map<string, import("../db/ledger-disputes").LedgerDispute[]>> {
  if (!process.env.DATABASE_URL || claimIds.length === 0) return new Map();
  try {
    const { answeredDisputesForClaims } = await import("../db/ledger-disputes");
    return await answeredDisputesForClaims(claimIds);
  } catch (error) {
    console.warn("[ledger] dispute read failed:", error);
    return new Map();
  }
}

/**
 * Resolution pass: propose verdicts for unresolved voting-record and
 * statistics claims. Proposals land in the review queue; nothing publishes.
 * Re-runnable — claims with a live proposal are skipped.
 */
export async function proposeResolutionsForUnresolved(
  maxProposals = 12,
): Promise<
  | { ok: true; scanned: number; proposed: number; skipped: number }
  | { ok: false; reason: string }
> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, reason: "resolution requires DATABASE_URL" };
  }
  if (!hasAIProviderForTask("claimLedgerResolution")) {
    return { ok: false, reason: "no AI provider configured for resolution" };
  }

  const { listResolvableUnresolvedClaims } = await import("../db/ledger-claims");
  const { claimIdsWithLiveResolution, recordProposal } = await import(
    "../db/ledger-resolutions"
  );
  const { proposeResolution } = await import("./resolve");

  const claims = await listResolvableUnresolvedClaims(100);
  const alreadyLive = await claimIdsWithLiveResolution(claims.map((c) => c.id));

  let proposed = 0;
  let skipped = 0;
  for (const claim of claims) {
    if (proposed >= maxProposals) break;
    if (alreadyLive.has(claim.id)) {
      skipped += 1;
      continue;
    }
    const proposal = await proposeResolution(claim);
    if (!proposal) {
      skipped += 1;
      continue;
    }
    const queued = await recordProposal(proposal);
    if (queued) proposed += 1;
    else skipped += 1;
  }

  return { ok: true, scanned: claims.length, proposed, skipped };
}
