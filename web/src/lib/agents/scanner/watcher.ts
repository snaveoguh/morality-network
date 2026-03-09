// ─── Scanner Agent — Watcher ────────────────────────────────────────────────
//
// Polls Base mainnet for PoolCreated events from Uniswap V3 and Aerodrome.
// Identifies new tokens, fetches ERC20 metadata, schedules DexScreener enrichment.
// Pattern adapted from live-comments.ts chunked getLogs.

import { createPublicClient, http, type Log } from "viem";
import { base } from "viem/chains";
import { messageBus } from "../core";
import { Store } from "../core/store";
import type { TokenLaunch, TokenMeta, DexScreenerData } from "./types";
import {
  FACTORIES,
  KNOWN_QUOTE_TOKENS,
  QUOTE_TOKEN_NAMES,
  LOG_CHUNK_SIZE,
  MAX_BLOCKS_PER_POLL,
  MAX_LOGS_PER_FACTORY_PER_POLL,
  INITIAL_LOOKBACK_BLOCKS,
  MAX_STORED_LAUNCHES,
  DEXSCREENER_DELAY_MS,
  DEXSCREENER_API,
  SCANNER_DATA_PATH,
  type FactoryConfig,
} from "./constants";

// ─── Base Mainnet Client ────────────────────────────────────────────────────

const BASE_RPC =
  process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";

const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC, { timeout: 3_000 }),
});
const DEXSCREENER_PROFILES_API = "https://api.dexscreener.com/token-profiles/latest/v1";
const RPC_BLOCK_TIMEOUT_MS = 1_500;

// ─── Launch Store ───────────────────────────────────────────────────────────

export const launchStore = new Store<TokenLaunch>({
  persistPath: SCANNER_DATA_PATH,
  maxItems: MAX_STORED_LAUNCHES,
  keyFn: (launch) => launch.poolAddress.toLowerCase(),
});

// ─── State ──────────────────────────────────────────────────────────────────

const lastBlockByFactory = new Map<string, bigint>();

export function getLastBlocks(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [addr, block] of lastBlockByFactory) {
    result[addr] = Number(block);
  }
  return result;
}

// ─── Main Poll Function ─────────────────────────────────────────────────────

export async function poll(): Promise<TokenLaunch[]> {
  const newLaunches: TokenLaunch[] = [];
  let currentBlock: bigint | null = null;

  try {
    currentBlock = await Promise.race<bigint | null>([
      client.getBlockNumber(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), RPC_BLOCK_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.warn("[Scanner] Failed to fetch Base block number, using fallback source");
    console.warn(err);
  }

  if (currentBlock !== null) {
    for (const factory of FACTORIES) {
      try {
        const launches = await pollFactory(factory, currentBlock);
        newLaunches.push(...launches);
      } catch (err) {
        console.error(`[Scanner] Error polling ${factory.label}:`, err);
      }
    }
  }

  // Serverless fallback source: if no onchain hits, seed from DexScreener profiles.
  if (newLaunches.length === 0) {
    const fallbackLaunches = await pollDexScreenerProfiles();
    newLaunches.push(...fallbackLaunches);
  }

  return newLaunches;
}

async function pollFactory(
  factory: FactoryConfig,
  currentBlock: bigint
): Promise<TokenLaunch[]> {
  const factoryAddr = factory.address.toLowerCase();
  const maxBlocksPerPoll = BigInt(Math.max(MAX_BLOCKS_PER_POLL, 1));

  // Determine scan range
  let fromBlock = lastBlockByFactory.get(factoryAddr);
  if (fromBlock === undefined) {
    fromBlock =
      currentBlock > BigInt(INITIAL_LOOKBACK_BLOCKS)
        ? currentBlock - BigInt(INITIAL_LOOKBACK_BLOCKS)
        : BigInt(0);
  } else {
    fromBlock = fromBlock + BigInt(1);
  }

  if (fromBlock > currentBlock) {
    return []; // Already caught up
  }

  // Bound scan work per request/poll to keep serverless latencies predictable.
  if (currentBlock - fromBlock + BigInt(1) > maxBlocksPerPoll) {
    fromBlock = currentBlock - maxBlocksPerPoll + BigInt(1);
  }

  const toBlock = currentBlock;

  // Chunked getLogs (same pattern as live-comments.ts)
  const allLogs: Log[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const chunkEnd =
      cursor + BigInt(LOG_CHUNK_SIZE) - BigInt(1) > toBlock
        ? toBlock
        : cursor + BigInt(LOG_CHUNK_SIZE) - BigInt(1);

    try {
      const logs = await client.getLogs({
        address: factory.address,
        event: factory.event as never,
        fromBlock: cursor,
        toBlock: chunkEnd,
      });
      allLogs.push(...logs);
    } catch (err) {
      console.error(
        `[Scanner] getLogs chunk ${cursor}-${chunkEnd} failed for ${factory.label}:`,
        err
      );
    }

    cursor = chunkEnd + BigInt(1);
  }

  // Update cursor
  lastBlockByFactory.set(factoryAddr, toBlock);

  // Process logs
  const logsToProcess =
    allLogs.length > MAX_LOGS_PER_FACTORY_PER_POLL
      ? allLogs.slice(-MAX_LOGS_PER_FACTORY_PER_POLL)
      : allLogs;
  const launches: TokenLaunch[] = [];

  for (const log of logsToProcess) {
    try {
      const launch = await processPoolCreatedLog(log, factory);
      if (launch) {
        launches.push(launch);
      }
    } catch (err) {
      console.error(`[Scanner] Error processing log:`, err);
    }
  }

  if (launches.length > 0) {
    console.log(
      `[Scanner] Found ${launches.length} new launch(es) on ${factory.label} (blocks ${fromBlock}-${toBlock})`
    );
  }

  return launches;
}

// ─── Log Processing ─────────────────────────────────────────────────────────

async function processPoolCreatedLog(
  log: Log,
  factory: FactoryConfig
): Promise<TokenLaunch | null> {
  const args = (log as { args?: Record<string, unknown> }).args;
  if (!args) return null;

  // Extract token addresses from indexed args
  const token0 = (args.token0 as string)?.toLowerCase();
  const token1 = (args.token1 as string)?.toLowerCase();
  const poolAddress = (args.pool as string)?.toLowerCase();

  if (!token0 || !token1 || !poolAddress) return null;

  // Skip if we already have this pool
  if (launchStore.has(poolAddress)) return null;

  // Identify the new token (the one NOT in known quote tokens)
  const newToken = identifyNewToken(token0, token1);
  if (!newToken) return null; // Both known or both unknown — skip

  const pairedAsset = newToken === token0 ? token1 : token0;

  // Keep discovery lightweight for serverless runtimes.
  const deployer = "0x0000000000000000000000000000000000000000";
  const tokenMeta: TokenMeta | null = null;

  const launch: TokenLaunch = {
    poolAddress,
    tokenAddress: newToken,
    pairedAsset,
    dex: factory.id,
    blockNumber: Number(log.blockNumber ?? 0),
    txHash: log.transactionHash ?? "0x",
    deployer,
    discoveredAt: Math.floor(Date.now() / 1000),
    tokenMeta,
    dexScreenerData: null,
    score: 0,
    scoreBreakdown: null,
    enriched: false,
  };

  // Persist
  launchStore.add(launch);

  // Publish to message bus
  await messageBus.publish({
    id: crypto.randomUUID(),
    from: "launch-scanner",
    to: "*",
    topic: "new-token-launch",
    payload: {
      tokenAddress: newToken,
      poolAddress,
      symbol: "???",
      dex: factory.id,
      pairedWith: QUOTE_TOKEN_NAMES[pairedAsset] ?? pairedAsset.slice(0, 10),
    },
    timestamp: Date.now(),
  });

  // Schedule DexScreener enrichment
  scheduleEnrichment(poolAddress, newToken);

  return launch;
}

// ─── Token Identification ───────────────────────────────────────────────────

function identifyNewToken(
  token0: string,
  token1: string
): string | null {
  const t0Known = KNOWN_QUOTE_TOKENS.has(token0);
  const t1Known = KNOWN_QUOTE_TOKENS.has(token1);

  if (t0Known && !t1Known) return token1; // token1 is the new one
  if (!t0Known && t1Known) return token0; // token0 is the new one
  if (!t0Known && !t1Known) return token0; // Both unknown — take token0 as "new"
  return null; // Both known (e.g. WETH/USDC pool) — not a new launch
}

// ─── DexScreener Enrichment ─────────────────────────────────────────────────

function scheduleEnrichment(poolAddress: string, tokenAddress: string): void {
  setTimeout(async () => {
    try {
      const data = await fetchDexScreenerData(poolAddress);
      if (!data) return;

      const existing = launchStore.get(poolAddress);
      if (!existing) return;

      const enriched: TokenLaunch = {
        ...existing,
        dexScreenerData: data,
        enriched: true,
      };

      launchStore.add(enriched); // Overwrites by key

      // Publish enrichment event
      await messageBus.publish({
        id: crypto.randomUUID(),
        from: "launch-scanner",
        to: "*",
        topic: "token-enriched",
        payload: {
          tokenAddress,
          poolAddress,
          symbol: existing.tokenMeta?.symbol ?? "???",
          priceUsd: data.priceUsd,
          liquidity: data.liquidity?.usd ?? 0,
          volume24h: data.volume24h ?? 0,
        },
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error(`[Scanner] DexScreener enrichment failed for ${poolAddress}:`, err);
    }
  }, DEXSCREENER_DELAY_MS);
}

async function fetchDexScreenerData(
  poolAddress: string
): Promise<DexScreenerData | null> {
  try {
    const res = await fetch(`${DEXSCREENER_API}/${poolAddress}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const pair = json?.pairs?.[0];
    if (!pair) return null;

    return {
      priceUsd: pair.priceUsd ?? null,
      priceNative: pair.priceNative ?? null,
      liquidity: pair.liquidity
        ? {
            usd: pair.liquidity.usd ?? 0,
            base: pair.liquidity.base ?? 0,
            quote: pair.liquidity.quote ?? 0,
          }
        : null,
      volume24h: pair.volume?.h24 ?? null,
      priceChange24h: pair.priceChange?.h24 ?? null,
      pairUrl: pair.url ?? null,
      fdv: pair.fdv ?? null,
      marketCap: pair.marketCap ?? null,
    };
  } catch {
    return null;
  }
}

interface DexProfile {
  chainId?: string;
  tokenAddress?: string;
  url?: string;
}

function asAddress(value: string | undefined): string | null {
  if (!value) return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : null;
}

function extractPairAddress(url: string | undefined): string | null {
  if (!url) return null;
  const parts = url.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return asAddress(last);
}

async function pollDexScreenerProfiles(): Promise<TokenLaunch[]> {
  try {
    const res = await fetch(DEXSCREENER_PROFILES_API, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as DexProfile[];
    if (!Array.isArray(json)) return [];

    const now = Math.floor(Date.now() / 1000);
    const launches: TokenLaunch[] = [];

    for (const entry of json.slice(0, 80)) {
      if (entry.chainId?.toLowerCase() !== "base") continue;
      const tokenAddress = asAddress(entry.tokenAddress);
      if (!tokenAddress) continue;

      const poolAddress = extractPairAddress(entry.url) ?? tokenAddress;
      if (launchStore.has(poolAddress)) continue;

      const launch: TokenLaunch = {
        poolAddress,
        tokenAddress,
        pairedAsset: "0x4200000000000000000000000000000000000006", // WETH
        dex: "uniswap-v3",
        blockNumber: 0,
        txHash: "0x",
        deployer: "0x0000000000000000000000000000000000000000",
        discoveredAt: now,
        tokenMeta: null,
        dexScreenerData: null,
        score: 0,
        scoreBreakdown: null,
        enriched: false,
      };

      launchStore.add(launch);
      launches.push(launch);

      if (launches.length >= 20) break;
    }

    if (launches.length > 0) {
      console.log(`[Scanner] DexScreener fallback seeded ${launches.length} launch(es)`);
    }

    return launches;
  } catch {
    return [];
  }
}
