"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAIUsageSummary = fetchAIUsageSummary;
exports.clearAIUsageSummaryCache = clearAIUsageSummaryCache;
exports.recordAIUsage = recordAIUsage;
exports.getAIProviderBudgetState = getAIProviderBudgetState;
require("server-only");
const ai_budget_1 = require("../ai-budget");
const indexer_backend_1 = require("./indexer-backend");
const SUMMARY_CACHE_TTL_MS = 15_000;
const summaryCache = new Map();
function getSummaryCacheKey(hours, task) {
    return `${hours}:${task ?? "*"}`;
}
async function fetchAIUsageSummary(options = {}) {
    const baseUrl = (0, indexer_backend_1.getIndexerBackendUrl)();
    if (!baseUrl)
        return null;
    const hours = Math.max(1, Math.floor(options.hours ?? (0, ai_budget_1.getAIBudgetWindowHours)()));
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
    const value = await (0, indexer_backend_1.fetchIndexerJson)(`/api/v1/ai/usage/summary?${searchParams.toString()}`);
    summaryCache.set(key, {
        expiresAt: now + SUMMARY_CACHE_TTL_MS,
        value,
    });
    return value;
}
function clearAIUsageSummaryCache() {
    summaryCache.clear();
}
async function recordAIUsage(input) {
    const baseUrl = (0, indexer_backend_1.getIndexerBackendUrl)();
    if (!baseUrl)
        return;
    const headers = {
        "content-type": "application/json",
    };
    const secret = process.env.INDEXER_WORKER_SECRET?.trim();
    if (secret) {
        headers.authorization = `Bearer ${secret}`;
    }
    const response = await fetch(new URL("/api/v1/ai/usage", `${baseUrl}/`).toString(), {
        method: "POST",
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
async function getAIProviderBudgetState(provider, task) {
    const summary = await fetchAIUsageSummary({
        hours: (0, ai_budget_1.getAIBudgetWindowHours)(),
        task,
    });
    if (!summary)
        return null;
    const totalBudgetUsd = (0, ai_budget_1.getGlobalBudgetUsd)();
    const providerBudgetUsd = (0, ai_budget_1.getProviderBudgetUsd)(provider);
    const providerSummary = summary.providers.find((entry) => entry.provider === provider);
    const totalSpentUsd = summary.totals.estimatedCostUsd ?? 0;
    const providerSpentUsd = providerSummary?.estimatedCostUsd ?? 0;
    const totalRemainingUsd = totalBudgetUsd === null ? null : Math.max(0, totalBudgetUsd - totalSpentUsd);
    const providerRemainingUsd = providerBudgetUsd === null ? null : Math.max(0, providerBudgetUsd - providerSpentUsd);
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
