// ─── Trading — Treasury ─────────────────────────────────────────────────────
// System economics tracker. Records all revenue and cost events, computes
// net margin, agent budgets, runway, and self-sustainability status.

const MAX_EVENTS = 1000;
const MS_PER_DAY = 86_400_000;
const LOOKBACK_30D = 30 * MS_PER_DAY;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TreasuryState {
  // Revenue
  grossTradingPnlUsd: number;
  performanceFeesUsd: number;
  tipsReceivedUsd: number;
  // Costs
  exchangeFeesUsd: number;
  inferenceFeesUsd: number;
  gasFeesUsd: number;
  // Net
  netMarginUsd: number;
  // Agent budgets
  agentBudgets: Record<string, number>; // serializable (not Map)
  // Meta
  updatedAt: number;
}

export interface CostEvent {
  type: "exchange-fee" | "inference" | "gas";
  amountUsd: number;
  agentId?: string;
  timestamp: number;
}

export interface RevenueEvent {
  type: "trade-profit" | "performance-fee" | "tip";
  amountUsd: number;
  agentId?: string;
  timestamp: number;
}

// ─── Treasury ───────────────────────────────────────────────────────────────

export class Treasury {
  private costs: CostEvent[] = [];
  private revenues: RevenueEvent[] = [];
  private budgets = new Map<string, number>();

  // ─── Recording ──────────────────────────────────────────────────────────

  recordCost(event: CostEvent): void {
    this.costs.push(event);
    if (this.costs.length > MAX_EVENTS) {
      this.costs = this.costs.slice(-MAX_EVENTS);
    }
  }

  recordRevenue(event: RevenueEvent): void {
    this.revenues.push(event);
    if (this.revenues.length > MAX_EVENTS) {
      this.revenues = this.revenues.slice(-MAX_EVENTS);
    }
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  getState(): TreasuryState {
    let grossTradingPnlUsd = 0;
    let performanceFeesUsd = 0;
    let tipsReceivedUsd = 0;
    for (const r of this.revenues) {
      switch (r.type) {
        case "trade-profit":
          grossTradingPnlUsd += r.amountUsd;
          break;
        case "performance-fee":
          performanceFeesUsd += r.amountUsd;
          break;
        case "tip":
          tipsReceivedUsd += r.amountUsd;
          break;
      }
    }

    let exchangeFeesUsd = 0;
    let inferenceFeesUsd = 0;
    let gasFeesUsd = 0;
    for (const c of this.costs) {
      switch (c.type) {
        case "exchange-fee":
          exchangeFeesUsd += c.amountUsd;
          break;
        case "inference":
          inferenceFeesUsd += c.amountUsd;
          break;
        case "gas":
          gasFeesUsd += c.amountUsd;
          break;
      }
    }

    const totalRevenue = grossTradingPnlUsd + performanceFeesUsd + tipsReceivedUsd;
    const totalCost = exchangeFeesUsd + inferenceFeesUsd + gasFeesUsd;

    const agentBudgets: Record<string, number> = {};
    for (const [k, v] of this.budgets) {
      agentBudgets[k] = v;
    }

    return {
      grossTradingPnlUsd,
      performanceFeesUsd,
      tipsReceivedUsd,
      exchangeFeesUsd,
      inferenceFeesUsd,
      gasFeesUsd,
      netMarginUsd: totalRevenue - totalCost,
      agentBudgets,
      updatedAt: Date.now(),
    };
  }

  /** Get allocated budget for a specific agent. */
  getAgentBudget(agentId: string): number {
    return this.budgets.get(agentId) ?? 0;
  }

  /**
   * Allocate budgets to agents proportional to reputation score.
   * Rankings must be sorted by score descending.
   */
  allocateBudgets(
    totalBudgetUsd: number,
    rankings: Array<{ agentId: string; score: number }>
  ): void {
    const totalScore = rankings.reduce((sum, r) => sum + Math.max(r.score, 0), 0);
    if (totalScore === 0) return;

    this.budgets.clear();
    for (const r of rankings) {
      const share = (Math.max(r.score, 0) / totalScore) * totalBudgetUsd;
      this.budgets.set(r.agentId, share);
    }
  }

  // ─── Health Metrics ─────────────────────────────────────────────────────

  /** True if net margin over the last 30 days is positive. */
  isSelfsustaining(): boolean {
    const cutoff = Date.now() - LOOKBACK_30D;
    let rev = 0;
    let cost = 0;
    for (const r of this.revenues) {
      if (r.timestamp >= cutoff) rev += r.amountUsd;
    }
    for (const c of this.costs) {
      if (c.timestamp >= cutoff) cost += c.amountUsd;
    }
    return rev - cost > 0;
  }

  /** Estimated runway in days at current 30-day burn rate. */
  getRunwayDays(): number {
    const cutoff = Date.now() - LOOKBACK_30D;

    let rev30d = 0;
    let cost30d = 0;
    for (const r of this.revenues) {
      if (r.timestamp >= cutoff) rev30d += r.amountUsd;
    }
    for (const c of this.costs) {
      if (c.timestamp >= cutoff) cost30d += c.amountUsd;
    }

    const dailyBurn = (cost30d - rev30d) / 30;
    if (dailyBurn <= 0) return Infinity; // profitable or breakeven

    // Use total accumulated margin as "reserves"
    const state = this.getState();
    const reserves = Math.max(state.netMarginUsd, 0);
    return reserves / dailyBurn;
  }

  /** Full serializable snapshot for API. */
  snapshot(): TreasuryState {
    return this.getState();
  }
}

/** Singleton treasury. */
export const treasury = new Treasury();
