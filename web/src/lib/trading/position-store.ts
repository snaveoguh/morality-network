import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { Position } from "./types";

interface PositionStoreFile {
  positions: Position[];
}

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

    try {
      const raw = await fs.readFile(this.persistPath, "utf-8");
      const parsed = JSON.parse(raw) as PositionStoreFile;
      const list = Array.isArray(parsed.positions) ? parsed.positions : [];
      for (const position of list) {
        this.positions.set(position.id, position);
      }
    } catch {
      // Fresh store.
    }
  }

  getAll(): Position[] {
    return Array.from(this.positions.values()).sort((a, b) => b.openedAt - a.openedAt);
  }

  getOpen(): Position[] {
    return this.getAll().filter((position) => position.status === "open");
  }

  getByToken(tokenAddress: string): Position | undefined {
    const lower = tokenAddress.toLowerCase();
    return this.getOpen().find((position) => position.tokenAddress.toLowerCase() === lower);
  }

  async upsert(position: Position): Promise<void> {
    this.positions.set(position.id, position);
    await this.persist();
  }

  async close(positionId: string, updates: Partial<Position>): Promise<Position | null> {
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
      await fs.mkdir(dirname(this.persistPath), { recursive: true });
      const payload: PositionStoreFile = {
        positions: this.getAll(),
      };
      await fs.writeFile(this.persistPath, JSON.stringify(payload), "utf-8");
    });
    await this.writeInFlight;
  }
}
