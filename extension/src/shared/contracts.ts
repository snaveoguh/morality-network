import { type Address } from 'viem';

// Contract addresses — update after deployment to ETH mainnet
export const CONTRACTS = {
  registry:    '0x2ea7502C4db5B8cfB329d8a9866EB6705b036608' as Address,
  ratings:     '0xb61bE51E8aEd1360EaA03Eb673F74D66eC4898D7' as Address,
  comments:    '0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405' as Address,
  tipping:     '0x622cD30124e24dFFe77c29921bD7622e30d57F8B' as Address,
  leaderboard: '0x57dc0C9833A124FE39193dC6a554e0Ff37606202' as Address,
} as const;

export const REGISTRY_ABI = [
  { type: 'function', name: 'registerEntity', inputs: [{ name: 'identifier', type: 'string' }, { name: 'entityType', type: 'uint8' }], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setCanonicalClaim', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'claimText', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getEntity', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'entityHash', type: 'bytes32' }, { name: 'entityType', type: 'uint8' }, { name: 'identifier', type: 'string' }, { name: 'registeredBy', type: 'address' }, { name: 'claimedOwner', type: 'address' }, { name: 'createdAt', type: 'uint256' }, { name: 'exists', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getCanonicalClaim', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'claimHash', type: 'bytes32' }, { name: 'text', type: 'string' }, { name: 'setBy', type: 'address' }, { name: 'createdAt', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' }, { name: 'version', type: 'uint64' }, { name: 'exists', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'computeClaimHash', inputs: [{ name: 'claimText', type: 'string' }], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'pure' },
  { type: 'function', name: 'computeHash', inputs: [{ name: 'identifier', type: 'string' }], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'pure' },
] as const;

export const RATINGS_ABI = [
  { type: 'function', name: 'rate', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'score', type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'rateWithReason', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'score', type: 'uint8' }, { name: 'reason', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'rateInterpretation', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'truth', type: 'uint8' }, { name: 'importance', type: 'uint8' }, { name: 'moralImpact', type: 'uint8' }, { name: 'reason', type: 'string' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getAverageRating', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: 'avg', type: 'uint256' }, { name: 'count', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getAverageInterpretation', inputs: [{ name: 'entityHash', type: 'bytes32' }], outputs: [{ name: 'avgTruth', type: 'uint256' }, { name: 'avgImportance', type: 'uint256' }, { name: 'avgMoralImpact', type: 'uint256' }, { name: 'count', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserRating', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'user', type: 'address' }], outputs: [{ name: 'score', type: 'uint8' }, { name: 'timestamp', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserInterpretation', inputs: [{ name: 'entityHash', type: 'bytes32' }, { name: 'user', type: 'address' }], outputs: [{ name: 'truth', type: 'uint8' }, { name: 'importance', type: 'uint8' }, { name: 'moralImpact', type: 'uint8' }, { name: 'timestamp', type: 'uint256' }, { name: 'exists', type: 'bool' }], stateMutability: 'view' },
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
