/**
 * pooter.world API client — identity contract v1.
 *
 * The server side is being built in parallel; every call here is feature-
 * flagged by behaviour: a 404 (endpoint not shipped yet) degrades gracefully
 * to `null` / 'unavailable' so the UI can hide cards or show "coming soon"
 * instead of erroring.
 *
 * Contract shapes assumed (v1):
 *   POST /api/auth/token   {method:"siwe", message, signature}
 *                          -> {token:"pat_...", expiresAt}
 *   GET  /api/review/open-rounds                (public)
 *                          -> {rounds:[{id, claimText, ...}]}
 *   POST /api/review/vote  Bearer pat_...       {roundId, verdict}
 *   GET  /api/account/me   Bearer pat_...       -> {points, ...}
 */
import * as SecureStore from 'expo-secure-store';
import { getEvmAccount, getEvmAddress, isLocked } from './wallet';
import { getChainId } from './evm-client';

export const API_BASE = 'https://pooter.world';

const STORE_TOKEN = 'pw_api_token'; // JSON {token, expiresAt}

// ── Auth (SIWE → bearer token) ───────────────────────────────────────

interface StoredToken {
  token: string;
  expiresAt: string;
}

function randomNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** EIP-4361 (SIWE) message for the local wallet. */
function buildSiweMessage(address: string): string {
  const domain = 'pooter.world';
  const uri = `https://${domain}`;
  const issuedAt = new Date().toISOString();
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to pooter world',
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Chain ID: ${getChainId()}`,
    `Nonce: ${randomNonce()}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

export async function getStoredToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(STORE_TOKEN);
  if (!raw) return null;
  try {
    const parsed: StoredToken = JSON.parse(raw);
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now() + 60_000) {
      return null; // expired or about to
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_TOKEN);
}

export type SignInResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'locked' | 'unavailable' | 'error' };

/**
 * SIWE sign-in with the local wallet. Requires the wallet to be unlocked
 * (signing needs the key in memory). Returns 'unavailable' when the endpoint
 * has not shipped yet.
 */
export async function signIn(): Promise<SignInResult> {
  const cached = await getStoredToken();
  if (cached) return { ok: true, token: cached };

  if (isLocked() || !getEvmAddress()) return { ok: false, reason: 'locked' };

  try {
    const account = getEvmAccount();
    const message = buildSiweMessage(account.address);
    const signature = await account.signMessage({ message });

    const res = await fetch(`${API_BASE}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'siwe', message, signature }),
    });
    if (res.status === 404 || res.status === 405) return { ok: false, reason: 'unavailable' };
    if (!res.ok) return { ok: false, reason: 'error' };

    const data = await res.json();
    if (!data?.token) return { ok: false, reason: 'error' };
    const stored: StoredToken = { token: data.token, expiresAt: data.expiresAt ?? '' };
    await SecureStore.setItemAsync(STORE_TOKEN, JSON.stringify(stored));
    return { ok: true, token: data.token };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

// ── Daily Witness (review rounds) ────────────────────────────────────

export interface OpenRound {
  id: string | number;
  claimText: string;
  entity?: string;
  source?: string;
  closesAt?: string;
}

/**
 * Today's open review rounds. Returns null when the endpoint doesn't exist
 * yet (feature-flag off → hide the card), [] when it exists but is empty.
 */
export async function getOpenRounds(): Promise<OpenRound[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/review/open-rounds`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = await res.json();
    const rounds = Array.isArray(data) ? data : data?.rounds;
    if (!Array.isArray(rounds)) return null;
    return rounds
      .map((r: any) => ({
        id: r.id,
        claimText: r.claimText ?? r.claim_text ?? r.claim ?? '',
        entity: r.entity ?? r.entityName ?? undefined,
        source: r.source ?? undefined,
        closesAt: r.closesAt ?? r.closes_at ?? undefined,
      }))
      .filter((r: OpenRound) => r.id != null && r.claimText);
  } catch {
    return null;
  }
}

export type Verdict = 'support' | 'dispute' | 'cant_verify';

export type VoteResult = 'ok' | 'coming_soon' | 'locked' | 'error';

export async function submitVote(roundId: string | number, verdict: Verdict): Promise<VoteResult> {
  const auth = await signIn();
  if (!auth.ok) {
    if (auth.reason === 'locked') return 'locked';
    if (auth.reason === 'unavailable') return 'coming_soon';
    return 'error';
  }
  try {
    const res = await fetch(`${API_BASE}/api/review/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ roundId, verdict }),
    });
    if (res.status === 404 || res.status === 405) return 'coming_soon';
    if (res.status === 401) {
      await clearAuthToken(); // token no longer honoured — re-auth next time
      return 'error';
    }
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

// ── Account / points ─────────────────────────────────────────────────

export interface AccountMe {
  points: number | null;
}

/** Points balance from /api/account/me. Null = unavailable (hide/placeholder). */
export async function getAccountMe(): Promise<AccountMe | null> {
  const token = await getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/account/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const points = typeof data?.points === 'number' ? data.points : null;
    return { points };
  } catch {
    return null;
  }
}
