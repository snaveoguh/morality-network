import { randomUUID } from "node:crypto";
import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hash } from "viem";
import type { ScannerLaunch, TraderExecutionConfig } from "./types";

const MARKET_CACHE_TTL_MS = 20_000;

interface HyperliquidClientBundle {
  infoClient: InfoClient;
  exchangeClient: ExchangeClient;
  leverageByAsset: Map<number, number>;
}

interface MarketCache {
  updatedAt: number;
  markets: Map<string, HyperliquidMarketSnapshot>;
}

let cachedClientKey = "";
let cachedClients: HyperliquidClientBundle | null = null;
let marketCache: MarketCache | null = null;

export interface HyperliquidMarketSnapshot {
  symbol: string;
  marketId: number;
  priceUsd: number | null;
  szDecimals: number;
  maxLeverage: number | null;
  dayNotionalVolumeUsd: number | null;
  openInterest: number | null;
}

export interface HyperliquidOrderIntent {
  id: string;
  symbol: string;
  marketId: number;
  side: "buy" | "sell";
  leverage: number;
  notionalUsd: number;
  fillPriceUsd: number;
  size: number;
  sizeRaw: string;
  txHash: Hash;
  timestamp: number;
  orderId?: number;
}

interface ParsedStatus {
  orderId?: number;
  filledSize?: string;
  filledPrice?: string;
}

function parsePositive(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeTicker(value: string): string {
  let next = value.trim().toUpperCase();
  if (next.includes("/")) {
    next = next.split("/", 1)[0];
  }
  next = next.replace(/-PERP$/i, "");
  next = next.replace(/PERP$/i, "");
  next = next.replace(/-USD$/i, "");
  next = next.replace(/-USDT$/i, "");
  next = next.replace(/USD$/i, "");
  next = next.replace(/USDT$/i, "");
  return next.trim();
}

function normalizeDecimalString(value: string, maxDecimals: number): string {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const [whole, fractional = ""] = trimmed.split(".");
  const normalizedFractional = fractional.slice(0, Math.max(0, maxDecimals));
  const withFraction = normalizedFractional.length > 0 ? `${whole}.${normalizedFractional}` : whole;
  return withFraction.replace(/\.?0+$/, "").replace(/^$/, "0");
}

function rawToDecimal(raw: string, decimals: number): string {
  const sanitized = raw.replace(/^0+/, "") || "0";
  if (decimals <= 0) return sanitized;
  if (sanitized.length <= decimals) {
    const fractional = sanitized.padStart(decimals, "0").replace(/0+$/, "");
    return fractional.length > 0 ? `0.${fractional}` : "0";
  }
  const whole = sanitized.slice(0, sanitized.length - decimals);
  const fractional = sanitized.slice(sanitized.length - decimals).replace(/0+$/, "");
  return fractional.length > 0 ? `${whole}.${fractional}` : whole;
}

function decimalToRaw(value: string, decimals: number): string {
  const normalized = normalizeDecimalString(value, decimals);
  const [whole, fractional = ""] = normalized.split(".");
  const paddedFractional = fractional.padEnd(decimals, "0");
  const units = `${whole}${paddedFractional}`.replace(/^0+/, "") || "0";
  if (!/^\d+$/.test(units)) {
    throw new Error(`Invalid decimal conversion: ${value}`);
  }
  return units;
}

function formatDecimal(value: number, maxDecimals: number): string {
  const fixed = value.toFixed(Math.max(0, maxDecimals));
  return fixed.replace(/\.?0+$/, "");
}

function syntheticHash(seed?: string): Hash {
  const material = seed ?? randomUUID();
  const raw = Buffer.from(material).toString("hex").padEnd(64, "0").slice(0, 64);
  return `0x${raw}` as Hash;
}

function getClientKey(config: TraderExecutionConfig): string {
  return [
    config.hyperliquid.apiUrl,
    config.hyperliquid.isTestnet ? "testnet" : "mainnet",
    config.privateKey.slice(0, 10),
    config.privateKey.slice(-6),
  ].join("|");
}

function getHyperliquidClients(config: TraderExecutionConfig): HyperliquidClientBundle {
  const key = getClientKey(config);
  if (cachedClients && cachedClientKey === key) {
    return cachedClients;
  }

  const wallet = privateKeyToAccount(config.privateKey);
  const transport = new HttpTransport({
    apiUrl: config.hyperliquid.apiUrl,
    isTestnet: config.hyperliquid.isTestnet,
    timeout: 8_000,
  });

  cachedClients = {
    infoClient: new InfoClient({ transport }),
    exchangeClient: new ExchangeClient({ transport, wallet }),
    leverageByAsset: new Map<number, number>(),
  };
  cachedClientKey = key;
  return cachedClients;
}

function mapMetaAndCtxs(raw: unknown): Map<string, HyperliquidMarketSnapshot> {
  const markets = new Map<string, HyperliquidMarketSnapshot>();
  if (!Array.isArray(raw) || raw.length < 2) return markets;

  const meta = raw[0] as { universe?: Array<{ name?: string; szDecimals?: number; maxLeverage?: number }> };
  const ctxs = raw[1] as Array<{ midPx?: string | null; markPx?: string; dayNtlVlm?: string; openInterest?: string }>;

  const universe = Array.isArray(meta.universe) ? meta.universe : [];
  const contexts = Array.isArray(ctxs) ? ctxs : [];

  for (const [index, asset] of universe.entries()) {
    const symbol = normalizeHyperliquidSymbol(asset?.name);
    if (!symbol) continue;

    const ctx = contexts[index];
    const snapshot: HyperliquidMarketSnapshot = {
      symbol,
      marketId: index,
      priceUsd: parsePositive(ctx?.midPx) ?? parsePositive(ctx?.markPx),
      szDecimals:
        typeof asset?.szDecimals === "number" && Number.isFinite(asset.szDecimals) && asset.szDecimals >= 0
          ? asset.szDecimals
          : 6,
      maxLeverage: parsePositive(asset?.maxLeverage),
      dayNotionalVolumeUsd: parsePositive(ctx?.dayNtlVlm),
      openInterest: parsePositive(ctx?.openInterest),
    };

    markets.set(symbol, snapshot);
  }

  return markets;
}

function computeSizeFromNotional(notionalUsd: number, priceUsd: number, szDecimals: number): string {
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    throw new Error("Invalid notional amount");
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error("Invalid market price");
  }

  const size = notionalUsd / priceUsd;
  const sizeStr = normalizeDecimalString(formatDecimal(size, Math.max(0, szDecimals)), szDecimals);
  if (Number(sizeStr) <= 0) {
    throw new Error("Size rounds down to zero");
  }
  return sizeStr;
}

function parseFirstOrderStatus(response: unknown): ParsedStatus {
  if (!response || typeof response !== "object") {
    throw new Error("Invalid Hyperliquid order response");
  }
  const envelope = response as {
    response?: { data?: { statuses?: unknown[] } };
  };
  const status = envelope.response?.data?.statuses?.[0];
  if (!status) {
    throw new Error("Hyperliquid order missing status");
  }

  if (typeof status === "string") {
    throw new Error(`Hyperliquid order status: ${status}`);
  }
  if (typeof status !== "object") {
    throw new Error("Hyperliquid order returned unknown status shape");
  }

  const statusObject = status as Record<string, unknown>;
  if ("error" in statusObject && typeof statusObject.error === "string") {
    throw new Error(`Hyperliquid order error: ${statusObject.error}`);
  }
  if ("filled" in statusObject && statusObject.filled && typeof statusObject.filled === "object") {
    const filled = statusObject.filled as { oid?: number; totalSz?: string; avgPx?: string };
    return {
      orderId: typeof filled.oid === "number" ? filled.oid : undefined,
      filledSize: filled.totalSz,
      filledPrice: filled.avgPx,
    };
  }
  if ("resting" in statusObject && statusObject.resting && typeof statusObject.resting === "object") {
    const resting = statusObject.resting as { oid?: number };
    return {
      orderId: typeof resting.oid === "number" ? resting.oid : undefined,
    };
  }

  throw new Error("Hyperliquid order response not parseable");
}

export function normalizeHyperliquidSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = normalizeTicker(raw);
  return normalized.length > 0 ? normalized : null;
}

export async function fetchHyperliquidMarkets(
  config: TraderExecutionConfig,
  opts?: { force?: boolean }
): Promise<Map<string, HyperliquidMarketSnapshot>> {
  const now = Date.now();
  if (!opts?.force && marketCache && now - marketCache.updatedAt < MARKET_CACHE_TTL_MS) {
    return marketCache.markets;
  }

  const clients = getHyperliquidClients(config);
  const response = await clients.infoClient.metaAndAssetCtxs();
  const markets = mapMetaAndCtxs(response as unknown);

  marketCache = {
    updatedAt: now,
    markets,
  };
  return markets;
}

export async function fetchHyperliquidMarketBySymbol(
  config: TraderExecutionConfig,
  symbol: string
): Promise<HyperliquidMarketSnapshot | null> {
  const normalized = normalizeHyperliquidSymbol(symbol);
  if (!normalized) return null;
  const markets = await fetchHyperliquidMarkets(config);
  return markets.get(normalized) ?? null;
}

export async function resolveHyperliquidMarketForLaunch(
  config: TraderExecutionConfig,
  launch: ScannerLaunch
): Promise<HyperliquidMarketSnapshot | null> {
  const markets = await fetchHyperliquidMarkets(config);
  const candidates = [
    normalizeHyperliquidSymbol(launch.tokenMeta?.symbol),
    normalizeHyperliquidSymbol(launch.pairedAsset),
    normalizeHyperliquidSymbol(config.hyperliquid.defaultMarket),
  ];

  for (const symbol of candidates) {
    if (!symbol) continue;
    const market = markets.get(symbol);
    if (market) return market;
  }
  return null;
}

export function resolveHyperliquidAccountAddress(
  config: TraderExecutionConfig,
  fallbackAddress: Address
): Address {
  return config.hyperliquid.accountAddress ?? fallbackAddress;
}

export async function fetchHyperliquidAccountValueUsd(
  config: TraderExecutionConfig,
  address: Address
): Promise<number | null> {
  const clients = getHyperliquidClients(config);
  const state = await clients.infoClient.clearinghouseState({ user: address as `0x${string}` });
  return (
    parsePositive(state.marginSummary?.accountValue) ??
    parsePositive(state.crossMarginSummary?.accountValue) ??
    null
  );
}

async function ensureLeverage(
  config: TraderExecutionConfig,
  market: HyperliquidMarketSnapshot,
  leverage: number
): Promise<void> {
  const clients = getHyperliquidClients(config);
  const target = Math.max(1, Math.floor(leverage));
  const current = clients.leverageByAsset.get(market.marketId);
  if (current === target) return;

  await clients.exchangeClient.updateLeverage({
    asset: market.marketId,
    isCross: true,
    leverage: target,
  });
  clients.leverageByAsset.set(market.marketId, target);
}

export async function simulateHyperliquidOrder(args: {
  config: TraderExecutionConfig;
  symbol: string;
  marketId: number;
  side: "buy" | "sell";
  leverage: number;
  notionalUsd: number;
  szDecimals: number;
}): Promise<HyperliquidOrderIntent> {
  const market = await fetchHyperliquidMarketBySymbol(args.config, args.symbol);
  const fillPriceUsd = market?.priceUsd ?? null;
  if (!fillPriceUsd || !Number.isFinite(fillPriceUsd) || fillPriceUsd <= 0) {
    throw new Error(`hyperliquid missing price for ${args.symbol}`);
  }

  const sizeStr = computeSizeFromNotional(args.notionalUsd, fillPriceUsd, args.szDecimals);
  const size = Number(sizeStr);
  const sizeRaw = decimalToRaw(sizeStr, args.szDecimals);

  return {
    id: randomUUID(),
    symbol: normalizeTicker(args.symbol),
    marketId: args.marketId,
    side: args.side,
    leverage: args.leverage,
    notionalUsd: args.notionalUsd,
    fillPriceUsd,
    size,
    sizeRaw,
    txHash: syntheticHash(`dry-run:${args.symbol}:${Date.now()}`),
    timestamp: Date.now(),
  };
}

export async function executeHyperliquidOrderLive(args: {
  config: TraderExecutionConfig;
  market: HyperliquidMarketSnapshot;
  side: "buy" | "sell";
  leverage: number;
  slippageBps: number;
  reduceOnly?: boolean;
  notionalUsd?: number;
  sizeRaw?: string;
}): Promise<HyperliquidOrderIntent> {
  if (args.config.dryRun) {
    throw new Error("Live Hyperliquid execution requested in dry-run mode");
  }

  if (!args.market.priceUsd || args.market.priceUsd <= 0) {
    throw new Error(`Missing market price for ${args.market.symbol}`);
  }

  const clients = getHyperliquidClients(args.config);
  const reduceOnly = args.reduceOnly === true;

  if (!reduceOnly) {
    await ensureLeverage(args.config, args.market, args.leverage);
  }

  const sizeStr = args.sizeRaw
    ? rawToDecimal(args.sizeRaw, args.market.szDecimals)
    : computeSizeFromNotional(args.notionalUsd ?? 0, args.market.priceUsd, args.market.szDecimals);
  const normalizedSize = normalizeDecimalString(sizeStr, args.market.szDecimals);
  if (Number(normalizedSize) <= 0) {
    throw new Error("Order size resolved to zero");
  }

  const priceMultiplier = args.side === "buy" ? 1 + args.slippageBps / 10_000 : 1 - args.slippageBps / 10_000;
  const limitPrice = args.market.priceUsd * priceMultiplier;
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    throw new Error("Invalid limit price for Hyperliquid order");
  }

  const response = await clients.exchangeClient.order({
    orders: [
      {
        a: args.market.marketId,
        b: args.side === "buy",
        p: formatDecimal(limitPrice, 8),
        s: normalizedSize,
        r: reduceOnly,
        t: {
          limit: {
            tif: "FrontendMarket",
          },
        },
      },
    ],
    grouping: "na",
  });

  const parsed = parseFirstOrderStatus(response);
  if (!parsed.filledSize || !parsed.filledPrice) {
    if (parsed.orderId !== undefined) {
      await clients.exchangeClient.cancel({
        cancels: [{ a: args.market.marketId, o: parsed.orderId }],
      });
    }
    throw new Error(`Hyperliquid market order not fully filled for ${args.market.symbol}`);
  }

  const fillSize = parsePositive(parsed.filledSize);
  const fillPrice = parsePositive(parsed.filledPrice);
  if (!fillSize || !fillPrice) {
    throw new Error(`Hyperliquid returned invalid fill metrics for ${args.market.symbol}`);
  }

  const sizeRaw = decimalToRaw(parsed.filledSize, args.market.szDecimals);
  const notionalUsd = fillSize * fillPrice;

  return {
    id: randomUUID(),
    symbol: args.market.symbol,
    marketId: args.market.marketId,
    side: args.side,
    leverage: Math.max(1, Math.floor(args.leverage)),
    notionalUsd,
    fillPriceUsd: fillPrice,
    size: fillSize,
    sizeRaw,
    txHash: syntheticHash(`live:${args.market.symbol}:${parsed.orderId ?? randomUUID()}:${Date.now()}`),
    timestamp: Date.now(),
    orderId: parsed.orderId,
  };
}
