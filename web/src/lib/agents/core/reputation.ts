// ─── Agent Core — Reputation System ─────────────────────────────────────────
// Natural selection among 67 agents. Score drives capital allocation, dormancy,
// and ultimately whether an agent survives or starves.

export interface ReputationEntry {
  agentId: string;
  score: number;           // 0-100
  totalRevenue: number;    // USD earned
  totalCost: number;       // USD spent
  signalHits: number;      // signals that led to profitable trades
  signalMisses: number;    // signals that led to losses
  actionsCompleted: number;
  actionsFailed: number;
  lastUpdated: number;
}

export type ReputationEventType =
  | "trade-profit"
  | "trade-loss"
  | "signal-hit"
  | "signal-miss"
  | "action-complete"
  | "action-fail";

export interface ReputationEvent {
  type: ReputationEventType;
  amountUsd?: number; // required for trade-profit / trade-loss
}

const DORMANCY_THRESHOLD = 10;
const DEFAULT_SCORE = 50;
const DECAY_RATE = 0.01; // 1% daily regression toward mean

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function freshEntry(agentId: string): ReputationEntry {
  return {
    agentId,
    score: DEFAULT_SCORE,
    totalRevenue: 0,
    totalCost: 0,
    signalHits: 0,
    signalMisses: 0,
    actionsCompleted: 0,
    actionsFailed: 0,
    lastUpdated: Date.now(),
  };
}

export class ReputationTracker {
  private entries = new Map<string, ReputationEntry>();

  /** Ensure an entry exists, creating a default if needed. */
  private ensure(agentId: string): ReputationEntry {
    let e = this.entries.get(agentId);
    if (!e) {
      e = freshEntry(agentId);
      this.entries.set(agentId, e);
    }
    return e;
  }

  /** Record a reputation event for an agent. */
  record(agentId: string, event: ReputationEvent): void {
    const e = this.ensure(agentId);
    const amt = event.amountUsd ?? 0;

    switch (event.type) {
      case "trade-profit":
        e.score = clamp(e.score + 3 * amt, 0, 100);
        e.totalRevenue += amt;
        break;
      case "trade-loss":
        e.score = clamp(e.score - 2 * amt, 0, 100);
        e.totalCost += amt;
        break;
      case "signal-hit":
        e.score = clamp(e.score + 5, 0, 100);
        e.signalHits++;
        break;
      case "signal-miss":
        e.score = clamp(e.score - 3, 0, 100);
        e.signalMisses++;
        break;
      case "action-complete":
        e.score = clamp(e.score + 0.5, 0, 100);
        e.actionsCompleted++;
        break;
      case "action-fail":
        e.score = clamp(e.score - 1, 0, 100);
        e.actionsFailed++;
        break;
    }

    e.lastUpdated = Date.now();
  }

  /** Get current score for an agent. */
  getScore(agentId: string): number {
    return this.ensure(agentId).score;
  }

  /** Get all agents sorted by score descending. */
  getRankings(): ReputationEntry[] {
    return [...this.entries.values()].sort((a, b) => b.score - a.score);
  }

  /**
   * Proportional capital allocation based on ranking tier.
   *  - Top 10:    2x share
   *  - Middle 47: 1x share
   *  - Bottom 10: 0.5x share (or 0 if dormant)
   */
  getCapitalAllocation(agentId: string, totalBudget: number): number {
    const rankings = this.getRankings();
    const idx = rankings.findIndex((e) => e.agentId === agentId);
    if (idx === -1) return 0;

    const entry = rankings[idx];
    if (!this.isAlive(entry.agentId)) return 0;

    // Compute multiplier per tier
    const multiplier = idx < 10 ? 2 : idx < 57 ? 1 : 0.5;

    // Total weighted shares
    let totalShares = 0;
    for (let i = 0; i < rankings.length; i++) {
      if (!this.isAlive(rankings[i].agentId)) continue;
      totalShares += i < 10 ? 2 : i < 57 ? 1 : 0.5;
    }

    if (totalShares === 0) return 0;
    return (multiplier / totalShares) * totalBudget;
  }

  /** An agent is alive if its score exceeds the dormancy threshold. */
  isAlive(agentId: string): boolean {
    return this.ensure(agentId).score > DORMANCY_THRESHOLD;
  }

  /** Daily decay — all scores regress 1% toward the mean (50). */
  decay(): void {
    for (const e of this.entries.values()) {
      const delta = DEFAULT_SCORE - e.score;
      e.score += delta * DECAY_RATE;
      e.lastUpdated = Date.now();
    }
  }

  /** Full serializable state. */
  snapshot(): ReputationEntry[] {
    return this.getRankings();
  }
}

/** Singleton reputation tracker. */
export const reputationTracker = new ReputationTracker();
