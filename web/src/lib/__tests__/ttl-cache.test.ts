import { describe, expect, it, vi } from "vitest";
import { loadTtlValue, type TtlCacheEntry } from "../ttl-cache";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("loadTtlValue", () => {
  it("waits only for the first load, then serves from cache", async () => {
    const cache = new Map<string, TtlCacheEntry<number>>();
    const loader = vi.fn().mockResolvedValue(1);
    expect(await loadTtlValue(cache, "k", 1000, loader)).toBe(1);
    expect(await loadTtlValue(cache, "k", 1000, loader)).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("serves the stale value at once while one background reload runs", async () => {
    const cache = new Map<string, TtlCacheEntry<number>>();
    cache.set("k", { value: 1, expiresAt: 0 });
    const next = deferred<number>();
    const loader = vi.fn(() => next.promise);

    expect(await loadTtlValue(cache, "k", 1000, loader)).toBe(1);
    expect(await loadTtlValue(cache, "k", 1000, loader)).toBe(1);
    expect(loader).toHaveBeenCalledTimes(1);

    next.resolve(2);
    await next.promise;
    await Promise.resolve();
    expect(await loadTtlValue(cache, "k", 1000, loader)).toBe(2);
  });

  it("keeps the stale value when a reload fails and retries next time", async () => {
    const cache = new Map<string, TtlCacheEntry<number>>();
    cache.set("k", { value: 1, expiresAt: 0 });
    const failing = vi.fn().mockRejectedValue(new Error("down"));
    expect(await loadTtlValue(cache, "k", 1000, failing)).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    const ok = vi.fn().mockResolvedValue(3);
    expect(await loadTtlValue(cache, "k", 1000, ok)).toBe(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("throws when the first load fails", async () => {
    const cache = new Map<string, TtlCacheEntry<number>>();
    await expect(
      loadTtlValue(cache, "k", 1000, () => Promise.reject(new Error("down"))),
    ).rejects.toThrow("down");
    expect(cache.has("k")).toBe(false);
  });
});
