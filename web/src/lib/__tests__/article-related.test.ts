import { describe, expect, it, vi } from "vitest";
import { findRelatedArticles } from "../article";
import type { FeedItem } from "../rss";

vi.mock("server-only", () => ({}));

function makeItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: overrides.id || "item",
    title: overrides.title || "Untitled",
    link: overrides.link || "https://example.com/item",
    description: overrides.description || "",
    pubDate: overrides.pubDate || "2026-03-09T18:00:00.000Z",
    source: overrides.source || "Example Source",
    sourceUrl: overrides.sourceUrl || "https://example.com/feed",
    category: overrides.category || "World",
    imageUrl: overrides.imageUrl,
    bias: overrides.bias,
    tags: overrides.tags || [],
    canonicalClaim: overrides.canonicalClaim,
  };
}

describe("findRelatedArticles", () => {
  it("rejects same-name but different-story matches", () => {
    const target = makeItem({
      id: "target",
      source: "Hacker News",
      category: "Tech",
      title: "Sir Tony Hoare has died",
      description: "In memoriam for computer scientist Tony Hoare.",
      link: "https://hnrss.org/item/47316880",
      tags: ["tech"],
    });

    const realRelated = makeItem({
      id: "real-related",
      source: "BBC News",
      category: "Tech",
      title: "Computer science pioneer Sir Tony Hoare dies aged 92",
      description: "Tributes paid to the British computing pioneer.",
      link: "https://bbc.co.uk/news/technology/tony-hoare-obituary",
      tags: ["tech"],
    });

    const unrelatedSameName = makeItem({
      id: "unrelated-tony",
      source: "Breitbart",
      category: "Politics",
      title: "Former PM Tony Blair attacks UK foreign policy",
      description: "Tony Blair criticises government strategy.",
      link: "https://breitbart.com/politics/tony-blair-foreign-policy",
      tags: ["politics"],
    });

    const unrelatedOther = makeItem({
      id: "unrelated-other",
      source: "The Hill",
      category: "Politics",
      title: "Trump honors fallen service members in Kuwait",
      description: "Ceremony held at Dover Air Force Base.",
      link: "https://thehill.com/policy/defense/kuwait-service-members",
      tags: ["world"],
    });

    const related = findRelatedArticles(
      target,
      [target, realRelated, unrelatedSameName, unrelatedOther],
      5,
    );
    const relatedIds = new Set(related.map((item) => item.id));

    expect(relatedIds.has("real-related")).toBe(true);
    expect(relatedIds.has("unrelated-tony")).toBe(false);
    expect(relatedIds.has("unrelated-other")).toBe(false);
  });

  it("prefers same-story named-entity coverage over generic legal overlap", () => {
    const target = makeItem({
      id: "target-pauline",
      source: "The Hill",
      category: "Politics",
      title: "Judge Pauline Newman asks Supreme Court to hear appeal over suspension",
      description: "The 98-year-old federal appeals judge is challenging her suspension over mental fitness concerns.",
      link: "https://thehill.com/regulation/court-battles/pauline-newman-supreme-court-appeal",
      tags: ["politics", "legal"],
    });

    const realRelated = makeItem({
      id: "real-related-pauline",
      source: "Reuters",
      category: "Politics",
      title: "Pauline Newman petitions Supreme Court in challenge to judicial suspension",
      description: "The Federal Circuit judge asked the justices to review her suspension after a mental fitness dispute.",
      link: "https://reuters.com/world/us/pauline-newman-supreme-court-petition",
      tags: ["politics", "legal"],
    });

    const unrelatedBinance = makeItem({
      id: "binance-lawsuit",
      source: "CoinDesk",
      category: "Business",
      title: "Binance wins dismissal in terrorism financing lawsuit",
      description: "A federal court dismissed claims tied to terrorism financing allegations.",
      link: "https://coindesk.com/policy/binance-terrorism-lawsuit-dismissed",
      tags: ["crypto", "legal"],
    });

    const unrelatedTrivia = makeItem({
      id: "supreme-court-trivia",
      source: "NPR",
      category: "Politics",
      title: "Supreme Court trivia reveals how justices once avoided air conditioning",
      description: "A look back at unusual historical details from the court's chambers.",
      link: "https://npr.org/2026/03/09/supreme-court-trivia",
      tags: ["politics", "history"],
    });

    const unrelatedTariffs = makeItem({
      id: "tariff-replacement",
      source: "Financial Times",
      category: "Business",
      title: "Trump team weighs tariff replacement plan for importers",
      description: "Officials discuss replacing existing tariffs with a new rebate mechanism.",
      link: "https://ft.com/content/tariff-replacement-plan",
      tags: ["trade", "policy"],
    });

    const related = findRelatedArticles(
      target,
      [target, realRelated, unrelatedBinance, unrelatedTrivia, unrelatedTariffs],
      5,
    );
    const relatedIds = related.map((item) => item.id);

    expect(relatedIds).toContain("real-related-pauline");
    expect(relatedIds).not.toContain("binance-lawsuit");
    expect(relatedIds).not.toContain("supreme-court-trivia");
    expect(relatedIds).not.toContain("tariff-replacement");
  });
});
