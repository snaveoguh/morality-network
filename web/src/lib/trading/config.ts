import { isAddress, parseGwei, type Address } from "viem";
import type { ExecutionVenue, TraderExecutionConfig } from "./types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const WETH_BASE = "0x4200000000000000000000000000000000000006";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const UNISWAP_V3_ROUTER_BASE = "0x2626664c2603336E57B271c5C0b26F421741e481";
const AERODROME_ROUTER_BASE = "0x0000000000000000000000000000000000000000";
const AERODROME_FACTORY_BASE = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const WETH_ETHEREUM = "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2";
const USDC_ETHEREUM = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const UNISWAP_V3_ROUTER_ETHEREUM = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";

function defaultRpcForVenue(venue: ExecutionVenue): string {
  if (venue === "ethereum-spot") {
    return stringFromEnv(
      "TRADER_ETHEREUM_RPC_URL",
      stringFromEnv("ETHEREUM_RPC_URL", "https://mainnet.rpc.buidlguidl.com")
    );
  }
  return stringFromEnv("BASE_MAINNET_RPC_URL", "https://mainnet.base.org");
}

function defaultSpotAddresses(venue: ExecutionVenue): { weth: string; usdc: string; uniswapRouter: string } {
  if (venue === "ethereum-spot") {
    return {
      weth: WETH_ETHEREUM,
      usdc: USDC_ETHEREUM,
      uniswapRouter: UNISWAP_V3_ROUTER_ETHEREUM,
    };
  }

  return {
    weth: WETH_BASE,
    usdc: USDC_BASE,
    uniswapRouter: UNISWAP_V3_ROUTER_BASE,
  };
}

function asAddress(value: string, fallback: string): Address {
  const candidate = (value || "").trim();
  if (candidate && isAddress(candidate)) {
    return candidate as Address;
  }

  const fallbackTrimmed = fallback.trim();
  if (!isAddress(fallbackTrimmed)) {
    throw new Error(`Invalid fallback address configured: ${fallback}`);
  }
  return fallbackTrimmed as Address;
}

function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function basisPointsFromEnv(key: string, fallback: number): number {
  const parsed = Math.floor(numberFromEnv(key, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 10_000) return 10_000;
  return parsed;
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

function optionalAddressFromEnv(key: string): Address | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return isAddress(trimmed) ? (trimmed as Address) : undefined;
}

function executionVenueFromEnv(): ExecutionVenue {
  const raw = stringFromEnv("TRADER_EXECUTION_VENUE", "base-spot").toLowerCase();
  if (raw === "base-spot" || raw === "ethereum-spot" || raw === "hyperliquid-perp") {
    return raw;
  }
  return "base-spot";
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

function parseAmountToRaw(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Amount cannot be empty");
  const [whole, fractional = ""] = trimmed.split(".");
  const normalizedFraction = fractional.padEnd(decimals, "0").slice(0, decimals);
  const units = `${whole}${normalizedFraction}`.replace(/^0+$/, "0");
  if (!/^\d+$/.test(units)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return BigInt(units);
}

export function getTraderConfig(): TraderExecutionConfig {
  const executionVenue = executionVenueFromEnv();
  const rpcUrl = defaultRpcForVenue(executionVenue);
  const scannerApiUrl = stringFromEnv(
    "TRADER_SCANNER_API_URL",
    "https://pooter.world/api/agents/scanner?limit=50&minScore=50"
  );
  const spotDefaults = defaultSpotAddresses(executionVenue);
  const isEthereum = executionVenue === "ethereum-spot";

  const quoteTokens: Record<string, Address> = {
    WETH: asAddress(
      (isEthereum ? process.env.TRADER_ETHEREUM_WETH_ADDRESS : undefined) ||
        process.env.TRADER_WETH_ADDRESS ||
        "",
      spotDefaults.weth
    ),
    USDC: asAddress(
      (isEthereum ? process.env.TRADER_ETHEREUM_USDC_ADDRESS : undefined) ||
        process.env.TRADER_USDC_ADDRESS ||
        "",
      spotDefaults.usdc
    ),
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
    executionVenue,
    dryRun: boolFromEnv("TRADER_DRY_RUN", true),
    performanceFeeBps: basisPointsFromEnv("TRADER_PERFORMANCE_FEE_BPS", 500),
    rpcUrl,
    privateKey: privateKeyFromEnv(),
    scannerApiUrl,
    scannerRequestTimeoutMs: numberFromEnv("TRADER_SCANNER_TIMEOUT_MS", 10_000),
    pollWindowSeconds: numberFromEnv("TRADER_POLL_WINDOW_SECONDS", 90),
    positionStorePath: stringFromEnv("TRADER_POSITION_STORE_PATH", "/tmp/pooter-trader-positions.json"),
    gasMultiplierBps: numberFromEnv("TRADER_GAS_MULTIPLIER_BPS", 12_000),
    maxPriorityFeePerGas: parseGwei(stringFromEnv("TRADER_MAX_PRIORITY_FEE_GWEI", "0.02")),
    uniswapV3Router: asAddress(
      (isEthereum ? process.env.TRADER_ETHEREUM_UNISWAP_V3_ROUTER_ADDRESS : undefined) ||
        process.env.UNISWAP_V3_ROUTER_ADDRESS ||
        "",
      spotDefaults.uniswapRouter
    ),
    uniswapV3PoolFee: numberFromEnv("TRADER_UNISWAP_POOL_FEE", 3000),
    aerodromeRouter: asAddress(
      process.env.AERODROME_ROUTER_ADDRESS || "",
      executionVenue === "base-spot" ? AERODROME_ROUTER_BASE : ZERO_ADDRESS
    ),
    aerodromeFactory: asAddress(
      process.env.AERODROME_FACTORY_ADDRESS || "",
      executionVenue === "base-spot" ? AERODROME_FACTORY_BASE : ZERO_ADDRESS
    ),
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
    hyperliquid: {
      apiUrl: stringFromEnv("HYPERLIQUID_API_URL", "https://api.hyperliquid.xyz"),
      isTestnet: boolFromEnv("HYPERLIQUID_IS_TESTNET", false),
      accountAddress: optionalAddressFromEnv("HYPERLIQUID_ACCOUNT_ADDRESS"),
      defaultMarket: stringFromEnv("HYPERLIQUID_DEFAULT_MARKET", "BTC").toUpperCase(),
      defaultLeverage: numberFromEnv("HYPERLIQUID_DEFAULT_LEVERAGE", 2),
      entryNotionalUsd: numberFromEnv("HYPERLIQUID_ENTRY_USD", 50),
      minAccountValueUsd: numberFromEnv("HYPERLIQUID_MIN_ACCOUNT_VALUE_USD", 100),
    },
  };
}

export function getParallelBaseConfig(): TraderExecutionConfig | null {
  if (!boolFromEnv("TRADER_BASE_PARALLEL_ENABLED", false)) {
    return null;
  }

  const primary = getTraderConfig();
  const baseDefaults = defaultSpotAddresses("base-spot");
  const quoteTokenDecimals = {
    WETH: numberFromEnv("TRADER_BASE_PARALLEL_WETH_DECIMALS", 18),
    USDC: numberFromEnv("TRADER_BASE_PARALLEL_USDC_DECIMALS", 6),
  };

  const next: TraderExecutionConfig = {
    ...primary,
    executionVenue: "base-spot",
    dryRun: boolFromEnv("TRADER_BASE_PARALLEL_DRY_RUN", true),
    rpcUrl: stringFromEnv(
      "TRADER_BASE_PARALLEL_RPC_URL",
      stringFromEnv("BASE_MAINNET_RPC_URL", "https://mainnet.base.org")
    ),
    scannerApiUrl: stringFromEnv(
      "TRADER_BASE_PARALLEL_SCANNER_API_URL",
      primary.scannerApiUrl
    ),
    positionStorePath: stringFromEnv(
      "TRADER_BASE_PARALLEL_POSITION_STORE_PATH",
      "/tmp/pooter-trader-positions-base.json"
    ),
    quoteTokens: {
      WETH: asAddress(
        process.env.TRADER_BASE_PARALLEL_WETH_ADDRESS || process.env.TRADER_WETH_ADDRESS || "",
        baseDefaults.weth
      ),
      USDC: asAddress(
        process.env.TRADER_BASE_PARALLEL_USDC_ADDRESS || process.env.TRADER_USDC_ADDRESS || "",
        baseDefaults.usdc
      ),
    },
    quoteTokenDecimals,
    uniswapV3Router: asAddress(
      process.env.TRADER_BASE_PARALLEL_UNISWAP_V3_ROUTER_ADDRESS ||
        process.env.UNISWAP_V3_ROUTER_ADDRESS ||
        "",
      baseDefaults.uniswapRouter
    ),
    aerodromeRouter: asAddress(
      process.env.TRADER_BASE_PARALLEL_AERODROME_ROUTER_ADDRESS ||
        process.env.AERODROME_ROUTER_ADDRESS ||
        "",
      AERODROME_ROUTER_BASE
    ),
    aerodromeFactory: asAddress(
      process.env.TRADER_BASE_PARALLEL_AERODROME_FACTORY_ADDRESS ||
        process.env.AERODROME_FACTORY_ADDRESS ||
        "",
      AERODROME_FACTORY_BASE
    ),
    entryBudgetRaw: {
      WETH: parseAmountToRaw(
        stringFromEnv("TRADER_BASE_PARALLEL_ENTRY_WETH", "0.005"),
        quoteTokenDecimals.WETH
      ),
      USDC: parseAmountToRaw(
        stringFromEnv("TRADER_BASE_PARALLEL_ENTRY_USDC", "25"),
        quoteTokenDecimals.USDC
      ),
    },
    risk: {
      ...primary.risk,
      minScore: numberFromEnv("TRADER_BASE_PARALLEL_MIN_SCORE", primary.risk.minScore),
      maxOpenPositions: numberFromEnv(
        "TRADER_BASE_PARALLEL_MAX_OPEN_POSITIONS",
        primary.risk.maxOpenPositions
      ),
      maxNewEntriesPerCycle: numberFromEnv(
        "TRADER_BASE_PARALLEL_MAX_NEW_ENTRIES_PER_CYCLE",
        primary.risk.maxNewEntriesPerCycle
      ),
      maxPositionUsd: numberFromEnv(
        "TRADER_BASE_PARALLEL_MAX_POSITION_USD",
        primary.risk.maxPositionUsd
      ),
      maxPortfolioUsd: numberFromEnv(
        "TRADER_BASE_PARALLEL_MAX_PORTFOLIO_USD",
        primary.risk.maxPortfolioUsd
      ),
      stopLossPct: numberFromEnv(
        "TRADER_BASE_PARALLEL_STOP_LOSS_PCT",
        primary.risk.stopLossPct
      ),
      takeProfitPct: numberFromEnv(
        "TRADER_BASE_PARALLEL_TAKE_PROFIT_PCT",
        primary.risk.takeProfitPct
      ),
      slippageBps: numberFromEnv(
        "TRADER_BASE_PARALLEL_SLIPPAGE_BPS",
        primary.risk.slippageBps
      ),
    },
    safety: {
      ...primary.safety,
      minScannerCandidatesLive: numberFromEnv(
        "TRADER_BASE_PARALLEL_MIN_SCANNER_CANDIDATES_LIVE",
        primary.safety.minScannerCandidatesLive
      ),
      minBaseEthForGas: numberFromEnv(
        "TRADER_BASE_PARALLEL_MIN_BASE_ETH_FOR_GAS",
        primary.safety.minBaseEthForGas
      ),
    },
  };

  return next;
}
