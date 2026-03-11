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
});
