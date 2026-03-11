// Chain — Base Sepolia (testnet)
export const CHAIN_ID = 84532;
export const CHAIN_NAME = 'Base Sepolia';
export const DEFAULT_RPC = 'https://sepolia.base.org';
export const FALLBACK_RPC = 'https://base-sepolia-rpc.publicnode.com';

// UI — Newspaper / E-Ink palette (matches pooter.world)
export const INK = '#1A1A1A';
export const INK_LIGHT = '#4A4A4A';
export const INK_FAINT = '#8A8A8A';
export const PAPER = '#F5F0E8';
export const PAPER_DARK = '#EDE6D6';
export const RULE = '#2A2A2A';
export const RULE_LIGHT = '#C8C0B0';
export const ACCENT_RED = '#8B0000';

// Limits
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_ENTITIES_PER_PAGE = 50;
export const MAX_KEYWORD_HIGHLIGHTS = 60;
export const NLP_TEXT_SCAN_LIMIT = 120_000;
export const NLP_DELAY_MS = 500;
export const CACHE_TTL_MS = 60_000;
export const TOOLTIP_DELAY_MS = 200;
export const OBSERVER_DEBOUNCE_MS = 300;

// Storage keys
export const STORAGE_WALLET = 'pw_wallet';
export const STORAGE_RPC = 'pw_rpc_url';
export const STORAGE_SETTINGS = 'pw_settings';
