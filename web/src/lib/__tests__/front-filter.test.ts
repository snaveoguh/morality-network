import { describe, expect, it } from "vitest";
import type { FeedItem } from "../rss";
import { frontFirst, isFrontStory, isFrontTag, isMarketStory, isPoliticsStory } from "../front-filter";
import { rankFrontStories } from "../impact";
import { topTags } from "../front";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toUTCString();

let seq = 0;
function item(title: string, category = "World", ageH = 1, extra: Partial<FeedItem> = {}): FeedItem {
  seq++;
  return {
    id: `f${seq}`,
    title,
    link: `https://example.com/f${seq}`,
    description: "",
    pubDate: hoursAgo(ageH),
    source: `Outlet ${seq}`,
    sourceUrl: "https://example.com",
    category,
    ...extra,
  };
}

describe("isMarketStory", () => {
  it.each([
    "How the biggest $6.3 billion heist in crypto history unfolded",
    "Blockchain intelligence firms trace stolen funds to North Korean hackers",
    "Bitcoin slides below $90,000 as ETF outflows mount",
    "Ethereum developers set date for next network upgrade",
    "Stablecoin issuer Tether posts record quarterly profit",
    "Coinbase shares jump after earnings beat",
    "DeFi protocol drained of $40m in bridge exploit",
    "NFT sales hit three-year low",
    "Stocks slump as Fed signals fewer rate cuts",
    "FTSE 100 closes at record high on miners' rally",
    "Wall Street rallies as tech earnings season kicks off",
    "Shares in BP fall after profit warning",
    "Global markets tumble on tariff fears",
    "Gold prices hit fresh record as dollar weakens",
    "Hedge funds bet against sterling ahead of budget",
    "Retail traders pile into meme stocks again",
    "Governance token holders vote to cut fees",
    "Polymarket odds swing on Pennsylvania result",
  ])("filters %s", (title) => {
    expect(isMarketStory({ title, category: "Business" })).toBe(true);
    expect(isMarketStory({ title, category: "World" })).toBe(true);
  });

  it.each([
    "Bank of England holds interest rates at 4%",
    "UK and India sign trade deal after three years of talks",
    "Market town fights closure of its last bank branch",
    "Trading standards officers seize fake vapes in Leeds",
    "Starmer rules out rejoining the single market",
    "Labour market figures show unemployment rising to 5%",
    "Housing market slows as mortgage rates rise",
    "PM shares plan to tackle rise in knife crime",
    "Chancellor's budget: what it means for your pensions",
    "MPs vote to scrap two-child benefit cap",
    "Reeves defends inheritance tax changes to farmers",
    "Tariffs on Chinese steel to rise, Commerce Department says",
    "Aid airdrop reaches northern Gaza",
    "A token gesture: council offers residents £10 voucher",
    "Electoral Commission fines party over donations",
  ])("keeps %s", (title) => {
    expect(isMarketStory({ title, category: "Politics" })).toBe(false);
    expect(isFrontStory({ title, category: "Business" })).toBe(true);
  });

  it("filters everything in the Crypto category, whatever the headline", () => {
    expect(isMarketStory({ title: "SEC chair testifies before Senate committee", category: "Crypto" })).toBe(true);
  });
});

describe("isFrontTag", () => {
  it("keeps crypto out of Trending and everything else in", () => {
    expect(isFrontTag("crypto")).toBe(false);
    expect(isFrontTag("Crypto")).toBe(false);
    expect(isFrontTag("election")).toBe(true);
    expect(isFrontTag("economy")).toBe(true);
    expect(isFrontTag("trade")).toBe(true);
  });
});

describe("topTags", () => {
  const items = [
    { tags: ["crypto", "scandal"] },
    { tags: ["crypto"] },
    { tags: ["crypto", "election"] },
    { tags: ["election"] },
  ];
  it("leaves market tags out of the front page's Trending", () => {
    expect(topTags(items, 6)).toEqual(["election", "scandal"]);
  });
  it("keeps them for Search", () => {
    expect(topTags(items, 6, { includeMarkets: true })[0]).toBe("crypto");
  });
});

describe("isPoliticsStory", () => {
  it("is Politics or Governance, and not a market story", () => {
    expect(isPoliticsStory({ title: "MPs back assisted dying bill", category: "Politics" })).toBe(true);
    expect(isPoliticsStory({ title: "DAO votes on treasury", category: "Governance" })).toBe(true);
    expect(isPoliticsStory({ title: "Senate passes stablecoin bill", category: "Politics" })).toBe(false);
    expect(isPoliticsStory({ title: "MPs back assisted dying bill", category: "World" })).toBe(false);
  });
});

describe("frontFirst", () => {
  it("moves market stories after the rest without dropping any", () => {
    const a = item("Bitcoin hits record high", "Crypto");
    const b = item("MPs vote to scrap two-child benefit cap", "Politics");
    const c = item("Stocks slump on tariff fears", "Business");
    const d = item("Ceasefire holds in Gaza", "World");
    const out = frontFirst([a, b, c, d]);
    expect(out).toEqual([b, d, a, c]);
    expect(out).toHaveLength(4);
  });
});

describe("rankFrontStories", () => {
  it("keeps crypto and market stories off the ticker", () => {
    const items = [
      item("How the biggest $6.3 billion heist in crypto history unfolded", "Crypto"),
      item("Blockchain intelligence firms trace stolen crypto", "Tech"),
      item("Stocks slump as Fed signals fewer rate cuts", "Business"),
      item("MPs vote to scrap two-child benefit cap", "Politics"),
      item("Ceasefire holds in Gaza as aid convoys enter", "World"),
    ];
    const headlines = rankFrontStories(items, 8, NOW).map((s) => s.headline);
    expect(headlines).toHaveLength(2);
    expect(headlines.join(" ")).not.toMatch(/crypto|blockchain|stocks/i);
  });

  it("falls back to politics headlines, even old ones, rather than a blank bar", () => {
    const items = [
      item("Bitcoin slides below $90,000", "Crypto"),
      item("Wall Street rallies on earnings", "Business"),
      item("MPs vote to scrap two-child benefit cap", "Politics", 72),
    ];
    const stories = rankFrontStories(items, 8, NOW);
    expect(stories.map((s) => s.headline)).toEqual(["MPs vote to scrap two-child benefit cap"]);
  });

  it("never returns nothing while the feed has stories", () => {
    const items = [item("Bitcoin slides below $90,000", "Crypto")];
    expect(rankFrontStories(items, 8, NOW)).toHaveLength(1);
  });
});
