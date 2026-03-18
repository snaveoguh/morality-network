import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { Position } from "./types";

interface PositionStoreFile {
  positions: Position[];
}

/* ── Upstash Redis REST helpers (no npm dependency) ── */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_KEY = "pooter:positions";

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisGet(): Promise<Position[] | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
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

async function redisSet(positions: Position[]): Promise<boolean> {
  if (!redisEnabled()) return false;
  try {
    const payload: PositionStoreFile = { positions };
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
  } catch {
    return false;
  }
}

/* ── Position Store ── */

export class PositionStore {
  private readonly persistPath: string;
  private loaded = false;
  private positions = new Map<string, Position>();
  private writeInFlight: Promise<void> = Promise.resolve();

  constructor(persistPath: string) {
    this.persistPath = persistPath;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
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
      const raw = await fs.readFile(this.persistPath, "utf-8");
      const parsed = JSON.parse(raw) as PositionStoreFile;
      const list = Array.isArray(parsed.positions) ? parsed.positions : [];
      for (const position of list) {
        this.positions.set(position.id, position);
      }
      // Migrate: if we loaded from disk and Redis is available, sync up
      if (redisEnabled() && list.length > 0) {
        await redisSet(list);
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

  private async persist(): Promise<void> {
    this.writeInFlight = this.writeInFlight.then(async () => {
      const all = this.getAll();

      // Write to Redis (primary)
      const redisDone = await redisSet(all);

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
