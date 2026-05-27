/**
 * Worker-side client for the per-agent Base Smart Wallet signing API.
 *
 * Standalone agent processes (agents/pooter1, agents/polypooter) import this
 * to send Base transactions through their per-agent ERC-4337 Kernel smart
 * wallet without ever holding the owner key locally. All signing happens on
 * the web side; the worker only proves identity via shared-secret HMAC.
 *
 * Env vars required at runtime:
 *   AGENT_API_BASE_URL         (default: https://pooter.world) base of the web API
 *   AGENT_WORKER_HMAC_SECRET   shared secret, must match web env, ≥32 chars
 */
import { createHmac } from "node:crypto";

const REPLAY_WINDOW_SECONDS = 60;

function baseUrl(): string {
  return (process.env.AGENT_API_BASE_URL || "https://pooter.world").replace(/\/+$/, "");
}

function requireSecret(): string {
  const raw = process.env.AGENT_WORKER_HMAC_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("AGENT_WORKER_HMAC_SECRET not set (need ≥32 chars)");
  }
  return raw;
}

function bodyHash(body: string): string {
  return createHmac("sha256", "pooter:body-hash:v1").update(body).digest("hex");
}

function sign(method: string, path: string, body: string, ts: number): string {
  const message = `${ts}.${method.toUpperCase()}.${path}.${bodyHash(body)}`;
  return createHmac("sha256", requireSecret()).update(message).digest("hex");
}

export interface SendTxParams {
  agentId: string;
  to: `0x${string}`;
  data?: `0x${string}`;
  /** wei, as a decimal or 0x-hex string (avoids JSON bigint serialization issues) */
  value?: string;
}

export interface SendTxResult {
  agentId: string;
  address: `0x${string}`;
  txHash: `0x${string}`;
  chainId: number;
}

export interface WalletInfo {
  agentId: string;
  address: `0x${string}`;
  chainId: number;
}

export async function getAgentAddress(agentId: string): Promise<WalletInfo> {
  const url = `${baseUrl()}/api/v1/agents/${encodeURIComponent(agentId)}/wallet`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getAgentAddress(${agentId}) ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as WalletInfo;
}

export async function sendTx(params: SendTxParams): Promise<SendTxResult> {
  const path = `/api/v1/agents/${encodeURIComponent(params.agentId)}/tx`;
  const url = `${baseUrl()}${path}`;
  const body = JSON.stringify({
    to: params.to,
    data: params.data ?? "0x",
    value: params.value ?? "0",
  });
  const ts = Math.floor(Date.now() / 1000);
  const signature = sign("POST", path, body, ts);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-timestamp": String(ts),
      "x-agent-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(120_000), // bundler submission can be slow
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sendTx(${params.agentId}) ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as SendTxResult;
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export interface RunSkillParams {
  agentId: string;
  skill: string;
  params: Record<string, unknown>;
}

export interface RunSkillResult {
  agentId: string;
  address: `0x${string}`;
  skill: string;
  txHash: `0x${string}`;
  extraTxHashes?: `0x${string}`[];
  meta?: Record<string, unknown>;
  chainId: number;
}

export async function runSkill(args: RunSkillParams): Promise<RunSkillResult> {
  const path = `/api/v1/agents/${encodeURIComponent(args.agentId)}/skill`;
  const url = `${baseUrl()}${path}`;
  const body = JSON.stringify({ skill: args.skill, params: args.params });
  const ts = Math.floor(Date.now() / 1000);
  const signature = sign("POST", path, body, ts);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-timestamp": String(ts),
      "x-agent-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`runSkill(${args.agentId}/${args.skill}) ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as RunSkillResult;
}

export async function listAvailableSkills(): Promise<string[]> {
  // Unauthenticated GET, intended for capability discovery.
  const res = await fetch(`${baseUrl()}/api/v1/agents/_/skill`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const body = (await res.json().catch(() => null)) as { skills?: string[] } | null;
  return body?.skills ?? [];
}

// ─── Portfolio ──────────────────────────────────────────────────────────────

export interface TokenBalance {
  token: `0x${string}` | "native";
  symbol: string;
  decimals: number;
  raw: string;
  formatted: string;
}

export interface Portfolio {
  agentId: string;
  address: `0x${string}`;
  chainId: number;
  balances: TokenBalance[];
}

export async function getPortfolio(
  agentId: string,
  extraTokens: `0x${string}`[] = [],
): Promise<Portfolio> {
  const params = new URLSearchParams();
  for (const t of extraTokens) params.append("token", t);
  const qs = params.toString();
  const url = `${baseUrl()}/api/v1/agents/${encodeURIComponent(agentId)}/portfolio${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getPortfolio(${agentId}) ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as Portfolio;
}

export const __replayWindowSeconds = REPLAY_WINDOW_SECONDS;
