// Claim Ledger — daily Merkle batching (spec §Reuse map: tamper evidence).
//
// Leaf = sha256 of the claim's canonical fields; root = sha256 pairwise tree
// over leaves sorted ascending (odd leaf promotes). Deterministic given the
// same claims, so anyone holding a claim export can recompute and compare
// against the anchored root.

import { createHash } from "node:crypto";
import type { LedgerClaim } from "./types";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Canonical leaf hash for one claim. Field order is part of the format. */
export function claimLeafHash(claim: LedgerClaim): string {
  const canonical = JSON.stringify([
    claim.id,
    claim.speaker.memberId,
    claim.verbatimQuote,
    claim.normalizedClaim,
    claim.claimType,
    claim.sourceUrl,
    claim.utteredAt,
    claim.context,
  ]);
  return sha256Hex(canonical);
}

/** Merkle root over sorted leaves. Returns null for an empty set. */
export function merkleRoot(leaves: string[]): string | null {
  if (leaves.length === 0) return null;
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(sha256Hex(Buffer.from(level[i] + level[i + 1], "hex")));
      } else {
        next.push(level[i]); // odd leaf promotes unchanged
      }
    }
    level = next;
  }
  return `0x${level[0]}`;
}

export function computeClaimsRoot(claims: LedgerClaim[]): {
  root: string | null;
  count: number;
} {
  return {
    root: merkleRoot(claims.map(claimLeafHash)),
    count: claims.length,
  };
}
