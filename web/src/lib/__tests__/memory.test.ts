import { describe, expect, it } from "vitest";
import { detachStrings, processGlobal, setBounded } from "../memory";

describe("detachStrings", () => {
  it("returns an equal deep copy", () => {
    const xml = `<rss>${"x".repeat(10_000)}<guid>abc-123</guid></rss>`;
    const start = xml.indexOf("abc");
    const item = { id: xml.slice(start, start + 7), tags: ["a"], bias: { lean: 1 } };
    const copy = detachStrings(item);
    expect(copy).toEqual(item);
    expect(copy).not.toBe(item);
    expect(copy.tags).not.toBe(item.tags);
  });
});

describe("processGlobal", () => {
  it("initialises once and returns the same value for a key", () => {
    let calls = 0;
    const a = processGlobal("test.memory", () => ({ n: ++calls }));
    const b = processGlobal("test.memory", () => ({ n: ++calls }));
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});

describe("setBounded", () => {
  it("keeps at most maxEntries, dropping the oldest", () => {
    const map = new Map<string, number>();
    for (let i = 0; i < 10; i++) setBounded(map, `k${i}`, i, 3);
    expect([...map.keys()]).toEqual(["k7", "k8", "k9"]);
  });

  it("refreshes a re-set key so it is evicted last", () => {
    const map = new Map<string, number>();
    setBounded(map, "a", 1, 2);
    setBounded(map, "b", 2, 2);
    setBounded(map, "a", 3, 2);
    setBounded(map, "c", 4, 2);
    expect([...map.entries()]).toEqual([["a", 3], ["c", 4]]);
  });
});
