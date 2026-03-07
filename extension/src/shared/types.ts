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
}

// ============================================================================
// MESSAGE PROTOCOL
// ============================================================================

export type Message =
  // Content → Background
  | { type: 'GET_ENTITY_DATA'; identifier: string }
  | { type: 'GET_COMMENTS'; entityHash: string; offset: number; limit: number }
  | { type: 'SUBMIT_COMMENT'; entityHash: string; content: string; parentId: number }
  | { type: 'RATE_ENTITY'; entityHash: string; score: number }
  | { type: 'TIP_ENTITY'; entityHash: string; amountWei: string }
  | { type: 'TIP_COMMENT'; commentId: number; amountWei: string }
  | { type: 'VOTE_COMMENT'; commentId: number; vote: number }
  | { type: 'PAGE_LOADED'; url: string; domain: string }
  // Popup → Background
  | { type: 'GET_WALLET_INFO' }
  | { type: 'UNLOCK_WALLET'; password: string }
  | { type: 'CREATE_WALLET'; password: string }
  | { type: 'IMPORT_WALLET'; privateKey: string; password: string }
  | { type: 'LOCK_WALLET' }
  | { type: 'SEND_ETH'; to: string; amountWei: string }
  | { type: 'GET_CURRENT_PAGE_DATA' }
  | { type: 'SET_RPC_URL'; url: string }
  | { type: 'GET_SETTINGS' };

export type MessageResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
