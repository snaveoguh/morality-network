import { describe, expect, it } from "vitest";
import seed from "../../../data/ledger-corrections-seed.json";
import type { MinisterialCorrection } from "../corrections";
import {
  buildGovernmentNetwork,
  colleaguesOf,
  layoutNetwork,
  memberInitials,
  wrapLabel,
} from "../government-network";

function correction(overrides: Partial<MinisterialCorrection> & { id: string }): MinisterialCorrection {
  return {
    kind: "written-answer",
    house: "Commons",
    correctedOn: "2026-10-20",
    member: { memberId: 1, name: "Ada Example", party: "Lab", role: null },
    department: "Home Office",
    heading: "Heading",
    originalDate: "2026-10-10",
    originalUrl: null,
    originalRef: null,
    originalText: null,
    correctedText: "Corrected.",
    correctionUrl: "https://example.test/c",
    daysToCorrect: 10,
    needsReview: false,
    alsoLaidIn: null,
    ...overrides,
  };
}

const bea = { memberId: 2, name: "Dame Bea Sample", party: "Lab", role: "Minister of State" };

const FIXTURE: MinisterialCorrection[] = [
  correction({ id: "a1" }),
  correction({ id: "a2", daysToCorrect: 30 }),
  correction({ id: "a3", department: "Cabinet Office " }),
  correction({ id: "b1", member: bea, house: "Lords", daysToCorrect: 4 }),
  correction({ id: "x1", member: { memberId: 3, name: "Unconfirmed", party: null, role: null }, needsReview: true }),
];

describe("buildGovernmentNetwork", () => {
  const network = buildGovernmentNetwork(FIXTURE);

  it("counts confirmed corrections only", () => {
    expect(network.total).toBe(4);
    expect(network.members.map((m) => m.name)).toEqual(["Ada Example", "Dame Bea Sample"]);
  });

  it("groups by department, trimming stray whitespace, biggest first", () => {
    expect(network.departments.map((d) => [d.name, d.count])).toEqual([
      ["Home Office", 3],
      ["Cabinet Office", 1],
    ]);
    expect(network.departments[0].memberKeys).toEqual(["m:1", "m:2"]);
    expect(network.departments[0].medianDays).toBe(10);
  });

  it("records every department a minister corrected for", () => {
    const ada = network.members[0];
    expect(ada.departments.map((d) => [d.name, d.count])).toEqual([
      ["Home Office", 2],
      ["Cabinet Office", 1],
    ]);
    expect(network.members[1].role).toBe("Minister of State");
    expect(network.members[1].house).toBe("Lords");
  });

  it("lists colleagues per shared department, excluding the member", () => {
    const groups = colleaguesOf(network, "m:1");
    expect(groups.map((g) => [g.department.name, g.members.map((m) => m.name)])).toEqual([
      ["Home Office", ["Dame Bea Sample"]],
      ["Cabinet Office", []],
    ]);
    expect(colleaguesOf(network, "m:999")).toEqual([]);
  });
});

describe("labels", () => {
  it("drops titles and territorial designations from initials", () => {
    expect(memberInitials("Karin Smyth")).toBe("KS");
    expect(memberInitials("Dame Diana Johnson")).toBe("DJ");
    expect(memberInitials("Baroness Chapman of Darlington")).toBe("Ch");
    expect(memberInitials("Sir Chris Bryant")).toBe("CB");
  });

  it("wraps on word boundaries", () => {
    expect(wrapLabel("Ministry of Housing, Communities and Local Government", 30)).toEqual([
      "Ministry of Housing,",
      "Communities and Local",
      "Government",
    ]);
  });
});

describe("layoutNetwork", () => {
  const all = (seed as unknown as { corrections: MinisterialCorrection[] }).corrections;
  const network = buildGovernmentNetwork(all);

  for (const columns of [2, 4]) {
    it(`places every node once, inside the canvas, without overlaps (${columns} columns)`, () => {
      const layout = layoutNetwork(network, columns);
      expect(layout.departments).toHaveLength(network.departments.length);
      expect(layout.members).toHaveLength(network.members.length);
      expect(layout.edges).toHaveLength(network.members.reduce((n, m) => n + m.departments.length, 0));

      const circles = [...layout.departments, ...layout.members];
      for (const c of circles) {
        expect(c.x - c.r).toBeGreaterThanOrEqual(0);
        expect(c.x + c.r).toBeLessThanOrEqual(layout.width);
        expect(c.y - c.r).toBeGreaterThanOrEqual(0);
        expect(c.y + c.r).toBeLessThanOrEqual(layout.height);
      }
      for (let i = 0; i < circles.length; i += 1) {
        for (let j = i + 1; j < circles.length; j += 1) {
          const a = circles[i];
          const b = circles[j];
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
        }
      }
      for (const d of layout.departments) {
        expect(d.labelY + (d.labelLines.length - 1) * 13).toBeLessThan(layout.height);
      }
    });
  }

  it("is deterministic", () => {
    expect(layoutNetwork(network, 2)).toEqual(layoutNetwork(network, 2));
  });
});
