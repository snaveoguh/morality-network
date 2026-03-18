import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TraderExecutionConfig } from "../trading/types";
import { fetchScannerCandidates } from "../trading/scanner-client";

const BASE_CONFIG: TraderExecutionConfig = {
  executionVenue: "base-spot",
  dryRun: true,
  performanceFeeBps: 500,
  rpcUrl: "https://mainnet.base.org",
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  scannerApiUrl: "https://example.com/api/agents/scanner",
  scannerRequestTimeoutMs: 5_000,
  pollWindowSeconds: 90,
  positionStorePath: "/tmp/test-positions.json",
  gasMultiplierBps: 12_000,
  maxPriorityFeePerGas: BigInt(1),
  uniswapV3Router: "0x2626664c2603336E57B271c5C0b26F421741e481",
  uniswapV3PoolFee: 3000,
  aerodromeRouter: "0x0000000000000000000000000000000000000000",
  aerodromeFactory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
  quoteTokens: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  quoteTokenDecimals: {
    WETH: 18,
    USDC: 6,
  },
  entryBudgetRaw: {
    WETH: BigInt(1),
    USDC: BigInt(1),
  },
  risk: {
    minScore: 50,
    maxOpenPositions: 4,
    maxNewEntriesPerCycle: 2,
    maxPositionUsd: 100,
    maxPortfolioUsd: 300,
    stopLossPct: 0.2,
    takeProfitPct: 0.4,
    slippageBps: 250,
    maxLeverage: 40,
    minSignalConfidence: 0.55,
    trailingStopPct: 0.05,
    trailingStopActivationPct: 0.05,
    circuitBreakerLosses: 3,
    circuitBreakerPauseMs: 3_600_000,
  },
  safety: {
    minScannerCandidatesLive: 1,
    minBaseEthForGas: 0.001,
  },
  hyperliquid: {
    apiUrl: "https://api.hyperliquid.xyz",
    isTestnet: false,
    defaultMarket: "BTC",
    defaultLeverage: 2,
    entryNotionalUsd: 50,
    minAccountValueUsd: 100,
    watchMarkets: ["BTC", "ETH", "SOL"],
  },
};

describe("fetchScannerCandidates", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.INDEXER_BACKEND_URL = "https://indexer.example.com";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.INDEXER_BACKEND_URL;
  });

  it("merges durable trade-candidate events with scanner launches and dedupes by token", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("https://example.com/api/agents/scanner")) {
        return new Response(
          JSON.stringify({
            launches: [
              {
                tokenAddress: "0x0000000000000000000000000000000000000001",
                poolAddress: "0x0000000000000000000000000000000000000011",
                dex: "uniswap-v3",
                score: 61,
                tokenMeta: { symbol: "ONE" },
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.startsWith("https://indexer.example.com/api/v1/agents/events")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: "evt-1",
                from: "coordinator",
                to: "*",
                topic: "trade-candidate",
                timestamp: Date.now(),
                payload: {
                  tokenAddress: "0x0000000000000000000000000000000000000001",
                  poolAddress: "0x0000000000000000000000000000000000000011",
                  dex: "uniswap-v3",
                  score: 88,
                  tokenMeta: { symbol: "ONE" },
                },
              },
              {
                id: "evt-2",
                from: "coordinator",
                to: "*",
                topic: "trade-candidate",
                timestamp: Date.now(),
                payload: {
                  tokenAddress: "0x0000000000000000000000000000000000000002",
                  poolAddress: "0x0000000000000000000000000000000000000022",
                  dex: "aerodrome",
                  score: 77,
                  tokenMeta: { symbol: "TWO" },
                },
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const launches = await fetchScannerCandidates(BASE_CONFIG);

    expect(launches).toHaveLength(2);
    expect(launches[0]?.tokenAddress).toBe("0x0000000000000000000000000000000000000001");
    expect(launches[0]?.score).toBe(88);
    expect(launches[1]?.tokenAddress).toBe("0x0000000000000000000000000000000000000002");
  });
});
