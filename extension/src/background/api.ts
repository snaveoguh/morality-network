/**
 * pooter.world platform API client (IDENTITY CONTRACT v1).
 *
 * All HTTP to pooter.world happens here in the service worker. Every call is
 * feature-flagged by response: a 404 from an endpoint means "not live yet"
 * and degrades gracefully rather than erroring — the extension must keep
 * working even if the server side of the contract hasn't shipped.
 *
 * Contract assumed (WS1 is building the server against the same shapes):
 * - POST {base}/api/auth/token
 *     body { method: "siwe", message, signature }
 *     → 200 { token: "pat_…", expiresAt }
 * - Authenticated calls send `Authorization: Bearer pat_…`.
 * - GET {base}/api/review/open-rounds
 *     → 200 { rounds: [{ roundId|id, assignmentId?, claimText|claim|text,
 *              entity?, closesAt? }], streak?, points? }
 *       (a bare array of round objects is also accepted)
 * - POST {base}/api/review/vote
 *     body { roundId, assignmentId?, vote: "approve"|"reject"|"more_evidence" }
 *     → 200 { status: "voted", settled?, streak?, points? }
 */

import {
  API_BASES, DEFAULT_API_TARGET, STORAGE_API_TARGET, STORAGE_AUTH,
  type ApiTarget,
} from '../shared/constants';
import { getAccount } from '../shared/wallet';
import { getChain } from '../shared/rpc';
import type { AuthStatus, WitnessFeed, WitnessRound, WitnessVoteChoice } from '../shared/types';

interface StoredAuth {
  token: string;
  expiresAt: string | null;
  address: string;
  apiBase: string;
}

// ── API target (prod / dev) ────────────────────────────────────────────────

export async function getApiTarget(): Promise<ApiTarget> {
  const stored = await chrome.storage.local.get(STORAGE_API_TARGET);
  const t = stored[STORAGE_API_TARGET];
  return t === 'dev' || t === 'prod' ? t : DEFAULT_API_TARGET;
}

export async function setApiTarget(target: ApiTarget): Promise<void> {
  if (target !== 'prod' && target !== 'dev') throw new Error(`Unknown API target: ${target}`);
  await chrome.storage.local.set({ [STORAGE_API_TARGET]: target });
}

async function apiBase(): Promise<string> {
  return API_BASES[await getApiTarget()];
}

// ── token storage ──────────────────────────────────────────────────────────

async function readAuth(): Promise<StoredAuth | null> {
  const stored = await chrome.storage.local.get(STORAGE_AUTH);
  const auth = stored[STORAGE_AUTH] as StoredAuth | undefined;
  if (!auth?.token) return null;
  if (auth.expiresAt && Date.parse(auth.expiresAt) < Date.now()) {
    await chrome.storage.local.remove(STORAGE_AUTH);
    return null;
  }
  return auth;
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_AUTH);
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const auth = await readAuth();
  return {
    linked: !!auth,
    address: auth?.address ?? null,
    expiresAt: auth?.expiresAt ?? null,
    apiBase: await apiBase(),
  };
}

// ── SIWE account link ──────────────────────────────────────────────────────

export type LinkResult =
  | { ok: true; address: string; expiresAt: string | null }
  | { ok: false; error: string; code: 'locked' | 'unavailable' | 'rejected' | 'network' };

/**
 * EIP-4361 message. The server contract only fixes { method, message,
 * signature } — the message text itself is standard SIWE with a
 * client-generated nonce (no nonce endpoint is part of contract v1).
 */
function buildSiweMessage(address: string, base: string, chainId: number): string {
  const domain = base.replace(/^https?:\/\//, '');
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Link your pooter extension wallet to your pooter.world account.',
    '',
    `URI: ${base}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n');
}

export async function linkAccount(): Promise<LinkResult> {
  const account = getAccount();
  if (!account) {
    return { ok: false, error: 'Unlock your wallet first', code: 'locked' };
  }

  const base = await apiBase();
  const message = buildSiweMessage(account.address, base, getChain().id);
  const signature = await account.signMessage({ message });

  let res: Response;
  try {
    res = await fetch(`${base}/api/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'siwe', message, signature }),
    });
  } catch {
    return { ok: false, error: 'Could not reach pooter.world', code: 'network' };
  }

  if (res.status === 404 || res.status === 405) {
    // Feature flag: endpoint not shipped yet.
    return { ok: false, error: 'Account linking is coming soon', code: 'unavailable' };
  }
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: string })?.error ?? ''; } catch { /* ignore */ }
    return { ok: false, error: detail || `Link rejected (${res.status})`, code: 'rejected' };
  }

  let body: { token?: string; expiresAt?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: 'Unexpected response from pooter.world', code: 'rejected' };
  }
  if (!body.token) {
    return { ok: false, error: 'No token in response', code: 'rejected' };
  }

  const auth: StoredAuth = {
    token: body.token,
    expiresAt: body.expiresAt ?? null,
    address: account.address,
    apiBase: base,
  };
  await chrome.storage.local.set({ [STORAGE_AUTH]: auth });
  return { ok: true, address: account.address, expiresAt: auth.expiresAt };
}

// ── authed fetch helper ────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await apiBase();
  const auth = await readAuth();
  const headers = new Headers(init?.headers);
  if (auth) headers.set('authorization', `Bearer ${auth.token}`);
  return fetch(`${base}${path}`, { ...init, headers });
}

// ── Daily Witness ──────────────────────────────────────────────────────────

function normalizeRound(raw: unknown): WitnessRound | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const roundId = firstString(r.roundId, r.id, r.round_id);
  const claimText = firstString(r.claimText, r.claim_text, r.claim, r.text, r.statement);
  if (!roundId || !claimText) return null;
  return {
    roundId,
    assignmentId: firstString(r.assignmentId, r.assignment_id) ?? null,
    claimText,
    entity: firstString(r.entity, r.entityName, r.speaker) ?? null,
    closesAt: firstString(r.closesAt, r.closes_at, r.deadline) ?? null,
  };
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export async function fetchOpenRounds(): Promise<WitnessFeed> {
  const empty: WitnessFeed = {
    available: true, authRequired: false, rounds: [], streak: null, points: null, error: null,
  };

  let res: Response;
  try {
    res = await apiFetch('/api/review/open-rounds', { method: 'GET' });
  } catch {
    return { ...empty, available: false, error: 'Could not reach pooter.world' };
  }

  if (res.status === 404 || res.status === 405) {
    return { ...empty, available: false };
  }
  if (res.status === 401 || res.status === 403) {
    return { ...empty, authRequired: true };
  }
  if (!res.ok) {
    return { ...empty, error: `pooter.world returned ${res.status}` };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ...empty, error: 'Unexpected response from pooter.world' };
  }

  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as Record<string, unknown>)?.rounds)
      ? ((body as Record<string, unknown>).rounds as unknown[])
      : Array.isArray((body as Record<string, unknown>)?.assignments)
        ? ((body as Record<string, unknown>).assignments as unknown[])
        : [];

  const rounds = list
    .map(normalizeRound)
    .filter((r): r is WitnessRound => r !== null);

  const obj = (body && typeof body === 'object' && !Array.isArray(body))
    ? (body as Record<string, unknown>)
    : {};

  return {
    ...empty,
    rounds,
    streak: firstNumber(obj.streak),
    points: firstNumber(obj.points),
  };
}

export type WitnessVoteResult =
  | { ok: true; settled: boolean | null; streak: number | null; points: number | null }
  | { ok: false; error: string; authRequired?: boolean };

export async function submitWitnessVote(
  roundId: string,
  assignmentId: string | null,
  vote: WitnessVoteChoice,
): Promise<WitnessVoteResult> {
  let res: Response;
  try {
    res = await apiFetch('/api/review/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId, assignmentId: assignmentId ?? undefined, vote }),
    });
  } catch {
    return { ok: false, error: 'Could not reach pooter.world' };
  }

  if (res.status === 404 || res.status === 405) {
    return { ok: false, error: 'Voting is coming soon' };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'Link your account to vote', authRequired: true };
  }
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()) as { error?: string })?.error ?? ''; } catch { /* ignore */ }
    return { ok: false, error: detail || `Vote failed (${res.status})` };
  }

  let body: Record<string, unknown> = {};
  try { body = (await res.json()) as Record<string, unknown>; } catch { /* tolerated */ }
  return {
    ok: true,
    settled: typeof body.settled === 'boolean' ? body.settled : null,
    streak: firstNumber(body.streak),
    points: firstNumber(body.points),
  };
}
