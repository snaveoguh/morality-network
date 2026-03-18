"use strict";
// ─── Agent Core — Generic Persistent Store ─────────────────────────────────
//
// Adapted from NounIRL's reservations.ts pattern.
// In-memory Map with JSON file persistence and FIFO eviction.
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
const fs_1 = require("fs");
class Store {
    items;
    ordered;
    dirty = false;
    path;
    maxItems;
    keyFn;
    constructor(options) {
        this.path = options.persistPath;
        this.maxItems = options.maxItems ?? 0;
        this.keyFn = options.keyFn ?? (() => crypto.randomUUID());
        this.items = new Map();
        this.ordered = [];
        this.load();
    }
    add(item) {
        const key = this.keyFn(item);
        const isNew = !this.items.has(key);
        this.items.set(key, item);
        if (isNew) {
            this.ordered.push(key);
        }
        // FIFO eviction
        if (this.maxItems > 0) {
            while (this.ordered.length > this.maxItems) {
                const oldest = this.ordered.shift();
                this.items.delete(oldest);
            }
        }
        this.dirty = true;
        this.persist();
        return key;
    }
    get(key) {
        return this.items.get(key);
    }
    has(key) {
        return this.items.has(key);
    }
    getAll() {
        return Array.from(this.items.values());
    }
    getRecent(limit) {
        const keys = this.ordered.slice(-limit).reverse();
        return keys.map((k) => this.items.get(k)).filter(Boolean);
    }
    size() {
        return this.items.size;
    }
    remove(key) {
        const existed = this.items.delete(key);
        if (existed) {
            this.ordered = this.ordered.filter((k) => k !== key);
            this.dirty = true;
            this.persist();
        }
        return existed;
    }
    clear() {
        this.items.clear();
        this.ordered = [];
        this.dirty = true;
        this.persist();
    }
    // ─── Persistence ───────────────────────────────────────────────────────
    load() {
        try {
            if ((0, fs_1.existsSync)(this.path)) {
                const raw = (0, fs_1.readFileSync)(this.path, "utf-8");
                const data = JSON.parse(raw);
                for (const entry of data) {
                    this.items.set(entry.key, entry.value);
                    this.ordered.push(entry.key);
                }
                console.log(`[Store] Loaded ${data.length} items from ${this.path}`);
            }
        }
        catch (err) {
            console.error(`[Store] Failed to load from ${this.path}:`, err);
        }
    }
    persist() {
        if (!this.dirty)
            return;
        try {
            const data = this.ordered.map((key) => ({
                key,
                value: this.items.get(key),
            }));
            (0, fs_1.writeFileSync)(this.path, JSON.stringify(data, null, 2));
            this.dirty = false;
        }
        catch (err) {
            console.error(`[Store] Failed to persist to ${this.path}:`, err);
        }
    }
}
exports.Store = Store;
