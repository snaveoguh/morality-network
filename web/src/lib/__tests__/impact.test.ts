import { describe, expect, it } from "vitest";
import type { FeedItem } from "../rss";
import { clusterItems, stripOutletSuffix, rankStories, scoreCluster, signalTags, tickerHeadline, titleTokens } from "../impact";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toUTCString();

let seq = 0;
function item(title: string, source: string, ageH = 1, extra: Partial<FeedItem> = {}): FeedItem {
  seq++;
  return {
    id: `i${seq}`,
    title,
    link: `https://example.com/${seq}`,
    description: "",
    pubDate: hoursAgo(ageH),
    source,
    sourceUrl: "https://example.com",
    category: "World",
    ...extra,
  };
}

describe("titleTokens", () => {
  it("drops stopwords and folds plurals", () => {
    expect([...titleTokens("The US raises tariffs on Chinese steel")]).toEqual(["raise", "tariff", "chinese", "steel"]);
  });
});

describe("stripOutletSuffix", () => {
  it("drops a Google News outlet suffix only when it names the source", () => {
    expect(stripOutletSuffix("FCC votes to ban Chinese labs - Reuters", "Reuters")).toBe("FCC votes to ban Chinese labs");
    expect(stripOutletSuffix("Budget 2026: Key points - The Telegraph", "The Telegraph")).toBe("Budget 2026: Key points");
    expect(stripOutletSuffix("Shake-up at the top - and more to come", "Reuters")).toBe("Shake-up at the top - and more to come");
  });
});

describe("clusterItems", () => {
  it("groups differently worded reports of one story and keeps others apart", () => {
    const a = item("Bank of England holds interest rates at 4%", "Reuters");
    const b = item("Bank of England holds rates as inflation eases", "BBC News");
    const c = item("Earthquake strikes off the coast of Japan", "NHK World");
    const groups = clusterItems([a, b, c]).map((g) => g.map((i) => i.id).sort());
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual([a.id, b.id].sort());
  });
});

describe("signalTags", () => {
  it("tags Bearometer assets and supply-chain themes", () => {
    expect(signalTags("Gold hits record as dollar slides")).toEqual(["Gold", "DXY"]);
    expect(signalTags("China tightens rare earth magnet exports")).toContain("Supply chain");
    expect(signalTags("Local council approves new library")).toEqual([]);
  });
});

describe("scoreCluster", () => {
  it("rewards more outlets, decays with age and boosts signal stories", () => {
    const one = scoreCluster([item("Parliament debates housing bill", "Reuters")], NOW).score;
    const three = scoreCluster(
      ["Reuters", "BBC News", "The Guardian"].map((s) => item("Parliament debates housing bill", s)),
      NOW,
    ).score;
    const old = scoreCluster([item("Parliament debates housing bill", "Reuters", 17)], NOW).score;
    const market = scoreCluster([item("Bitcoin falls below $60,000", "Reuters")], NOW);
    expect(three).toBeGreaterThan(one * 2);
    expect(old).toBeLessThan(one / 3);
    expect(market.signals).toEqual(["BTC"]);
    expect(market.score).toBeCloseTo(one * 1.35, 5);
  });
});

describe("tickerHeadline", () => {
  it("prefers a title that passes the house-style lint", () => {
    const bad = item("Shocking! Markets crash, gold soars, and bitcoin tanks", "Daily X");
    const good = item("Markets fall after US jobs report.", "Reuters");
    expect(tickerHeadline([bad, good], true)).toBe("Markets fall after US jobs report");
  });

  it("falls back to the raw title, trimmed", () => {
    const bad = item(`  Wow!   ${"very ".repeat(30)}long  `, "Daily X");
    const h = tickerHeadline([bad], false);
    expect(h.startsWith("Wow! very")).toBe(true);
    expect(h.length).toBeLessThanOrEqual(111);
    expect(h.endsWith("…")).toBe(true);
  });
});

describe("rankStories", () => {
  it("puts the widely carried story first and drops stale and scraped items", () => {
    const items = [
      item("Celebrity opens new restaurant in London", "Daily X", 0.5),
      ...["Reuters", "BBC News", "Al Jazeera", "The Guardian"].map((s) =>
        item("Ceasefire agreed in Gaza after talks in Cairo", s, 2),
      ),
      item("Fed cuts interest rates by a quarter point", "Bloomberg", 3),
      item("Old story from two days ago", "Reuters", 48),
      item("Upvoted meme about the ceasefire", "r/worldnews", 0.1),
    ];
    const ranked = rankStories(items, 8, NOW);
    expect(ranked[0].sourceCount).toBe(4);
    expect(ranked[0].source).toBe("Reuters");
    expect(ranked[0].href).toMatch(/^\/article\/0x[0-9a-f]{64}$/);
    expect(ranked.map((r) => r.headline)).not.toContain("Old story from two days ago");
    expect(ranked.some((r) => r.source === "r/worldnews")).toBe(false);
    expect(ranked.find((r) => r.headline.startsWith("Fed"))?.signals).toEqual(["DXY"]);
  });

  it("is deterministic and respects the limit", () => {
    const words = ["harbour", "glacier", "orchestra", "railway", "vaccine", "satellite", "election", "drought", "museum", "bridge"];
    const items = words.map((w, i) => item(`${w} story ${i}`, "Reuters", i));
    const a = rankStories(items, 5, NOW);
    expect(a).toHaveLength(5);
    expect(rankStories(items, 5, NOW)).toEqual(a);
  });
});
