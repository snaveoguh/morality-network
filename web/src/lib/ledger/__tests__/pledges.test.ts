import { describe, expect, it } from "vitest";
import { claimLeafHash, computeLedgerDayRoot, merkleRoot } from "../merkle";
import {
  countByStatus,
  formatGbp,
  getPledge,
  loadPledges,
  pledgeLeafHash,
  pledgeLines,
  pledgesCheckedOn,
  validatePledges,
  type Pledge,
} from "../pledges";
import type { LedgerClaim } from "../types";

function makePledge(id: string, overrides: Partial<Pledge> = {}): Pledge {
  return {
    id,
    title: `Pledge ${id}`,
    amountGbp: 1_000_000,
    approx: false,
    owner: "Test Department",
    jurisdiction: "England",
    parentId: null,
    announcedOn: "2026-09-25",
    verbatimQuote: `quote ${id}`,
    sourceUrl: `https://www.gov.uk/${id}`,
    sourceTitle: "Test source",
    status: "announced",
    evidence: [],
    lastCheckedOn: "2026-10-20",
    notes: "",
    declaredInterest: false,
    ...overrides,
  };
}

const claim: LedgerClaim = {
  id: "c1",
  speaker: { memberId: 1, name: "Test Member", party: "Lab", constituency: null },
  verbatimQuote: "quote c1",
  normalizedClaim: "normalized c1",
  claimType: "retrodictable",
  topic: "spending",
  resolutionDue: null,
  sourceUrl: "https://hansard.parliament.uk/x#contribution-c1",
  contributionExternalId: "c1",
  utteredAt: "2026-10-20",
  context: "pmqs",
  extractedBy: { provider: "t", model: "m", version: "v" },
  occurrences: 1,
};

describe("seed file", () => {
  const pledges = loadPledges();

  it("validates cleanly", () => {
    expect(validatePledges(pledges)).toEqual([]);
  });

  it("splits the £210m high-streets package into its four lines", () => {
    const pkg = getPledge("uk-high-streets-210m-2026", pledges)!;
    expect(pkg.amountGbp).toBe(210_000_000);
    const lines = pledgeLines(pkg.id, pledges);
    expect(lines.map((l) => l.amountGbp).sort((a, b) => b - a)).toEqual([
      125_000_000, 65_000_000, 10_000_000, 10_000_000,
    ]);
  });

  it("includes the SBSA £30.4m pre-election release", () => {
    expect(getPledge("sbsa-pre-election-30-4m", pledges)?.amountGbp).toBe(30_400_000);
  });

  it("flags the co-operative programme as a declared interest", () => {
    const flagged = pledges.filter((p) => p.declaredInterest).map((p) => p.id);
    expect(flagged).toContain("uk-cooperative-development-programme-10m");
  });
});

describe("validatePledges", () => {
  it("rejects unknown statuses, bad dates and missing parents", () => {
    const problems = validatePledges([
      makePledge("a", { status: "promised" as Pledge["status"] }),
      makePledge("b", { announcedOn: "25/09/2026" }),
      makePledge("c", { parentId: "nope" }),
    ]);
    expect(problems.some((p) => p.includes('unknown status "promised"'))).toBe(true);
    expect(problems.some((p) => p.startsWith("b: bad announcedOn"))).toBe(true);
    expect(problems.some((p) => p.includes("parent nope not found"))).toBe(true);
  });

  it("rejects package lines that overshoot their parent", () => {
    const problems = validatePledges([
      makePledge("pkg", { amountGbp: 100 }),
      makePledge("l1", { amountGbp: 60, parentId: "pkg" }),
      makePledge("l2", { amountGbp: 60, parentId: "pkg" }),
    ]);
    expect(problems).toEqual(["pkg: lines sum to 120, more than 100"]);
  });

  it("allows approximate lines not to sum exactly", () => {
    expect(
      validatePledges([
        makePledge("pkg", { amountGbp: 455, approx: true }),
        makePledge("l1", { amountGbp: 100, approx: true, parentId: "pkg" }),
        makePledge("l2", { amountGbp: 50, parentId: "pkg" }),
      ]),
    ).toEqual([]);
  });

  it("rejects non-https sources and duplicate ids", () => {
    const problems = validatePledges([
      makePledge("a", { sourceUrl: "http://example.gov.uk" }),
      makePledge("a"),
    ]);
    expect(problems).toContain("a: duplicate id");
    expect(problems.some((p) => p.includes("non-https"))).toBe(true);
  });

  it("loadPledges throws on an invalid seed", () => {
    expect(() =>
      loadPledges({ schemaVersion: 1, pledges: [makePledge("a", { amountGbp: 0 })] }),
    ).toThrow(/pledge seed invalid/);
  });
});

describe("aggregates", () => {
  const set = [
    makePledge("pkg", { amountGbp: 200 }),
    makePledge("l1", { amountGbp: 150, parentId: "pkg", status: "allocated" }),
    makePledge("l2", { amountGbp: 50, parentId: "pkg", status: "unknown" }),
    makePledge("solo", { amountGbp: 30 }),
  ];

  it("counts by status", () => {
    expect(countByStatus(set)).toEqual({
      announced: 2,
      allocated: 1,
      spent: 0,
      delivered: 0,
      unknown: 1,
    });
  });

  it("formats newsroom-style amounts", () => {
    expect(formatGbp(210_000_000)).toBe("£210m");
    expect(formatGbp(30_400_000)).toBe("£30.4m");
    expect(formatGbp(1_140_000_000)).toBe("£1.14bn");
    expect(formatGbp(564_000)).toBe("£564k");
    expect(formatGbp(100_000_000, true)).toBe("~£100m");
  });
});

describe("pledge leaves in the daily root", () => {
  it("is deterministic and changes when the status changes", () => {
    const p = makePledge("a");
    expect(pledgeLeafHash(p)).toBe(pledgeLeafHash({ ...p }));
    expect(pledgeLeafHash(p)).not.toBe(pledgeLeafHash({ ...p, status: "allocated" }));
    expect(pledgeLeafHash(p)).not.toBe(
      pledgeLeafHash({ ...p, lastCheckedOn: "2026-10-21" }),
    );
  });

  it("ignores display-only fields", () => {
    const p = makePledge("a");
    expect(pledgeLeafHash(p)).toBe(pledgeLeafHash({ ...p, title: "Renamed", notes: "x" }));
  });

  it("selects pledges by the day they were checked", () => {
    const set = [
      makePledge("a"),
      makePledge("b", { lastCheckedOn: "2026-10-19" }),
    ];
    expect(pledgesCheckedOn("2026-10-20", set).map((p) => p.id)).toEqual(["a"]);
  });

  it("combines claims and pledges in one tree", () => {
    const pledges = [makePledge("a"), makePledge("b")];
    const day = computeLedgerDayRoot([claim], pledges);
    expect(day).toMatchObject({ claims: 1, pledges: 2, count: 3 });
    expect(day.root).toBe(
      merkleRoot([claimLeafHash(claim), ...pledges.map(pledgeLeafHash)]),
    );
    // Pledges alone still produce a root (a day with no PMQs).
    expect(computeLedgerDayRoot([], pledges).root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(computeLedgerDayRoot([], []).root).toBeNull();
  });

  it("keeps a claims-only day's root unchanged", () => {
    expect(computeLedgerDayRoot([claim], []).root).toBe(merkleRoot([claimLeafHash(claim)]));
  });
});
