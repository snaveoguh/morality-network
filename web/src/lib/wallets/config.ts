// Per-agent Base Smart Wallets — environment configuration.
//
// Required env vars (set in Railway for prod, .env.local for dev):
//   BASE_SMART_WALLETS_ENABLED   "true" to enable the feature; default false
//   AGENT_WALLETS_MASTER_SEED    64 hex chars; HKDF root for all agent owner EOAs
//   PIMLICO_API_KEY              bundler + paymaster on Base
//   BASE_MAINNET_RPC_URL         (already used elsewhere) Base RPC
//
// The master seed is the single point of compromise for the entire agent fleet.
// Generate with: openssl rand -hex 32 > ~/.pooter-agent-seed.txt && chmod 600 ~/.pooter-agent-seed.txt
// NEVER commit it. NEVER log it. NEVER pass it on a command line.

import { base } from "viem/chains";

export function smartWalletsEnabled(): boolean {
  return process.env.BASE_SMART_WALLETS_ENABLED === "true";
}

export function requireMasterSeedHex(): string {
  const raw = process.env.AGENT_WALLETS_MASTER_SEED;
  if (!raw) {
    throw new Error("AGENT_WALLETS_MASTER_SEED not set");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("AGENT_WALLETS_MASTER_SEED must be exactly 64 hex chars");
  }
  return raw.toLowerCase();
}

export function pimlicoUrl(chainId: number = base.id): string {
  const key = process.env.PIMLICO_API_KEY;
  if (!key) {
    throw new Error("PIMLICO_API_KEY not set");
  }
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${key}`;
}

export function baseRpcUrl(): string {
  return process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org";
}
