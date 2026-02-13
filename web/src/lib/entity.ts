import { keccak256, toBytes } from "viem";
import { EntityType } from "./contracts";

export function computeEntityHash(identifier: string): `0x${string}` {
  return keccak256(toBytes(identifier));
}

export function detectEntityType(identifier: string): EntityType {
  // Ethereum address: 0x followed by 40 hex chars
  if (/^0x[a-fA-F0-9]{40}$/.test(identifier)) {
    // Heuristic: could be a contract or an EOA
    // Default to ADDRESS, caller can override for known contracts
    return EntityType.ADDRESS;
  }

  // URL: starts with http(s)://
  if (/^https?:\/\//.test(identifier)) {
    return EntityType.URL;
  }

  // Domain: basic domain pattern (no protocol, has dots)
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/.test(identifier)) {
    return EntityType.DOMAIN;
  }

  // Fallback to URL
  return EntityType.URL;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function entityTypeLabel(entityType: EntityType): string {
  switch (entityType) {
    case EntityType.URL:
      return "URL";
    case EntityType.DOMAIN:
      return "Domain";
    case EntityType.ADDRESS:
      return "Address";
    case EntityType.CONTRACT:
      return "Contract";
    default:
      return "Unknown";
  }
}

export function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return "0 ETH";
  if (eth < 0.001) return "<0.001 ETH";
  if (eth < 1) return `${eth.toFixed(4)} ETH`;
  return `${eth.toFixed(3)} ETH`;
}

export function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}
