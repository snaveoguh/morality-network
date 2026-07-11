// Funding module — per-member interest edges for the ledger record page.
// Server-only: called only from RSC (web/src/app/ledger/member/[memberId]/page.tsx).
//
// Registry rule (CLAIM_LEDGER_SPEC.md §Funding): registry-based only, no
// inferred edges, gaps reported as gaps never suspicion. interestToEdge()
// already enforces this — it returns null for entries with no stated
// counterparty (shareholdings, land, etc.), so those never become edges here.

import "server-only";

import { fetchMemberInterests, interestToEdge } from "./members-interests";
import type { FundingEdge } from "./types";

/** One category's worth of interest edges, ready for page rendering. */
export interface MemberInterestGroup {
  /** Register category name, e.g. "Gifts, benefits and hospitality from UK sources". */
  category: string;
  edges: FundingEdge[];
}

/**
 * Input shape for groupInterestEdges — a FundingEdge paired with its
 * register category name. Using a distinct input type keeps the grouping
 * logic testable without network access.
 */
export interface EdgeWithCategory {
  category: string;
  edge: FundingEdge;
}

/**
 * Pure helper — groups and sorts EdgeWithCategory inputs for rendering.
 * Exported for unit tests so no network call is needed.
 *
 * Grouping: by category name.
 * Sorting: categories ordered by edge count descending (most entries first).
 */
export function groupInterestEdges(items: EdgeWithCategory[]): MemberInterestGroup[] {
  const byCategory = new Map<string, FundingEdge[]>();

  for (const { category, edge } of items) {
    const key = category || "Other";
    const group = byCategory.get(key);
    if (group) {
      group.push(edge);
    } else {
      byCategory.set(key, [edge]);
    }
  }

  // Sort categories by edge count descending.
  return Array.from(byCategory.entries())
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([category, edges]) => ({ category, edges }));
}

/**
 * Fetch all registered financial interest edges for one member.
 * Returns groups sorted by edge count, total edges capped at 100.
 * Returns [] on any error — the page must never break on registry downtime.
 *
 * @param memberId  Canonical Parliament Member ID (members-api.parliament.uk).
 */
export async function getMemberInterestEdges(
  memberId: number,
): Promise<MemberInterestGroup[]> {
  try {
    // Fetch up to 100 interests in one page (API default is 25; we request more
    // to avoid a second round-trip for members with many entries).
    const records = await fetchMemberInterests(memberId, { take: 100 });

    // Map to edges, filter nulls (entries with no stated counterparty), cap at 100.
    const items: EdgeWithCategory[] = [];
    for (const record of records) {
      if (items.length >= 100) break;
      const edge = interestToEdge(record);
      if (edge === null) continue;
      items.push({ category: record.category.name || "Other", edge });
    }

    if (items.length === 0) return [];

    return groupInterestEdges(items);
  } catch (error) {
    console.error("[funding/member-profile] getMemberInterestEdges failed:", error);
    return [];
  }
}
