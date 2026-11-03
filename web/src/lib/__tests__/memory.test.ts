import { describe, expect, it } from "vitest";
import { detachStrings, processGlobal } from "../memory";

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
