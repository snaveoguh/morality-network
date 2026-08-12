import type { BiasRating, FactualityRating } from './bias';

// ============================================================================
// ENTITY DATA
// ============================================================================

export interface EntityData {
  entityHash: string;
  identifier: string;
  compositeScore: number;     // 0-10000
  avgRating: number;          // 0-500 (x100 for 2 decimals)
  ratingCount: number;
  commentCount: number;
  tipTotal: string;           // wei as string (bigint serialization)
  bias: BiasInfo | null;
}

export interface BiasInfo {
  name: string;
  bias: BiasRating;
  factuality: FactualityRating;
  ownership?: string;
  country?: string;
  fundingModel?: string;
}

export interface CommentData {
  id: number;
  author: string;
  content: string;
  parentId: number;
  score: number;
  tipTotal: string;
  timestamp: number;
}

export interface WalletInfo {
  address: string | null;
  balance: string;
  isLocked: boolean;
  hasWallet: boolean;
  /**
   * 'mnemonic'   — BIP-39 wallet (0.2.0+)
   * 'privateKey' — raw key stored in the v2 format (imports / migrated legacy)
   * 'legacy'     — 0.1.0 raw-key blob, migrates to 'privateKey' on next unlock
   */
  walletType: 'mnemonic' | 'privateKey' | 'legacy' | null;
}

// ============================================================================
// ACCOUNT LINK / AUTH (IDENTITY CONTRACT v1)
// ============================================================================

export interface AuthStatus {
  linked: boolean;
  address: string | null;
  expiresAt: string | null;
  apiBase: string;
}

// ============================================================================
// DAILY WITNESS
// ============================================================================

export interface WitnessRound {
  roundId: string;
  /** Present when the API hands this reviewer a specific assignment. */
  assignmentId: string | null;
  claimText: string;
  entity: string | null;
  closesAt: string | null;
}

export interface WitnessFeed {
  available: boolean;      // false → endpoint 404s / feature not live yet
  authRequired: boolean;   // true → 401, prompt account link
  rounds: WitnessRound[];
  streak: number | null;   // placeholder — shown if the API supplies it
  points: number | null;   // placeholder — shown if the API supplies it
  error: string | null;
}

export type WitnessVoteChoice = 'approve' | 'reject' | 'more_evidence';

// ============================================================================
// MESSAGE PROTOCOL
// ============================================================================

export type Message =
  // Content → Background
  | { type: 'GET_ENTITY_DATA'; identifier: string }
  | { type: 'GET_COMMENTS'; entityHash: string; offset: number; limit: number }
  | { type: 'SUBMIT_COMMENT'; entityHash: string; content: string; parentId: number }
  | { type: 'RATE_ENTITY'; entityHash: string; score: number }
  | { type: 'RATE_WITH_REASON'; entityHash: string; score: number; reason: string }
  | { type: 'TIP_ENTITY'; entityHash: string; amountWei: string }
  | { type: 'TIP_COMMENT'; commentId: number; amountWei: string }
  | { type: 'VOTE_COMMENT'; commentId: number; vote: number }
  | { type: 'PAGE_LOADED'; url: string; domain: string }
  // Popup → Background
  | { type: 'GET_WALLET_INFO' }
  | { type: 'UNLOCK_WALLET'; password: string }
  | { type: 'CREATE_WALLET'; password: string }
  | { type: 'IMPORT_MNEMONIC'; mnemonic: string; password: string }
  | { type: 'IMPORT_WALLET'; privateKey: string; password: string }
  | { type: 'LOCK_WALLET' }
  | { type: 'SEND_ETH'; to: string; amountWei: string }
  | { type: 'GET_CURRENT_PAGE_DATA' }
  | { type: 'SET_RPC_URL'; url: string }
  | { type: 'SET_NETWORK'; networkId: import('./constants').NetworkId }
  | { type: 'SET_API_TARGET'; target: import('./constants').ApiTarget }
  | { type: 'GET_SETTINGS' }
  // Account link / auth
  | { type: 'LINK_ACCOUNT' }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'UNLINK_ACCOUNT' }
  // Daily Witness
  | { type: 'GET_OPEN_ROUNDS' }
  | { type: 'WITNESS_VOTE'; roundId: string; assignmentId: string | null; vote: WitnessVoteChoice }
  // EIP-1193 Provider
  | { type: 'EIP1193_REQUEST'; method: string; params: unknown[] };

export type MessageResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
