import "server-only";

import {
  getAIBudgetWindowHours,
  getGlobalBudgetUsd,
  getProviderBudgetUsd,
} from "../ai-budget";
import type { AIModelTask, AIProviderId } from "../ai-models";
import { fetchIndexerJson, getIndexerBackendUrl } from "./indexer-backend";

export interface AIUsageRecordInput {
  id?: string;
  task: AIModelTask;
  provider: AIProviderId;
  model: string;
  status: "success" | "error" | "budget-blocked";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostMicrousd: number;
  error?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: number;
}

export interface AIUsageSummaryBucket {
  provider?: string;
  model?: string;
  task?: string;
  invocations: number;
  success: number;
  error: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  avgLatencyMs: number;
  estimatedCostMicrousd: number;
  estimatedCostUsd: number;
}

export interface AIUsageSummary {
  window: {
    since: number;
    until: number;
    hours: number;
  };
  totals: AIUsageSummaryBucket;
  providers: AIUsageSummaryBucket[];
  models: AIUsageSummaryBucket[];
  tasks: AIUsageSummaryBucket[];
  meta?: Record<string, unknown>;
}

export interface AIBudgetState {
  windowHours: number;
  totalUsd: number | null;
  providerUsd: number | null;
  totalSpentUsd: number;
  providerSpentUsd: number;
  totalRemainingUsd: number | null;
  providerRemainingUsd: number | null;
  totalExceeded: boolean;
  providerExceeded: boolean;
  allowed: boolean;
}

const SUMMARY_CACHE_TTL_MS = 15_000;

const summaryCache = new Map<string, { expiresAt: number; value: AIUsageSummary }>();

function getSummaryCacheKey(hours: number, task?: string): string {
  return `${hours}:${task ?? "*"}`;
}

export async function fetchAIUsageSummary(options: {
  hours?: number;
  task?: AIModelTask;
  useCache?: boolean;
} = {}): Promise<AIUsageSummary | null> {
  const baseUrl = getIndexerBackendUrl();
  if (!baseUrl) return null;

  const hours = Math.max(1, Math.floor(options.hours ?? getAIBudgetWindowHours()));
  const key = getSummaryCacheKey(hours, options.task);
  const useCache = options.useCache !== false;
  const now = Date.now();

  if (useCache) {
    const cached = summaryCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  const searchParams = new URLSearchParams({ hours: String(hours) });
  if (options.task) {
    searchParams.set("task", options.task);
  }

  const value = await fetchIndexerJson<AIUsageSummary>(
    `/api/v1/ai/usage/summary?${searchParams.toString()}`,
  );
  summaryCache.set(key, {
    expiresAt: now + SUMMARY_CACHE_TTL_MS,
    value,
  });
  return value;
}

export function clearAIUsageSummaryCache(): void {
  summaryCache.clear();
}

export async function recordAIUsage(input: AIUsageRecordInput): Promise<void> {
  const baseUrl = getIndexerBackendUrl();
  if (!baseUrl) return;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const response = await fetch(new URL("/api/v1/ai/usage", `${baseUrl}/`).toString(), {
    method: "PUT", // Ponder 0.7.x maps ponder.post() to hono.put()
    headers,
    body: JSON.stringify({
      ...input,
      createdAt: input.createdAt ?? Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Indexer ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  clearAIUsageSummaryCache();
}

export async function getAIProviderBudgetState(
  provider: AIProviderId,
  task?: AIModelTask,
): Promise<AIBudgetState | null> {
  const summary = await fetchAIUsageSummary({
    hours: getAIBudgetWindowHours(),
    task,
  });
  if (!summary) return null;

  const totalBudgetUsd = getGlobalBudgetUsd();
  const providerBudgetUsd = getProviderBudgetUsd(provider);
  const providerSummary = summary.providers.find((entry) => entry.provider === provider);
  const totalSpentUsd = summary.totals.estimatedCostUsd ?? 0;
  const providerSpentUsd = providerSummary?.estimatedCostUsd ?? 0;
  const totalRemainingUsd =
    totalBudgetUsd === null ? null : Math.max(0, totalBudgetUsd - totalSpentUsd);
  const providerRemainingUsd =
    providerBudgetUsd === null ? null : Math.max(0, providerBudgetUsd - providerSpentUsd);
  const totalExceeded = totalBudgetUsd !== null && totalSpentUsd >= totalBudgetUsd;
  const providerExceeded = providerBudgetUsd !== null && providerSpentUsd >= providerBudgetUsd;

  return {
    windowHours: summary.window.hours,
    totalUsd: totalBudgetUsd,
    providerUsd: providerBudgetUsd,
    totalSpentUsd,
    providerSpentUsd,
    totalRemainingUsd,
    providerRemainingUsd,
    totalExceeded,
    providerExceeded,
    allowed: !totalExceeded && !providerExceeded,
  };
}
