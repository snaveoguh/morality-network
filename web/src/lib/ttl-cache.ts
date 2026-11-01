export interface TtlCacheEntry<T> {
  expiresAt: number;
  value?: T;
  inFlight?: Promise<T>;
}

/**
 * Stale-while-revalidate cache. Fresh values return at once. An expired
 * value also returns at once while one background reload replaces it, so
 * only the very first load for a key ever makes a caller wait.
 */
export async function loadTtlValue<T>(
  cache: Map<string, TtlCacheEntry<T>>,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (!existing?.inFlight) {
    const entry: TtlCacheEntry<T> = { expiresAt: existing?.expiresAt ?? now, value: existing?.value };
    entry.inFlight = loader()
      .then((value) => {
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .catch((error) => {
        const stale = cache.get(key)?.value;
        if (stale !== undefined) {
          // Keep serving the old value; retry on the next call.
          cache.set(key, { value: stale, expiresAt: 0 });
          return stale;
        }
        cache.delete(key);
        throw error;
      });
    cache.set(key, entry);
  }

  const current = cache.get(key)!;
  if (current.value !== undefined) {
    current.inFlight?.catch(() => {});
    return current.value;
  }
  return current.inFlight!;
}
