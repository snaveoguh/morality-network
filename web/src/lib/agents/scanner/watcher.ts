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
  ERC20_META_ABI,
  LOG_CHUNK_SIZE,
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
  transport: http(BASE_RPC, { timeout: 15_000 }),
});

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
  const currentBlock = await client.getBlockNumber();
  const newLaunches: TokenLaunch[] = [];

  for (const factory of FACTORIES) {
    try {
      const launches = await pollFactory(factory, currentBlock);
      newLaunches.push(...launches);
    } catch (err) {
      console.error(`[Scanner] Error polling ${factory.label}:`, err);
    }
  }

  return newLaunches;
}

async function pollFactory(
  factory: FactoryConfig,
  currentBlock: bigint
): Promise<TokenLaunch[]> {
  const factoryAddr = factory.address.toLowerCase();

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

  // Chunked getLogs (same pattern as live-comments.ts)
  const allLogs: Log[] = [];
  let cursor = fromBlock;

  while (cursor <= currentBlock) {
    const chunkEnd =
      cursor + BigInt(LOG_CHUNK_SIZE) - BigInt(1) > currentBlock
        ? currentBlock
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
  lastBlockByFactory.set(factoryAddr, currentBlock);

  // Process logs
  const launches: TokenLaunch[] = [];

  for (const log of allLogs) {
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
      `[Scanner] Found ${launches.length} new launch(es) on ${factory.label} (blocks ${fromBlock}-${currentBlock})`
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

  // Get deployer from the transaction
  let deployer = "0x0000000000000000000000000000000000000000";
  if (log.transactionHash) {
    try {
      const tx = await client.getTransaction({ hash: log.transactionHash });
      deployer = tx.from.toLowerCase();
    } catch {
      // Non-critical — just use zero address
    }
  }

  // Fetch ERC20 metadata
  const tokenMeta = await fetchTokenMeta(newToken);

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
      symbol: tokenMeta?.symbol ?? "???",
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

// ─── ERC20 Metadata ─────────────────────────────────────────────────────────

async function fetchTokenMeta(
  tokenAddress: string
): Promise<TokenMeta | null> {
  try {
    const addr = tokenAddress as `0x${string}`;

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      client
        .readContract({
          address: addr,
          abi: ERC20_META_ABI,
          functionName: "name",
        })
        .catch(() => "Unknown"),
      client
        .readContract({
          address: addr,
          abi: ERC20_META_ABI,
          functionName: "symbol",
        })
        .catch(() => "???"),
      client
        .readContract({
          address: addr,
          abi: ERC20_META_ABI,
          functionName: "decimals",
        })
        .catch(() => 18),
      client
        .readContract({
          address: addr,
          abi: ERC20_META_ABI,
          functionName: "totalSupply",
        })
        .catch(() => BigInt(0)),
    ]);

    return {
      name: name as string,
      symbol: symbol as string,
      decimals: Number(decimals),
      totalSupply: String(totalSupply),
    };
  } catch (err) {
    console.error(`[Scanner] Failed to fetch token meta for ${tokenAddress}:`, err);
    return null;
  }
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
