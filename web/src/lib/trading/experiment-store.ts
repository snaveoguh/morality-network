/**
 * experiment-store.ts — Upstash Redis persistence for autoresearch experiments.
 *
 * Follows the same REST API pattern as position-store.ts.
 * Experiments survive serverless cold starts via Redis, with filesystem fallback.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

/* ═══════════════════════════  Types  ═══════════════════════════ */

export interface ExperimentParams {
  signalWeights: {
    technical: number;
    pattern: number;
    news: number;
    marketData: number;
    walletFlow: number;
  };
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopPct: number;
  minSignalConfidence: number;
  maxLeverage: number;
}

export interface ExperimentMetrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  totalPnlUsd: number;
  avgHoldDurationMs: number;
}

export interface ExperimentConfig {
  id: string;
  createdAt: number;
  status: "proposed" | "running" | "completed" | "adopted" | "rejected";
  baselineParams: ExperimentParams;
  experimentParams: ExperimentParams;
  /** LLM-generated rationale for the parameter change */
  hypothesis: string;
  /** Metrics from trades BEFORE the experiment started */
  baselineMetrics: ExperimentMetrics | null;
  /** Metrics from trades DURING the experiment */
  experimentMetrics: ExperimentMetrics | null;
  /** Minimum trades required before evaluating */
  minTrades: number;
  /** Trades completed since experiment started */
  tradesCompleted: number;
  adoptedAt?: number;
  rejectedAt?: number;
  rejectionReason?: string;
}

/* ═══════════════════════════  Redis helpers  ═══════════════════════════ */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const REDIS_KEY = "pooter:experiments";
const PERSIST_PATH = "/tmp/pooter-experiments.json";

function redisEnabled(): boolean {
  return !!(UPSTASH_URL && UPSTASH_TOKEN);
}

interface ExperimentStoreFile {
  experiments: ExperimentConfig[];
}

async function redisGet(): Promise<ExperimentConfig[] | null> {
  if (!redisEnabled()) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${REDIS_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string };
    if (!body.result) return null;
    const parsed = JSON.parse(body.result) as ExperimentStoreFile;
    return Array.isArray(parsed.experiments) ? parsed.experiments : null;
  } catch {
    return null;
  }
}

async function redisSet(experiments: ExperimentConfig[]): Promise<boolean> {
  if (!redisEnabled()) return false;
  try {
    const payload: ExperimentStoreFile = { experiments };
    const res = await fetch(UPSTASH_URL, {
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

/* ═══════════════════════════  Store class  ═══════════════════════════ */

export class ExperimentStore {
  private experiments: ExperimentConfig[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;

    // Try Redis first
    const fromRedis = await redisGet();
    if (fromRedis) {
      this.experiments = fromRedis;
      this.loaded = true;
      return;
    }

    // Fallback to filesystem
    try {
      const raw = await fs.readFile(PERSIST_PATH, "utf-8");
      const parsed = JSON.parse(raw) as ExperimentStoreFile;
      this.experiments = Array.isArray(parsed.experiments) ? parsed.experiments : [];
    } catch {
      this.experiments = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const saved = await redisSet(this.experiments);
    // Always write filesystem as backup
    try {
      await fs.mkdir(dirname(PERSIST_PATH), { recursive: true });
      await fs.writeFile(PERSIST_PATH, JSON.stringify({ experiments: this.experiments }, null, 2));
    } catch {
      // Non-fatal
    }
  }

  async getAll(): Promise<ExperimentConfig[]> {
    await this.load();
    return [...this.experiments];
  }

  async getActive(): Promise<ExperimentConfig | null> {
    await this.load();
    return this.experiments.find((e) => e.status === "running") ?? null;
  }

  async getHistory(): Promise<ExperimentConfig[]> {
    await this.load();
    return this.experiments
      .filter((e) => e.status === "completed" || e.status === "adopted" || e.status === "rejected")
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async save(experiment: ExperimentConfig): Promise<void> {
    await this.load();
    const index = this.experiments.findIndex((e) => e.id === experiment.id);
    if (index >= 0) {
      this.experiments[index] = experiment;
    } else {
      this.experiments.push(experiment);
    }
    // Keep only last 50 experiments
    if (this.experiments.length > 50) {
      this.experiments = this.experiments.slice(-50);
    }
    await this.persist();
  }
}

/** Singleton experiment store */
export const experimentStore = new ExperimentStore();
