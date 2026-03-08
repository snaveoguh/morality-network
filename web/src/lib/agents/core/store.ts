// ─── Agent Core — Generic Persistent Store ─────────────────────────────────
//
// Adapted from NounIRL's reservations.ts pattern.
// In-memory Map with JSON file persistence and FIFO eviction.

import { readFileSync, writeFileSync, existsSync } from "fs";

export interface StoreOptions<T> {
  /** File path for JSON persistence */
  persistPath: string;
  /** Maximum items to keep (FIFO eviction). 0 = unlimited */
  maxItems?: number;
  /** Extract a unique key from an item */
  keyFn?: (item: T) => string;
}

export class Store<T> {
  private items: Map<string, T>;
  private ordered: string[];
  private dirty = false;
  private readonly path: string;
  private readonly maxItems: number;
  private readonly keyFn: (item: T) => string;

  constructor(options: StoreOptions<T>) {
    this.path = options.persistPath;
    this.maxItems = options.maxItems ?? 0;
    this.keyFn = options.keyFn ?? (() => crypto.randomUUID());
    this.items = new Map();
    this.ordered = [];
    this.load();
  }

  add(item: T): string {
    const key = this.keyFn(item);
    const isNew = !this.items.has(key);

    this.items.set(key, item);
    if (isNew) {
      this.ordered.push(key);
    }

    // FIFO eviction
    if (this.maxItems > 0) {
      while (this.ordered.length > this.maxItems) {
        const oldest = this.ordered.shift()!;
        this.items.delete(oldest);
      }
    }

    this.dirty = true;
    this.persist();
    return key;
  }

  get(key: string): T | undefined {
    return this.items.get(key);
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  getRecent(limit: number): T[] {
    const keys = this.ordered.slice(-limit).reverse();
    return keys.map((k) => this.items.get(k)!).filter(Boolean);
  }

  size(): number {
    return this.items.size;
  }

  remove(key: string): boolean {
    const existed = this.items.delete(key);
    if (existed) {
      this.ordered = this.ordered.filter((k) => k !== key);
      this.dirty = true;
      this.persist();
    }
    return existed;
  }

  clear(): void {
    this.items.clear();
    this.ordered = [];
    this.dirty = true;
    this.persist();
  }

  // ─── Persistence ───────────────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(this.path)) {
        const raw = readFileSync(this.path, "utf-8");
        const data = JSON.parse(raw) as Array<{ key: string; value: T }>;
        for (const entry of data) {
          this.items.set(entry.key, entry.value);
          this.ordered.push(entry.key);
        }
        console.log(`[Store] Loaded ${data.length} items from ${this.path}`);
      }
    } catch (err) {
      console.error(`[Store] Failed to load from ${this.path}:`, err);
    }
  }

  private persist(): void {
    if (!this.dirty) return;
    try {
      const data = this.ordered.map((key) => ({
        key,
        value: this.items.get(key)!,
      }));
      writeFileSync(this.path, JSON.stringify(data, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error(`[Store] Failed to persist to ${this.path}:`, err);
    }
  }
}
