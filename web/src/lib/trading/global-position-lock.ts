/**
 * global-position-lock.ts — Cross-system position cooldown.
 *
 * Prevents the engine and scalper from fighting over the same market.
 * Both systems check this singleton before opening any position.
 * A 10-minute global cooldown applies per market after ANY close,
 * regardless of which system closed it.
 */

const DEFAULT_COOLDOWN_MS = 600_000; // 10 minutes

interface LockEntry {
  market: string;
  source: "engine" | "scalper";
  lockedAt: number;
}

class GlobalPositionLock {
  /** Markets currently blocked from new entries */
  private cooldowns = new Map<string, LockEntry>();
  private readonly cooldownMs: number;

  constructor(cooldownMs = DEFAULT_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs;
  }

  /**
   * Check whether a new position can be opened on this market.
   * Returns true if the market is clear, false if still in cooldown.
   */
  canOpen(market: string, _source: "engine" | "scalper"): boolean {
    const key = market.toUpperCase();
    const entry = this.cooldowns.get(key);
    if (!entry) return true;

    const elapsed = Date.now() - entry.lockedAt;
    if (elapsed >= this.cooldownMs) {
      this.cooldowns.delete(key);
      return true;
    }

    return false;
  }

  /**
   * Record that a position was closed on this market.
   * Starts the global cooldown timer.
   */
  recordClose(market: string, source: "engine" | "scalper"): void {
    const key = market.toUpperCase();
    this.cooldowns.set(key, {
      market: key,
      source,
      lockedAt: Date.now(),
    });
  }

  /**
   * Record that a position was opened on this market.
   * Prevents the other system from opening a duplicate.
   */
  recordOpen(market: string, source: "engine" | "scalper"): void {
    const key = market.toUpperCase();
    this.cooldowns.set(key, {
      market: key,
      source,
      lockedAt: Date.now(),
    });
  }

  /** Get remaining cooldown time for a market (0 if clear). */
  getRemainingMs(market: string): number {
    const key = market.toUpperCase();
    const entry = this.cooldowns.get(key);
    if (!entry) return 0;

    const elapsed = Date.now() - entry.lockedAt;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  /** Get info about a market's lock state. */
  getLockInfo(market: string): { locked: boolean; by: string | null; remainingMs: number } {
    const key = market.toUpperCase();
    const entry = this.cooldowns.get(key);
    if (!entry) return { locked: false, by: null, remainingMs: 0 };

    const remaining = this.getRemainingMs(key);
    if (remaining <= 0) {
      this.cooldowns.delete(key);
      return { locked: false, by: null, remainingMs: 0 };
    }

    return { locked: true, by: entry.source, remainingMs: remaining };
  }

  /** Snapshot of all active cooldowns (for debugging / API). */
  snapshot(): Array<{ market: string; source: string; remainingMs: number }> {
    const now = Date.now();
    const result: Array<{ market: string; source: string; remainingMs: number }> = [];
    for (const [key, entry] of this.cooldowns) {
      const remaining = this.cooldownMs - (now - entry.lockedAt);
      if (remaining > 0) {
        result.push({ market: key, source: entry.source, remainingMs: remaining });
      } else {
        this.cooldowns.delete(key);
      }
    }
    return result;
  }
}

/** Singleton — shared by engine + scalper in the same process. */
const cooldownMs = parseInt(process.env.GLOBAL_POSITION_COOLDOWN_MS ?? "", 10) || DEFAULT_COOLDOWN_MS;
export const globalPositionLock = new GlobalPositionLock(cooldownMs);
