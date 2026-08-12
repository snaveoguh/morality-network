import { type Address } from 'viem';

// ============================================================================
// NETWORKS
//
// Default is Base mainnet (8453). Base Sepolia stays selectable in Settings.
//
// DANGER — chain-id pinning: this project's deployer reused nonces across
// chains, so the SAME address can hold DIFFERENT contracts on Base vs Base
// Sepolia (e.g. 0x2ea7502c… is MoralityRegistry on Base but the prediction
// market proxy on Ethereum; 0x71b2e2… is legacy Sepolia tipping but the
// prediction market proxy on Base). Never copy an address between the two
// network blocks without verifying it onchain against the target chain id.
// Mainnet addresses below were verified live on Base (eth_getCode +
// registry.computeHash / ratings.getAverageRating probes) on 2026-08-12.
// ============================================================================

export type NetworkId = 'base' | 'baseSepolia';

export interface NetworkConfig {
  id: NetworkId;
  chainId: number;
  name: string;
  rpc: string;
  fallbackRpc: string;
  explorer: string;
  contracts: {
    registry: Address;
    ratings: Address;
    comments: Address;
    tipping: Address;
    leaderboard: Address;
    /** MO token — zero address means "not available on this network". */
    moToken: Address;
  };
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  base: {
    id: 'base',
    chainId: 8453,
    name: 'Base',
    rpc: 'https://mainnet.base.org',
    fallbackRpc: 'https://base-rpc.publicnode.com',
    explorer: 'https://basescan.org',
    contracts: {
      // Same defaults as web/src/lib/contracts.ts (Base mainnet proxies).
      registry: '0x2ea7502C4db5B8cfB329d8a9866EB6705b036608' as Address,
      ratings: '0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405' as Address,
      comments: '0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b' as Address,
      tipping: '0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B' as Address,
      leaderboard: '0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6' as Address,
      moToken: '0x8729c70061739140ee6bE00A3875Cbf6d09A746C' as Address,
    },
  },
  baseSepolia: {
    id: 'baseSepolia',
    chainId: 84532,
    name: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    fallbackRpc: 'https://base-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.basescan.org',
    contracts: {
      // Canonical Base Sepolia proxy deployment (docs/DEPLOYMENTS.md,
      // contracts/broadcast/DeployAll.s.sol/84532/run-latest.json). The
      // pre-proxy March 2026 set the extension used to point at
      // (0x1c73ef… registry etc.) is still live but superseded.
      registry: '0x661674e3Bf03B644a755c0438E3F2168a4d6aa13' as Address,
      ratings: '0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f' as Address,
      comments: '0xd17E13507f8005048a3fcf9850F2dF65c56e3005' as Address,
      tipping: '0x8b632dF91E59Fb14C828E65E3e1f6eea2180721e' as Address,
      leaderboard: '0xf7294B25396E77Fcf6af3f38A3116737df229080' as Address,
      // No canonical test MO token on Sepolia — MO features are gated off.
      moToken: ZERO_ADDRESS,
    },
  },
};

export const DEFAULT_NETWORK: NetworkId = 'base';

// Backwards-visible constants (default network). Prefer getNetwork() from
// shared/rpc.ts anywhere behaviour must follow the user's selection.
export const CHAIN_ID = NETWORKS[DEFAULT_NETWORK].chainId;
export const CHAIN_NAME = NETWORKS[DEFAULT_NETWORK].name;
export const DEFAULT_RPC = NETWORKS[DEFAULT_NETWORK].rpc;
export const FALLBACK_RPC = NETWORKS[DEFAULT_NETWORK].fallbackRpc;

// ============================================================================
// API (pooter.world platform)
// ============================================================================

export const API_BASES = {
  prod: 'https://pooter.world',
  dev: 'https://dev.pooter.world',
} as const;
export type ApiTarget = keyof typeof API_BASES;
export const DEFAULT_API_TARGET: ApiTarget = 'prod';

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
export const STORAGE_RPC = 'pw_rpc_url'; // legacy single-URL override (pre-0.2.0)
export const STORAGE_RPC_OVERRIDES = 'pw_rpc_overrides'; // { [networkId]: url }
export const STORAGE_NETWORK = 'pw_network'; // NetworkId
export const STORAGE_SETTINGS = 'pw_settings';
export const STORAGE_AUTH = 'pw_auth'; // { token, expiresAt, address, apiBase }
export const STORAGE_API_TARGET = 'pw_api_target'; // 'prod' | 'dev'

export const EXTENSION_VERSION = '0.2.0';
