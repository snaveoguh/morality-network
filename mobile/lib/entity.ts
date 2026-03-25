// Direct port from extension/src/shared/entity.ts — pure functions, no DOM deps
import { keccak256, toBytes } from 'viem';

export enum EntityType {
  URL = 0,
  DOMAIN = 1,
  ADDRESS = 2,
  CONTRACT = 3,
}

export function computeEntityHash(identifier: string): `0x${string}` {
  return keccak256(toBytes(normalizeIdentifier(identifier)));
}

export function computeEntityHashCandidates(identifier: string): `0x${string}`[] {
  const trimmed = identifier.trim();
  const normalized = normalizeIdentifier(trimmed);
  const keys = [normalized];
  if (trimmed.length > 0 && trimmed !== normalized) keys.push(trimmed);
  return Array.from(new Set(keys.map((v) => keccak256(toBytes(v)))));
}

export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) return trimmed;

  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return trimmed.toLowerCase();

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      for (const key of Array.from(url.searchParams.keys())) {
        if (
          key.toLowerCase().startsWith('utm_') ||
          ['fbclid', 'gclid', 'ref', 'ref_src', 'mc_cid', 'mc_eid'].includes(key)
        ) {
          url.searchParams.delete(key);
        }
      }
      if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
      return url.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function detectEntityType(identifier: string): EntityType {
  if (/^0x[a-fA-F0-9]{40}$/.test(identifier)) return EntityType.ADDRESS;
  if (/^https?:\/\//.test(identifier)) return EntityType.URL;
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(identifier)) return EntityType.DOMAIN;
  return EntityType.URL;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatEth(wei: bigint | string): string {
  const w = typeof wei === 'string' ? BigInt(wei) : wei;
  const eth = Number(w) / 1e18;
  if (eth === 0) return '0 ETH';
  if (eth < 0.001) return '<0.001 ETH';
  if (eth < 1) return `${eth.toFixed(4)} ETH`;
  return `${eth.toFixed(3)} ETH`;
}

export function formatSol(lamports: number | bigint): string {
  const sol = Number(lamports) / 1e9;
  if (sol === 0) return '0 SOL';
  if (sol < 0.001) return '<0.001 SOL';
  if (sol < 1) return `${sol.toFixed(4)} SOL`;
  return `${sol.toFixed(3)} SOL`;
}

export function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}
