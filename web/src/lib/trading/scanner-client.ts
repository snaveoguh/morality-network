import type { Address } from "viem";
import type { ScannerLaunch, TraderExecutionConfig } from "./types";

interface ScannerEnvelope {
  launches?: unknown[];
  data?: unknown[];
  items?: unknown[];
  tokens?: unknown[];
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && value.startsWith("0x") && value.length === 42;
}

function toDex(value: unknown): "uniswap-v3" | "aerodrome" | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("uniswap")) return "uniswap-v3";
  if (normalized.includes("aerodrome")) return "aerodrome";
  return null;
}

function normalizeLaunch(raw: unknown): ScannerLaunch | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;

  const tokenAddressRaw =
    candidate.tokenAddress ??
    candidate.token ??
    candidate.baseTokenAddress ??
    candidate.address;
  if (!isAddress(tokenAddressRaw)) return null;

  const dex = toDex(candidate.dex) ?? "uniswap-v3";
  const scoreRaw = Number(candidate.score ?? 0);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

  const poolAddressRaw = candidate.poolAddress;
  const poolAddress = isAddress(poolAddressRaw) ? poolAddressRaw : undefined;

  return {
    tokenAddress: tokenAddressRaw,
    poolAddress,
    dex,
    score,
    scoreBreakdown:
      candidate.scoreBreakdown && typeof candidate.scoreBreakdown === "object"
        ? (candidate.scoreBreakdown as Record<string, number>)
        : undefined,
    pairedAsset: typeof candidate.pairedAsset === "string" ? candidate.pairedAsset : undefined,
    tokenMeta:
      candidate.tokenMeta && typeof candidate.tokenMeta === "object"
        ? (candidate.tokenMeta as ScannerLaunch["tokenMeta"])
        : undefined,
    dexScreenerData:
      candidate.dexScreenerData && typeof candidate.dexScreenerData === "object"
        ? (candidate.dexScreenerData as ScannerLaunch["dexScreenerData"])
        : undefined,
  };
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const envelope = payload as ScannerEnvelope;
  return envelope.launches ?? envelope.data ?? envelope.items ?? envelope.tokens ?? [];
}

export async function fetchScannerCandidates(
  config: TraderExecutionConfig
): Promise<ScannerLaunch[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.scannerRequestTimeoutMs);

  try {
    const requestUrl = new URL(config.scannerApiUrl);
    if (!requestUrl.searchParams.has("minScore")) {
      requestUrl.searchParams.set("minScore", String(config.risk.minScore));
    }
    if (!requestUrl.searchParams.has("limit")) {
      requestUrl.searchParams.set("limit", String(Math.max(5, config.risk.maxNewEntriesPerCycle * 3)));
    }

    const res = await fetch(requestUrl.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`scanner API ${res.status}`);
    }

    const payload = await res.json();
    const items = extractItems(payload);
    const normalized = items.map(normalizeLaunch).filter((launch): launch is ScannerLaunch => launch !== null);

    return normalized
      .filter((launch) => launch.score >= config.risk.minScore)
      .sort((a, b) => b.score - a.score);
  } finally {
    clearTimeout(timer);
  }
}
