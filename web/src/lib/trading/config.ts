import { parseGwei, type Address } from "viem";
import type { TraderExecutionConfig } from "./types";

const WETH_BASE = "0x4200000000000000000000000000000000000006";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const UNISWAP_V3_ROUTER_BASE = "0x2626664c2603336E57B271c5C0b26F421741e481";
const AERODROME_ROUTER_BASE = "0x0000000000000000000000000000000000000000";
const AERODROME_FACTORY_BASE = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

function asAddress(value: string, fallback: string): Address {
  const raw = value || fallback;
  return raw as Address;
}

function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return fallback;
}

function stringFromEnv(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

function privateKeyFromEnv(): `0x${string}` {
  const raw = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
  const trimmed = raw.trim();
  if (!trimmed && boolFromEnv("TRADER_DRY_RUN", true)) {
    // Deterministic dev key for dry-run mode only.
    return "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  }
  if (!trimmed.startsWith("0x") || trimmed.length !== 66) {
    throw new Error("Missing or invalid AGENT_PRIVATE_KEY (expected 0x-prefixed 32-byte key)");
  }
  return trimmed as `0x${string}`;
}

function entryBudget(symbol: string, fallback: string, decimals: number): bigint {
  const key = `TRADER_ENTRY_${symbol.toUpperCase()}`;
  const raw = stringFromEnv(key, fallback);
  const [whole, fractional = ""] = raw.split(".");
  const normalizedFraction = fractional.padEnd(decimals, "0").slice(0, decimals);
  const units = `${whole}${normalizedFraction}`.replace(/^0+$/, "0");
  if (!/^\d+$/.test(units)) {
    throw new Error(`Invalid ${key} amount: ${raw}`);
  }
  return BigInt(units);
}

export function getTraderConfig(): TraderExecutionConfig {
  const rpcUrl = stringFromEnv("BASE_MAINNET_RPC_URL", "https://mainnet.base.org");
  const scannerApiUrl = stringFromEnv(
    "TRADER_SCANNER_API_URL",
    "https://pooter.world/api/agents/scanner?limit=50&minScore=50"
  );

  const quoteTokens: Record<string, Address> = {
    WETH: asAddress(process.env.TRADER_WETH_ADDRESS || "", WETH_BASE),
    USDC: asAddress(process.env.TRADER_USDC_ADDRESS || "", USDC_BASE),
  };

  const quoteTokenDecimals: Record<string, number> = {
    WETH: numberFromEnv("TRADER_WETH_DECIMALS", 18),
    USDC: numberFromEnv("TRADER_USDC_DECIMALS", 6),
  };

  const entryBudgetRaw: Record<string, bigint> = {
    WETH: entryBudget("WETH", "0.005", quoteTokenDecimals.WETH),
    USDC: entryBudget("USDC", "25", quoteTokenDecimals.USDC),
  };

  return {
    dryRun: boolFromEnv("TRADER_DRY_RUN", true),
    rpcUrl,
    privateKey: privateKeyFromEnv(),
    scannerApiUrl,
    scannerRequestTimeoutMs: numberFromEnv("TRADER_SCANNER_TIMEOUT_MS", 10_000),
    pollWindowSeconds: numberFromEnv("TRADER_POLL_WINDOW_SECONDS", 90),
    positionStorePath: stringFromEnv("TRADER_POSITION_STORE_PATH", "/tmp/pooter-trader-positions.json"),
    gasMultiplierBps: numberFromEnv("TRADER_GAS_MULTIPLIER_BPS", 12_000),
    maxPriorityFeePerGas: parseGwei(stringFromEnv("TRADER_MAX_PRIORITY_FEE_GWEI", "0.02")),
    uniswapV3Router: asAddress(process.env.UNISWAP_V3_ROUTER_ADDRESS || "", UNISWAP_V3_ROUTER_BASE),
    uniswapV3PoolFee: numberFromEnv("TRADER_UNISWAP_POOL_FEE", 3000),
    aerodromeRouter: asAddress(process.env.AERODROME_ROUTER_ADDRESS || "", AERODROME_ROUTER_BASE),
    aerodromeFactory: asAddress(process.env.AERODROME_FACTORY_ADDRESS || "", AERODROME_FACTORY_BASE),
    quoteTokens,
    quoteTokenDecimals,
    entryBudgetRaw,
    risk: {
      minScore: numberFromEnv("TRADER_MIN_SCORE", 50),
      maxOpenPositions: numberFromEnv("TRADER_MAX_OPEN_POSITIONS", 8),
      maxNewEntriesPerCycle: numberFromEnv("TRADER_MAX_NEW_ENTRIES_PER_CYCLE", 2),
      maxPositionUsd: numberFromEnv("TRADER_MAX_POSITION_USD", 150),
      maxPortfolioUsd: numberFromEnv("TRADER_MAX_PORTFOLIO_USD", 600),
      stopLossPct: numberFromEnv("TRADER_STOP_LOSS_PCT", 0.2),
      takeProfitPct: numberFromEnv("TRADER_TAKE_PROFIT_PCT", 0.45),
      slippageBps: numberFromEnv("TRADER_SLIPPAGE_BPS", 250),
    },
    safety: {
      minScannerCandidatesLive: numberFromEnv("TRADER_MIN_SCANNER_CANDIDATES_LIVE", 2),
      minBaseEthForGas: numberFromEnv("TRADER_MIN_BASE_ETH_FOR_GAS", 0.002),
    },
  };
}
