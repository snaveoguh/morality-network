// ABIs are a direct copy from extension/src/shared/contracts.ts.
// Addresses are the Base MAINNET deploys, copied from web/src/lib/contracts.ts
// (the web app's defaults, verified onchain 2026-07-16) on 2026-08-12.
// Chain id 8453 — always pin the chain: the same deployer+nonce holds
// DIFFERENT contracts at the same address on Base Sepolia.
import { type Address } from 'viem';

export const CONTRACTS = {
  registry:    '0x2ea7502C4db5B8cfB329d8a9866EB6705b036608' as Address,
  ratings:     '0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405' as Address,
  comments:    '0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b' as Address,
  tipping:     '0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B' as Address,
  leaderboard: '0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6' as Address,
} as const;

// MO token on Base mainnet — same source (web/src/lib/contracts.ts MO_TOKEN).
export const MO_TOKEN = {
  address: '0x8729c70061739140ee6bE00A3875Cbf6d09A746C' as Address,
  symbol: 'MO',
  name: 'mo',
  decimals: 18,
} as const;

export const REGISTRY_ABI = [
  { type: 'function', name: 'registerEntity', inputs: [{ name: 'identifier', type: 'string' }, { name: 'entityType', type: 'uint8' }], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setCanonicalClaim', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'claimText', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getEntity', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'entityHash', type: 'bytes32' }, { name: 'entityType', type: 'uint8' }, { name: 'identifier', type: 'string' }, { name: 'registeredBy', type: 'address' }, { name: 'claimedOwner', type: 'address' }, { name: 'createdAt', type: 'uint256' }, { name: 'exists', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getCanonicalClaim', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'claimHash', type: 'bytes32' }, { name: 'text', type: 'string' }, { name: 'setBy', type: 'address' }, { name: 'createdAt', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' }, { name: 'version', type: 'uint64' }, { name: 'exists', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'computeHash', inputs: [{ name: 'identifier', type: 'string' }], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'pure' },
] as const;

export const RATINGS_ABI = [
  { type: 'function', name: 'rate', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'score', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'rateWithReason', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'score', type: 'uint8' }, { name: 'reason', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'rateInterpretation', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'truth', type: 'uint8' }, { name: 'importance', type: 'uint8' }, { name: 'moralImpact', type: 'uint8' }, { name: 'reason', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getAverageRating', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: 'avg', type: 'uint256' }, { name: 'count', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserRating', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'user', type: 'address' }], outputs: [{ name: 'score', type: 'uint8' }, { name: 'timestamp', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getRatingReason', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'user', type: 'address' }], outputs: [{ name: 'reason', type: 'string' }, { name: 'timestamp', type: 'uint256' }, { name: 'exists', type: 'bool' }], stateMutability: 'view' },
] as const;

export const COMMENTS_ABI = [
  { type: 'function', name: 'comment', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'content', type: 'string' }, { name: 'parentId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'vote', inputs: [{ name: 'commentId', type: 'uint256' }, { name: 'v', type: 'int8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getComment', inputs: [{ name: 'commentId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'entityHash', type: 'bytes32' }, { name: 'author', type: 'address' }, { name: 'content', type: 'string' }, { name: 'parentId', type: 'uint256' }, { name: 'score', type: 'int256' }, { name: 'tipTotal', type: 'uint256' }, { name: 'timestamp', type: 'uint256' }, { name: 'exists', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getEntityComments', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view' },
  { type: 'function', name: 'getEntityCommentCount', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const;

export const TIPPING_ABI = [
  { type: 'function', name: 'tipEntity', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'tipComment', inputs: [{ name: 'commentId', type: 'uint256' }], outputs: [], stateMutability: 'payable' },
  { type: 'function', name: 'withdraw', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'entityTipTotals', inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balances', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const;

export const LEADERBOARD_ABI = [
  { type: 'function', name: 'getCompositeScore', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const;
