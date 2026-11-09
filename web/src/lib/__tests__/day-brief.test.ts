import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../rss";

const feed: FeedItem[] = [];
const generate = vi.fn();
let aiAvailable = true;

vi.mock("../rss", () => ({ fetchAllFeeds: async () => feed }));
vi.mock("../ai-provider", () => ({ generateTextForTask: (...args: unknown[]) => generate(...args) }));
vi.mock("../ai-models", () => ({ hasAIProviderForTask: () => aiAvailable }));

const { selectBriefStories, getDayBrief, answerBriefQuestion, chatAnswerFromReply } = await import("../day-brief");

const NOW = Date.parse("2026-11-02T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toUTCString();

function item(id: string, over: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    title: `Story ${id}`,
    link: `https://example.com/${id}`,
    description: "",
    pubDate: hoursAgo(1),
    source: `Outlet ${id}`,
    sourceUrl: "https://example.com",
    category: "World",
    ...over,
  };
}

describe("selectBriefStories", () => {
  it("keeps the last 24 hours, most-covered first", () => {
    const items = [
      item("old", { pubDate: hoursAgo(30) }),
      item("one", { pubDate: hoursAgo(1) }),
      item("wide", { pubDate: hoursAgo(5), sourceNames: ["a", "b", "c"] }),
      item("pinned", { datedAtFetch: true }),
    ];
    expect(selectBriefStories(items, "all", NOW).map((s) => s.id)).toEqual(["wide", "one"]);
  });

  it("keeps crypto and market stories out of the default brief", () => {
    const items = [item("btc", { category: "Crypto", title: "Bitcoin hits a new high" }), item("news")];
    expect(selectBriefStories(items, "all", NOW).map((s) => s.id)).toEqual(["news"]);
    expect(selectBriefStories(items, "business", NOW).map((s) => s.id)).toEqual(["btc"]);
  });

  it("UK politics needs a UK politics story", () => {
    const items = [
      item("uk", { category: "Politics", title: "Starmer faces Commons vote" }),
      item("us", { category: "Politics", title: "Senate passes budget" }),
    ];
    expect(selectBriefStories(items, "uk", NOW).map((s) => s.id)).toEqual(["uk"]);
  });
});

describe("getDayBrief", () => {
  beforeEach(() => {
    feed.length = 0;
    generate.mockReset();
    aiAvailable = true;
    vi.setSystemTime(NOW);
  });

  it("drops points whose citations do not match a story", async () => {
    feed.push(item("a"), item("b"), item("c"));
    generate.mockResolvedValue({
      text: JSON.stringify({
        summary: "A busy day.",
        points: [
          { text: "Real point", cite: [1] },
          { text: "Made up", cite: [99] },
          { text: "Uncited", cite: [] },
          { text: "Another real one", cite: [2, 2, 3] },
        ],
        suggestions: ["What happened?"],
      }),
    });
    const brief = await getDayBrief("world");
    expect(brief.mode).toBe("ai");
    expect(brief.points.map((p) => p.text)).toEqual(["Real point", "Another real one"]);
    expect(brief.points[1].sources.map((s) => s.link)).toEqual(["https://example.com/b", "https://example.com/c"]);
  });

  it("falls back to the headlines when no AI is configured", async () => {
    aiAvailable = false;
    feed.push(item("a"), item("b"));
    const brief = await getDayBrief("tech"); // own cache key
    expect(brief.mode).toBe("headlines");
    expect(generate).not.toHaveBeenCalled();
  });

  it("falls back to the headlines when the model reply is unusable", async () => {
    feed.push(item("a"), item("b"));
    generate.mockResolvedValue({ text: "Sorry, I can't do that." });
    const brief = await getDayBrief("environment");
    expect(brief.mode).toBe("headlines");
  });
});

describe("answerBriefQuestion", () => {
  beforeEach(() => {
    feed.length = 0;
    generate.mockReset();
    aiAvailable = true;
  });

  it("returns the answer with only valid sources", async () => {
    feed.push(item("a"));
    generate.mockResolvedValue({ text: '{"answer": "Story a happened.", "cite": [1, 7]}' });
    const res = await answerBriefQuestion("What happened?", "all", []);
    expect(res.answer).toBe("Story a happened.");
    expect(res.sources).toHaveLength(1);
  });

  it("lets every provider try and leaves room for a reasoning model", async () => {
    feed.push(item("a"));
    generate.mockResolvedValue({ text: '{"answer": "Story a happened.", "cite": [1]}' });
    await answerBriefQuestion("What happened?", "all", []);
    const req = generate.mock.calls[0][0] as { maxTokens: number; maxAttempts?: number };
    expect(req.maxAttempts).toBeUndefined();
    expect(req.maxTokens).toBeGreaterThanOrEqual(1000);
  });

  it("fails rather than showing a cut-off JSON reply", async () => {
    feed.push(item("a"));
    generate.mockResolvedValue({ text: '{"' });
    await expect(answerBriefQuestion("What happened?", "all", [])).rejects.toThrow();
  });

  it("says it is offline without an AI provider", async () => {
    aiAvailable = false;
    const res = await answerBriefQuestion("Hi", "all", []);
    expect(res.available).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("chatAnswerFromReply", () => {
  const pool = [item("a"), item("b")];

  it("salvages the answer from a reply cut off mid-JSON", () => {
    const res = chatAnswerFromReply('{"answer": "Ministers are expected to cut EV targets, \\"sources say\\".", "cite": [1', pool);
    expect(res.answer).toBe('Ministers are expected to cut EV targets, "sources say".');
    expect(res.sources).toEqual([]);
  });

  it("rejects JSON debris and empty replies", () => {
    expect(() => chatAnswerFromReply('{"', pool)).toThrow();
    expect(() => chatAnswerFromReply("", pool)).toThrow();
    expect(() => chatAnswerFromReply('{"answer": "', pool)).toThrow();
  });

  it("shows a plain-text reply as is", () => {
    expect(chatAnswerFromReply("The headlines do not cover that.", pool).answer).toBe("The headlines do not cover that.");
  });
});
