import { CACHE_TTL_MS } from '../shared/constants';

const cache = new Map<string, { data: unknown; expiry: number }>();

export function get<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function set(key: string, data: unknown, ttlMs = CACHE_TTL_MS): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export function clear(): void {
  cache.clear();
}
