function stringFromEnv(key: string, fallback: string): string {
  const raw = process.env[key];
  return raw && raw.trim().length > 0 ? raw.trim() : fallback;
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
  const n = raw.trim().toLowerCase();
  if (n === "1" || n === "true" || n === "yes") return true;
  if (n === "0" || n === "false" || n === "no") return false;
  return fallback;
}

export interface PolypooterConfig {
  port: number;
  cronSecret: string;
  polymarketApiUrl: string;
  polymarketWsUrl: string;
  polymarketGammaApiUrl: string;
  agentHubUrl: string;
  redisUrl: string;
  redisToken: string;
  dryRun: boolean;
  scanIntervalMs: number;
  /** Minimum spread (YES+NO discount) after fees to flag as arb opportunity */
  minArbSpreadPct: number;
  /** Minimum liquidity in USD to consider a market */
  minLiquidityUsd: number;
  /** Maximum number of opportunities to store */
  maxStoredOpportunities: number;
}

export function getConfig(): PolypooterConfig {
  return {
    port: numberFromEnv("PORT", 3002),
    cronSecret: stringFromEnv("CRON_SECRET", ""),
    polymarketApiUrl: stringFromEnv("POLYMARKET_API_URL", "https://clob.polymarket.com"),
    polymarketWsUrl: stringFromEnv("POLYMARKET_WS_URL", "wss://ws-subscriptions-clob.polymarket.com/ws/market"),
    polymarketGammaApiUrl: stringFromEnv("POLYMARKET_GAMMA_API_URL", "https://gamma-api.polymarket.com"),
    agentHubUrl: stringFromEnv("AGENT_HUB_URL", "https://heartfelt-flow-production-d872.up.railway.app"),
    redisUrl: stringFromEnv("UPSTASH_REDIS_REST_URL", ""),
    redisToken: stringFromEnv("UPSTASH_REDIS_REST_TOKEN", ""),
    dryRun: boolFromEnv("POLYPOOTER_DRY_RUN", true),
    scanIntervalMs: numberFromEnv("POLYPOOTER_SCAN_INTERVAL_MS", 300_000), // 5 min
    minArbSpreadPct: numberFromEnv("POLYPOOTER_MIN_ARB_SPREAD_PCT", 0.02), // 2% min spread
    minLiquidityUsd: numberFromEnv("POLYPOOTER_MIN_LIQUIDITY_USD", 1000),
    maxStoredOpportunities: numberFromEnv("POLYPOOTER_MAX_STORED_OPPORTUNITIES", 100),
  };
}
