import { randomUUID } from "node:crypto";
import { ExchangeClient, HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hash } from "viem";
import type { ScannerLaunch, TraderExecutionConfig } from "./types";

// Polyfill CloseEvent for Node.js (required by @nktkas/rews WebSocket lib)
if (typeof globalThis.CloseEvent === "undefined") {
  (globalThis as Record<string, unknown>).CloseEvent = class extends Event {
    code: number;
    reason: string;
    wasClean: boolean;
    constructor(type: string, init?: Record<string, unknown>) {
      super(type);
      this.code = (init?.code as number) ?? 0;
      this.reason = (init?.reason as string) ?? "";
      this.wasClean = (init?.wasClean as boolean) ?? false;
    }
  };
}

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

export interface HyperliquidLivePosition {
  symbol: string;
  marketId: number | null;
  szDecimals: number;
  size: string;
  isShort: boolean;
  entryPriceUsd: number;
  positionValueUsd: number;
  unrealizedPnlUsd: number;
  leverage: number | null;
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

function parseNonNegative(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function parseFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function fetchSpotUsdcBalance(config: TraderExecutionConfig, address: Address): Promise<number | null> {
  const response = await fetch(`${config.hyperliquid.apiUrl.replace(/\/+$/, "")}/info`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "spotClearinghouseState",
      user: address,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    balances?: Array<{ coin?: string; total?: string | number }>;
  };
  const balances = Array.isArray(payload?.balances) ? payload.balances : [];
  const usdcBalance = balances.find((entry) => (entry.coin || "").trim().toUpperCase() === "USDC");
  return parseNonNegative(usdcBalance?.total);
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

export function getHyperliquidClients(config: TraderExecutionConfig): HyperliquidClientBundle {
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

/* ── WebSocket client factory ── */

export interface HyperliquidWsBundle {
  transport: WebSocketTransport;
  subscriptionClient: SubscriptionClient;
}

let cachedWsTransport: WebSocketTransport | null = null;
let cachedSubClient: SubscriptionClient | null = null;

export function getHyperliquidWsClients(config: TraderExecutionConfig, forceNew = false): HyperliquidWsBundle {
  if (!forceNew && cachedWsTransport && cachedSubClient) {
    return { transport: cachedWsTransport, subscriptionClient: cachedSubClient };
  }

  if (cachedWsTransport) {
    cachedWsTransport.close().catch(() => {});
    cachedWsTransport = null;
    cachedSubClient = null;
  }

  const transport = new WebSocketTransport({
    isTestnet: config.hyperliquid.isTestnet,
    timeout: 30_000,
  });

  const subscriptionClient = new SubscriptionClient({ transport });

  cachedWsTransport = transport;
  cachedSubClient = subscriptionClient;

  return { transport, subscriptionClient };
}

export async function closeHyperliquidWs(): Promise<void> {
  const transport = cachedWsTransport;
  cachedWsTransport = null;
  cachedSubClient = null;
  if (transport) {
    await transport.close().catch(() => {});
  }
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

export async function fetchHyperliquidLivePositions(
  config: TraderExecutionConfig,
  address: Address
): Promise<HyperliquidLivePosition[]> {
  const clients = getHyperliquidClients(config);
  const [state, markets] = await Promise.all([
    clients.infoClient.clearinghouseState({ user: address as `0x${string}` }),
    fetchHyperliquidMarkets(config),
  ]);

  const rawPositions = Array.isArray(state.assetPositions) ? state.assetPositions : [];
  const live: HyperliquidLivePosition[] = [];

  for (const rawPosition of rawPositions) {
    const position = (rawPosition as { position?: Record<string, unknown> } | null)?.position;
    if (!position || typeof position !== "object") continue;

    const symbol = normalizeHyperliquidSymbol(String(position.coin ?? ""));
    if (!symbol) continue;

    const szi = parseFinite(position.szi);
    if (szi === null || szi === 0) continue;
    const absSize = Math.abs(szi);

    const market = markets.get(symbol) ?? null;
    const fallbackDecimals = String(position.szi ?? "").split(".")[1]?.length ?? 0;
    const szDecimals = market?.szDecimals ?? Math.max(0, Math.min(8, fallbackDecimals));
    const size = normalizeDecimalString(formatDecimal(absSize, szDecimals), szDecimals);

    const entryPriceUsd = parsePositive(position.entryPx);
    if (entryPriceUsd === null) continue;

    const positionValueUsd = parsePositive(position.positionValue) ?? absSize * entryPriceUsd;
    const unrealizedPnlUsd = parseFinite(position.unrealizedPnl) ?? 0;
    const leverageValue =
      parsePositive(
        (position.leverage as { value?: string | number } | undefined)?.value
      ) ?? parsePositive(position.leverage);

    live.push({
      symbol,
      marketId: market?.marketId ?? null,
      szDecimals,
      size,
      isShort: szi < 0,
      entryPriceUsd,
      positionValueUsd,
      unrealizedPnlUsd,
      leverage: leverageValue,
    });
  }

  return live.sort((a, b) => b.positionValueUsd - a.positionValueUsd);
}

export async function fetchHyperliquidAccountValueUsd(
  config: TraderExecutionConfig,
  address: Address
): Promise<number | null> {
  const clients = getHyperliquidClients(config);
  let perpAccountValue: number | null = null;

  try {
    const state = await clients.infoClient.clearinghouseState({ user: address as `0x${string}` });
    perpAccountValue =
      parseNonNegative(state.marginSummary?.accountValue) ??
      parseNonNegative(state.crossMarginSummary?.accountValue);
  } catch {
    perpAccountValue = null;
  }

  // If perp account has non-zero value, use it directly.
  if (perpAccountValue !== null && perpAccountValue > 0) {
    return perpAccountValue;
  }

  // Fallback: some accounts hold funds only in spot before perp transfer.
  try {
    const spotValue = await fetchSpotUsdcBalance(config, address);

    if (spotValue !== null) {
      return Math.max(spotValue, perpAccountValue ?? 0);
    }
  } catch {
    // ignore and fall back to perp value (possibly zero/null)
  }

  return perpAccountValue;
}

/**
 * Fetch recent fills for a specific coin and return the actual close price + PnL.
 * Used when a position "disappears" from HL to get the real exit data instead
 * of relying on stale cached market prices.
 */
export async function fetchRecentCloseFill(
  config: TraderExecutionConfig,
  address: Address,
  symbol: string,
): Promise<{ exitPriceUsd: number; closedPnlUsd: number } | null> {
  try {
    const clients = getHyperliquidClients(config);
    // HL API: userFillsByTime returns fills for the last N ms
    // Look back 10 minutes — if a position disappeared, the close fill is recent
    const startTime = Date.now() - 10 * 60 * 1000;
    const response = await clients.infoClient.userFillsByTime({
      user: address as `0x${string}`,
      startTime,
    });
    const fills = Array.isArray(response) ? response : [];

    // Find the most recent closing fill for this coin (has non-zero closedPnl)
    // Walk backwards (newest first)
    const hlCoin = symbol.replace(/-PERP$/i, "").toUpperCase();
    for (let i = fills.length - 1; i >= 0; i--) {
      const fill = fills[i] as Record<string, unknown>;
      const coin = String(fill.coin ?? "").toUpperCase();
      const closedPnl = parseFloat(String(fill.closedPnl ?? "0"));
      if (coin === hlCoin && closedPnl !== 0) {
        const px = parseFloat(String(fill.px ?? "0"));
        if (px > 0) {
          return { exitPriceUsd: px, closedPnlUsd: closedPnl };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
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
  const orderSize = formatSize(normalizedSize, args.market.szDecimals);

  const priceMultiplier = args.side === "buy" ? 1 + args.slippageBps / 10_000 : 1 - args.slippageBps / 10_000;
  const limitPrice = args.market.priceUsd * priceMultiplier;
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    throw new Error("Invalid limit price for Hyperliquid order");
  }
  const orderPrice = formatPrice(limitPrice, args.market.szDecimals, "perp");

  const submitOrder = async (): Promise<ParsedStatus> => {
    const response = await clients.exchangeClient.order({
      orders: [
        {
          a: args.market.marketId,
          b: args.side === "buy",
          p: orderPrice,
          s: orderSize,
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
    return parseFirstOrderStatus(response);
  };

  let parsed: ParsedStatus;
  try {
    parsed = await submitOrder();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const canRetryWithMarginTopUp =
      !reduceOnly &&
      /insufficient margin/i.test(message) &&
      (args.notionalUsd ?? 0) > 0;

    if (!canRetryWithMarginTopUp) {
      throw error;
    }

    const walletAddress = privateKeyToAccount(args.config.privateKey).address as Address;
    const accountAddress = resolveHyperliquidAccountAddress(args.config, walletAddress);
    const spotUsdcBalance = await fetchSpotUsdcBalance(args.config, accountAddress);
    if (!spotUsdcBalance || spotUsdcBalance <= 0) {
      throw error;
    }

    const desiredTopUpUsd = Math.max((args.notionalUsd ?? 0) * 1.05, 10.5);
    const transferAmountUsd = Math.min(spotUsdcBalance, desiredTopUpUsd);
    if (!Number.isFinite(transferAmountUsd) || transferAmountUsd <= 0) {
      throw error;
    }

    await clients.exchangeClient.usdClassTransfer({
      amount: formatDecimal(transferAmountUsd, 6),
      toPerp: true,
    });
    parsed = await submitOrder();
  }

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

// ── Candle Data ──────────────────────────────────────────────────────────────

export type CandleInterval =
  | "1m" | "3m" | "5m" | "15m" | "30m"
  | "1h" | "2h" | "4h" | "8h" | "12h"
  | "1d" | "3d" | "1w" | "1M";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchCandles(
  config: TraderExecutionConfig,
  coin: string,
  interval: CandleInterval = "15m",
  count = 200,
): Promise<Candle[]> {
  const apiUrl = config.hyperliquid.apiUrl;
  const endTime = Date.now();

  const res = await fetch(`${apiUrl}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: {
        coin: coin.toUpperCase(),
        interval,
        startTime: endTime - intervalToMs(interval) * count,
        endTime,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Hyperliquid candle API ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((c: Record<string, unknown>) => ({
    timestamp: Number(c.t),
    open: parseFloat(c.o as string),
    high: parseFloat(c.h as string),
    low: parseFloat(c.l as string),
    close: parseFloat(c.c as string),
    volume: parseFloat(c.v as string),
  }));
}

function intervalToMs(interval: CandleInterval): number {
  const map: Record<CandleInterval, number> = {
    "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
    "1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "8h": 28_800_000, "12h": 43_200_000,
    "1d": 86_400_000, "3d": 259_200_000, "1w": 604_800_000, "1M": 2_592_000_000,
  };
  return map[interval] ?? 900_000;
}
