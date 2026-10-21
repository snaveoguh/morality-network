import "server-only";

// Corrections register — read model for /ledger/corrections.
// DB when DATABASE_URL is set and populated; otherwise the checked-in seed
// (scripts/backfill-corrections.ts), so the page works anywhere. No AI.

import seed from "../../data/ledger-corrections-seed.json";
import {
  computeCorrectionsStats,
  sortCorrections,
  type CorrectionsStats,
  type MinisterialCorrection,
} from "./corrections";
import {
  matchCorrectionsToClaims,
  type CorrectionClaimMatch,
} from "./corrections-match";
import type { LedgerClaim } from "./types";
import type { InaccurateClaim } from "../db/ledger-corrections";

export interface CorrectionsRegister {
  source: "database" | "seed";
  window: { from: string; to: string } | null;
  generatedAt: string | null;
  corrections: MinisterialCorrection[];
  stats: CorrectionsStats;
  /** Match proposals against ledger claims (empty without a DB). */
  matches: Array<CorrectionClaimMatch & { claim: LedgerClaim }>;
  /** Claims a human marked inaccurate, with any proposed correction match. */
  owed: Array<InaccurateClaim & { daysOutstanding: number; possibleCorrection: MinisterialCorrection | null }>;
  /** False when no DB: claim matching and the owed list cannot run. */
  claimsAvailable: boolean;
}

interface SeedFile {
  generatedAt: string;
  window: { from: string; to: string };
  corrections: MinisterialCorrection[];
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
}

async function loadFromDb(): Promise<Omit<CorrectionsRegister, "stats" | "window" | "generatedAt"> | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const repo = await import("../db/ledger-corrections");
    const stored = await repo.listCorrections();
    // Migration applied but backfill not yet upserted: match the seed instead.
    const corrections = stored.length > 0 ? stored : sortCorrections((seed as unknown as SeedFile).corrections);
    const memberIds = [...new Set(corrections.map((c) => c.member.memberId).filter((id): id is number => id !== null))];
    const [claims, inaccurate] = await Promise.all([
      repo.listClaimsForMembers(memberIds),
      repo.listHumanMarkedInaccurateClaims(),
    ]);
    const claimById = new Map([...claims, ...inaccurate.map((i) => i.claim)].map((c) => [c.id, c]));
    const proposals = matchCorrectionsToClaims(corrections, [...claimById.values()]);
    if (stored.length > 0) {
      await repo.recordMatchProposals(proposals).catch((error) =>
        console.warn("[ledger/corrections] match persist failed:", error),
      );
    }
    const correctionById = new Map(corrections.map((c) => [c.id, c]));

    const owed = inaccurate.map((item) => {
      const best = proposals.find((m) => m.claimId === item.claim.id);
      return {
        ...item,
        daysOutstanding: daysSince(item.claim.utteredAt),
        possibleCorrection: best ? correctionById.get(best.correctionId) ?? null : null,
      };
    });

    return {
      source: stored.length > 0 ? "database" : "seed",
      corrections,
      matches: proposals.map((m) => ({ ...m, claim: claimById.get(m.claimId)! })),
      owed,
      claimsAvailable: true,
    };
  } catch (error) {
    console.warn("[ledger/corrections] DB read failed, using seed:", error);
    return null;
  }
}

export async function getCorrectionsRegister(): Promise<CorrectionsRegister> {
  const file = seed as unknown as SeedFile;
  const db = await loadFromDb();
  const base = db ?? {
    source: "seed" as const,
    corrections: sortCorrections(file.corrections),
    matches: [],
    owed: [],
    claimsAvailable: false,
  };
  return {
    ...base,
    window: base.source === "seed" ? file.window : null,
    generatedAt: base.source === "seed" ? file.generatedAt : null,
    stats: computeCorrectionsStats(base.corrections),
  };
}
