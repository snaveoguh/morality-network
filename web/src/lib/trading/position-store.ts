import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { Position } from "./types";

interface PositionStoreFile {
  positions: Position[];
}

/* ── Upstash Redis REST helpers (no npm dependency) ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

/**
 * Derive a Redis key from the filesystem persist path.
 * e.g. "/tmp/pooter-trader-positions.json"       → "pooter:positions"
 *      "/tmp/pooter-trader-positions-base.json"   → "pooter:positions-base"
 * This ensures each runner has its own isolated key.
 */
function deriveRedisKey(persistPath: string): string {
  const base = persistPath.split("/").pop() ?? "positions";
  const stem = base.replace(/\.json$/i, "").replace(/^pooter-trader-/, "");
  return `pooter:${stem}`;
}

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisGet(redisKey: string): Promise<Position[] | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${redisKey}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    const parsed = JSON.parse(body.result) as PositionStoreFile;
    return Array.isArray(parsed.positions) ? parsed.positions : null;
  } catch {
    return null;
  }
}

async function redisSet(redisKey: string, positions: Position[]): Promise<boolean> {
  if (!redisEnabled()) return false;
  try {
    const payload: PositionStoreFile = { positions };
    const res = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", redisKey, JSON.stringify(payload)]),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Position Store ── */

export class PositionStore {
  private readonly persistPath: string;
  private readonly redisKey: string;
  private loaded = false;
  private positions = new Map<string, Position>();
  private writeInFlight: Promise<void> = Promise.resolve();

  constructor(persistPath: string) {
    this.persistPath = persistPath;
    this.redisKey = deriveRedisKey(persistPath);
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    // Try Redis first (persistent across deploys)
    const redisPositions = await redisGet(this.redisKey);
    if (redisPositions) {
      for (const position of redisPositions) {
        this.positions.set(position.id, position);
      }
      return;
    }

    // Fallback to filesystem
    try {
      const raw = await fs.readFile(this.persistPath, "utf-8");
      const parsed = JSON.parse(raw) as PositionStoreFile;
      const list = Array.isArray(parsed.positions) ? parsed.positions : [];
      for (const position of list) {
        this.positions.set(position.id, position);
      }
      // Migrate: if we loaded from disk and Redis is available, sync up
      if (redisEnabled() && list.length > 0) {
        await redisSet(this.redisKey, list);
      }
    } catch {
      // Fresh store.
    }
  }

  getAll(): Position[] {
    return Array.from(this.positions.values()).sort(
      (a, b) => b.openedAt - a.openedAt,
    );
  }

  getOpen(): Position[] {
    return this.getAll().filter((position) => position.status === "open");
  }

  getClosed(): Position[] {
    return this.getAll().filter((position) => position.status === "closed");
  }

  getBySymbol(symbol: string): Position | undefined {
    const upper = symbol.toUpperCase();
    return this.getOpen().find(
      (position) => position.marketSymbol?.toUpperCase() === upper,
    );
  }

  getByToken(tokenAddress: string): Position | undefined {
    const lower = tokenAddress.toLowerCase();
    return this.getOpen().find(
      (position) => position.tokenAddress.toLowerCase() === lower,
    );
  }

  async upsert(position: Position): Promise<void> {
    this.positions.set(position.id, position);
    await this.persist();
  }

  /** Remove a position entirely (e.g. failed order cleanup). */
  deleteById(id: string): void {
    this.positions.delete(id);
    // Persist asynchronously — fire and forget
    this.persist().catch(() => {});
  }

  async close(
    positionId: string,
    updates: Partial<Position>,
  ): Promise<Position | null> {
    const existing = this.positions.get(positionId);
    if (!existing) return null;

    const next: Position = {
      ...existing,
      ...updates,
      status: "closed",
      closedAt: updates.closedAt ?? Date.now(),
    };
    this.positions.set(positionId, next);
    await this.persist();
    return next;
  }

  /**
   * Load closed positions from legacy Redis keys (read-only).
   * Merges old history without polluting the active store.
   * Deduplicates by position ID — current store wins on conflicts.
   */
  async getAllWithLegacy(): Promise<Position[]> {
    const current = this.getAll();
    const currentIds = new Set(current.map((p) => p.id));

    // Legacy keys from previous store paths
    const legacyKeys = ["pooter:positions", "pooter:v2", "pooter:v3"];
    const legacyPositions: Position[] = [];

    for (const key of legacyKeys) {
      if (key === this.redisKey) continue; // skip our own key
      const positions = await redisGet(key);
      if (positions) {
        for (const p of positions) {
          if (!currentIds.has(p.id) && p.status === "closed") {
            currentIds.add(p.id);
            legacyPositions.push(p);
          }
        }
      }
    }

    return [...current, ...legacyPositions].sort(
      (a, b) => b.openedAt - a.openedAt,
    );
  }

  private async persist(): Promise<void> {
    this.writeInFlight = this.writeInFlight.then(async () => {
      const all = this.getAll();

      // Write to Redis (per-runner key)
      const redisDone = await redisSet(this.redisKey, all);

      // Also write to filesystem (backup / local dev)
      if (!redisDone) {
        try {
          await fs.mkdir(dirname(this.persistPath), { recursive: true });
          const payload: PositionStoreFile = { positions: all };
          await fs.writeFile(
            this.persistPath,
            JSON.stringify(payload),
            "utf-8",
          );
        } catch {
          // Filesystem write failed — not fatal if Redis worked
        }
      }
    });
    await this.writeInFlight;
  }
}
