/**
 * pooter1 configuration — all env vars and constants.
 */

// ── Agent Identity ──────────────────────────────────────────────────
export const AGENT_NAME = "pooter1";
export const AGENT_DISPLAY_NAME = "pooter1";

// ── LLM — Groq via Agent Hub (free) ────────────────────────────────
export const AGENT_HUB_URL = process.env.AGENT_HUB_URL
  || "https://heartfelt-flow-production-d872.up.railway.app";
export const AGENT_HUB_SECRET = process.env.AGENT_HUB_SECRET || "";

// ── Wallet ──────────────────────────────────────────────────────────
export const POOTER1_PRIVATE_KEY = process.env.POOTER1_PRIVATE_KEY || "";
export const SOLANA_FEE_PAYER_URL = process.env.SOLANA_FEE_PAYER_URL
  || "https://pooter.world/api/solana/relay";

// ── Pooter API ──────────────────────────────────────────────────────
export const POOTER_API_URL = process.env.POOTER_API_URL
  || "https://pooter.world";
export const CRON_SECRET = process.env.CRON_SECRET || "";

// ── Redis (voice profile + memory) ──────────────────────────────────
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || "";
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

// ── Contracts ───────────────────────────────────────────────────────
export const BASE_RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
export const REGISTRY_ADDRESS = (process.env.REGISTRY_ADDRESS || "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608") as `0x${string}`;
export const RATINGS_ADDRESS = (process.env.RATINGS_ADDRESS || "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405") as `0x${string}`;
export const COMMENTS_ADDRESS = (process.env.COMMENTS_ADDRESS || "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b") as `0x${string}`;

// ── Voice Profile Defaults ──────────────────────────────────────────
export const DEFAULT_VOICE_PROFILE = {
  tone: "deadpan, slightly sardonic, newspaper editorial voice",
  style: "short punchy sentences. no exclamation marks. dry wit. references to historical parallels.",
  avoid: "clickbait, sensationalism, corporate speak, buzzwords, emojis",
  influences: "Hunter S. Thompson, George Orwell, I.F. Stone, Matt Taibbi",
  signature: "ends editorials with a one-line observation that reframes the entire piece",
  updatedAt: new Date().toISOString(),
  version: 1,
  topPerformers: [] as string[],
};

// ── Rate Limits ─────────────────────────────────────────────────────
export const MAX_COMMENTS_PER_DAY = 20;
export const MAX_RATINGS_PER_DAY = 50;
export const MAX_EDITORIALS_PER_DAY = 3;
