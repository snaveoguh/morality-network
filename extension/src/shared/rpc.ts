import { createPublicClient, createWalletClient, http, type Account, type Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import {
  DEFAULT_NETWORK,
  NETWORKS,
  STORAGE_NETWORK,
  STORAGE_RPC,
  STORAGE_RPC_OVERRIDES,
  ZERO_ADDRESS,
  type NetworkConfig,
  type NetworkId,
} from './constants';

// ============================================================================
// ACTIVE NETWORK + RPC
//
// The active network is a user setting (chrome.storage.local). Default: Base
// mainnet. RPC URL overrides are stored per network so switching networks
// never sends a mainnet request to a testnet RPC or vice versa.
// ============================================================================

const VIEM_CHAINS: Record<NetworkId, Chain> = {
  base,
  baseSepolia,
};

let activeNetworkId: NetworkId = DEFAULT_NETWORK;
let rpcOverrides: Partial<Record<NetworkId, string>> = {};
let publicClient: any = null;

function isNetworkId(value: unknown): value is NetworkId {
  return value === 'base' || value === 'baseSepolia';
}

export async function initRpc(): Promise<void> {
  const stored = await chrome.storage.local.get([STORAGE_NETWORK, STORAGE_RPC_OVERRIDES, STORAGE_RPC]);
  activeNetworkId = isNetworkId(stored[STORAGE_NETWORK]) ? stored[STORAGE_NETWORK] : DEFAULT_NETWORK;
  rpcOverrides = (stored[STORAGE_RPC_OVERRIDES] as Partial<Record<NetworkId, string>>) || {};

  // Migrate the pre-0.2.0 single RPC override: it was always a Base Sepolia
  // URL, so pin it to the testnet entry rather than letting it leak to mainnet.
  if (stored[STORAGE_RPC] && !rpcOverrides.baseSepolia) {
    rpcOverrides.baseSepolia = stored[STORAGE_RPC] as string;
    await chrome.storage.local.set({ [STORAGE_RPC_OVERRIDES]: rpcOverrides });
    await chrome.storage.local.remove(STORAGE_RPC);
  }

  publicClient = null; // force re-create
}

export function getNetwork(): NetworkConfig {
  return NETWORKS[activeNetworkId];
}

export function getNetworkId(): NetworkId {
  return activeNetworkId;
}

export function getChain(): Chain {
  return VIEM_CHAINS[activeNetworkId];
}

export function getContracts(): NetworkConfig['contracts'] {
  return NETWORKS[activeNetworkId].contracts;
}

/** True when the named contract exists on the active network. */
export function isContractAvailable(name: keyof NetworkConfig['contracts']): boolean {
  return getContracts()[name] !== ZERO_ADDRESS;
}

export function setNetwork(id: NetworkId): void {
  if (!isNetworkId(id)) throw new Error(`Unknown network: ${id}`);
  activeNetworkId = id;
  publicClient = null;
  void chrome.storage.local.set({ [STORAGE_NETWORK]: id });
}

export function setRpcUrl(url: string): void {
  rpcOverrides[activeNetworkId] = url;
  publicClient = null;
  void chrome.storage.local.set({ [STORAGE_RPC_OVERRIDES]: rpcOverrides });
}

export function getRpcUrl(): string {
  return rpcOverrides[activeNetworkId] || NETWORKS[activeNetworkId].rpc;
}

export function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: getChain(),
      transport: http(getRpcUrl(), { timeout: 10000, retryCount: 1 }),
      batch: { multicall: true },
    }) as any;
  }
  return publicClient as any;
}

export function createWallet(account: Account) {
  return createWalletClient({
    account,
    chain: getChain(),
    transport: http(getRpcUrl(), { timeout: 10000, retryCount: 1 }),
  });
}
