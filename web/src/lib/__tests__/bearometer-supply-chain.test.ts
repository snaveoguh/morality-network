import { describe, it, expect } from "vitest";
import { classifyDirection, tagGroups } from "../bearometer/supply-chain-taxonomy";
import {
  scoreGroups,
  splitPublisher,
  tagItems,
  type RawSupplyChainItem,
} from "../bearometer/supply-chain-score";

const NOW = Date.parse("2026-10-28T12:00:00Z");

function item(title: string, overrides: Partial<RawSupplyChainItem> = {}): RawSupplyChainItem {
  return {
    id: title,
    title,
    description: "",
    link: `https://example.com/${encodeURIComponent(title)}`,
    pubDate: "2026-10-28T06:00:00Z",
    source: "Test",
    sourceKind: "state-media",
    ...overrides,
  };
}

describe("tagGroups", () => {
  it("maps materials to their component group", () => {
    expect(tagGroups("China tightens rare earth magnet exports")).toEqual(["rare-earth-magnets"]);
    expect(tagGroups("Gallium and germanium licences")).toEqual(["gallium-germanium-chips"]);
    expect(tagGroups("Graphite anode makers raise prices")).toEqual(["graphite-anodes"]);
    expect(tagGroups("Nexperia chip supply to carmakers")).toEqual(["legacy-chips-discretes"]);
  });

  it("returns nothing for unrelated news", () => {
    expect(tagGroups("Premier League results")).toEqual([]);
  });
});

describe("classifyDirection", () => {
  it("reads controls, shortages and price rises as tightening", () => {
    expect(classifyDirection("MOFCOM announces export controls on antimony")).toBe("tightening");
    expect(classifyDirection("Magnet maker raising prices as dysprosium harder to get")).toBe("tightening");
    expect(classifyDirection("Germanium prices continue to break through and rise")).toBe("tightening");
    expect(classifyDirection("Lithium carbonate prices in China fell again")).toBe("easing");
  });

  it("lets an explicit easing subject win over the control it names", () => {
    expect(classifyDirection("China suspends export controls on gallium")).toBe("easing");
    expect(classifyDirection("Beijing resumes rare earth exports to US")).toBe("easing");
  });

  it("does not read a request to ease curbs as easing", () => {
    expect(
      classifyDirection("FM on reported Japanese request for US help to ease rare-earth curbs"),
    ).toBe("tightening");
    expect(classifyDirection("EU urges Beijing to lift gallium export controls")).toBe("tightening");
  });

  it("is neutral without a direction cue", () => {
    expect(classifyDirection("Lithium conference opens in Shanghai")).toBe("neutral");
  });
});

describe("splitPublisher", () => {
  it("strips the Google News publisher suffix", () => {
    expect(splitPublisher("China curbs graphite - Reuters")).toEqual({
      headline: "China curbs graphite",
      publisher: "Reuters",
    });
    expect(splitPublisher("Nexperia growth in Q3 - I-Connect007").publisher).toBe("I-Connect007");
  });
});

describe("tagItems + scoreGroups", () => {
  it("drops stale and untagged items, dedupes and prefers government", () => {
    const tagged = tagItems(
      [
        item("China bans gallium exports - Xinhua"),
        item("China bans gallium exports", { sourceKind: "government", source: "MOFCOM" }),
        item("Football transfer news"),
        item("Old rare earth curb", { pubDate: "2026-08-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(tagged).toHaveLength(1);
    expect(tagged[0].source).toBe("MOFCOM");
    expect(tagged[0].directionBy).toBe("regex");
  });

  it("labels a group TIGHTENING on net tightening and QUIET when empty", () => {
    const indicators = scoreGroups(
      tagItems(
        [
          item("China imposes export controls on rare earth magnets"),
          item("Dysprosium shortage hits magnet makers"),
        ],
        NOW,
      ),
    );
    const magnets = indicators.find((i) => i.group.id === "rare-earth-magnets")!;
    expect(magnets.label).toBe("TIGHTENING");
    expect(magnets.pressure).toBeGreaterThan(0.25);
    expect(magnets.tighteningCount).toBe(2);

    const graphite = indicators.find((i) => i.group.id === "graphite-anodes")!;
    expect(graphite.label).toBe("QUIET");
    expect(graphite.itemCount).toBe(0);
  });
});
