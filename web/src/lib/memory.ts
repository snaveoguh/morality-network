// Small helpers that keep long-lived server caches from holding more memory
// than they look like they hold.

/**
 * Deep-copies plain JSON data into fresh strings.
 *
 * V8 makes substrings ("sliced strings") that point at their parent string.
 * Fields parsed out of an RSS/Atom document (rss-parser, regex matches) are
 * slices of the whole XML text, so caching even one short `id` or `pubDate`
 * keeps the entire feed document (up to ~1.5 MB) alive. A JSON round trip
 * allocates new strings with no parent. Only use it on plain data (no Dates,
 * Maps, functions or undefined values that matter).
 */
export function detachStrings<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * One value per server process, however many times the calling module is
 * bundled. Next bundles a shared lib module into many route chunks, each
 * with its own module-level state, so a plain `let cache` becomes one cache
 * (and one background crawl) per chunk. Keeping the state on globalThis gives
 * every copy, and instrumentation.ts, the same one.
 */
export function processGlobal<T>(key: string, init: () => T): T {
  const symbol = Symbol.for(`pooter.${key}`);
  const store = globalThis as unknown as Record<symbol, T | undefined>;
  let value = store[symbol];
  if (value === undefined) {
    value = init();
    store[symbol] = value;
  }
  return value;
}
