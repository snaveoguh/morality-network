"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionStore = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/* ── Upstash Redis REST helpers (no npm dependency) ── */
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_KEY = "pooter:positions";
function redisEnabled() {
    return !!(UPSTASH_URL && UPSTASH_TOKEN);
}
async function redisGet() {
    if (!redisEnabled())
        return null;
    try {
        const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
            cache: "no-store",
        });
        if (!res.ok)
            return null;
        const body = (await res.json());
        if (!body.result)
            return null;
        const parsed = JSON.parse(body.result);
        return Array.isArray(parsed.positions) ? parsed.positions : null;
    }
    catch {
        return null;
    }
}
async function redisSet(positions) {
    if (!redisEnabled())
        return false;
    try {
        const payload = { positions };
        const res = await fetch(`${UPSTASH_URL}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${UPSTASH_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(["SET", REDIS_KEY, JSON.stringify(payload)]),
            cache: "no-store",
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/* ── Position Store ── */
class PositionStore {
    persistPath;
    loaded = false;
    positions = new Map();
    writeInFlight = Promise.resolve();
    constructor(persistPath) {
        this.persistPath = persistPath;
    }
    async load() {
        if (this.loaded)
            return;
        this.loaded = true;
        // Try Redis first (persistent across deploys)
        const redisPositions = await redisGet();
        if (redisPositions) {
            for (const position of redisPositions) {
                this.positions.set(position.id, position);
            }
            return;
        }
        // Fallback to filesystem
        try {
            const raw = await node_fs_1.promises.readFile(this.persistPath, "utf-8");
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed.positions) ? parsed.positions : [];
            for (const position of list) {
                this.positions.set(position.id, position);
            }
            // Migrate: if we loaded from disk and Redis is available, sync up
            if (redisEnabled() && list.length > 0) {
                await redisSet(list);
            }
        }
        catch {
            // Fresh store.
        }
    }
    getAll() {
        return Array.from(this.positions.values()).sort((a, b) => b.openedAt - a.openedAt);
    }
    getOpen() {
        return this.getAll().filter((position) => position.status === "open");
    }
    getClosed() {
        return this.getAll().filter((position) => position.status === "closed");
    }
    getBySymbol(symbol) {
        const upper = symbol.toUpperCase();
        return this.getOpen().find((position) => position.marketSymbol?.toUpperCase() === upper);
    }
    getByToken(tokenAddress) {
        const lower = tokenAddress.toLowerCase();
        return this.getOpen().find((position) => position.tokenAddress.toLowerCase() === lower);
    }
    async upsert(position) {
        this.positions.set(position.id, position);
        await this.persist();
    }
    async close(positionId, updates) {
        const existing = this.positions.get(positionId);
        if (!existing)
            return null;
        const next = {
            ...existing,
            ...updates,
            status: "closed",
            closedAt: updates.closedAt ?? Date.now(),
        };
        this.positions.set(positionId, next);
        await this.persist();
        return next;
    }
    async persist() {
        this.writeInFlight = this.writeInFlight.then(async () => {
            const all = this.getAll();
            // Write to Redis (primary)
            const redisDone = await redisSet(all);
            // Also write to filesystem (backup / local dev)
            if (!redisDone) {
                try {
                    await node_fs_1.promises.mkdir((0, node_path_1.dirname)(this.persistPath), { recursive: true });
                    const payload = { positions: all };
                    await node_fs_1.promises.writeFile(this.persistPath, JSON.stringify(payload), "utf-8");
                }
                catch {
                    // Filesystem write failed — not fatal if Redis worked
                }
            }
        });
        await this.writeInFlight;
    }
}
exports.PositionStore = PositionStore;
