import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient, type Account } from 'viem';
import { baseSepolia } from 'viem/chains';
import { DEFAULT_RPC, STORAGE_RPC } from './constants';

let rpcUrl = DEFAULT_RPC;
let publicClient: PublicClient | null = null;

export async function initRpc(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_RPC);
  if (stored[STORAGE_RPC]) rpcUrl = stored[STORAGE_RPC] as string;
  publicClient = null; // force re-create
}

export function setRpcUrl(url: string): void {
  rpcUrl = url;
  publicClient = null;
  chrome.storage.local.set({ [STORAGE_RPC]: url });
}

export function getRpcUrl(): string {
  return rpcUrl;
}

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
      batch: { multicall: true },
    });
  }
  return publicClient;
}

export function createWallet(account: Account): WalletClient {
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}
