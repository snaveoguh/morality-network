/**
 * pooter world — Custom RainbowKit Wallet Connector
 *
 * Detects the injected `window.pooterWallet` EIP-1193 provider from the
 * pooter world Chrome extension and presents it as a wallet option in
 * RainbowKit's connect modal.
 */

import { createConnector } from 'wagmi';
import { type Wallet } from '@rainbow-me/rainbowkit';

// The icon — a simple "P" in a dark rounded square (SVG as data URI)
const POOTER_ICON = `data:image/svg+xml;base64,${typeof window !== 'undefined' ? btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1A1A1A"/><text x="32" y="44" text-anchor="middle" font-family="serif" font-size="32" font-weight="bold" fill="#F5F0E8">P</text></svg>`) : 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiMxQTFBMUEiLz48dGV4dCB4PSIzMiIgeT0iNDQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSJzZXJpZiIgZm9udC1zaXplPSIzMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiNGNUYwRTgiPlA8L3RleHQ+PC9zdmc+'}`;

function getPooterProvider(): any {
  if (typeof window === 'undefined') return undefined;
  return (window as any).pooterWallet;
}

export function pooterWallet(): Wallet {
  return {
    id: 'pooterWallet',
    name: 'pooter world',
    iconUrl: POOTER_ICON,
    iconBackground: '#1A1A1A',
    installed: !!getPooterProvider(),
    downloadUrls: {
      browserExtension: 'https://github.com/snaveoguh/morality.network',
    },
    createConnector: (walletDetails) => {
      return createConnector((config) => ({
        id: 'pooterWallet',
        name: 'pooter world',
        type: 'injected',

        async connect(params?: any) {
          const provider = getPooterProvider();
          if (!provider) throw new Error('pooter world extension not installed');

          const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
          if (!accounts.length) throw new Error('No accounts — is the pooter wallet unlocked?');

          const currentChainId = await provider.request({ method: 'eth_chainId' }) as string;

          return {
            accounts: accounts as readonly `0x${string}`[],
            chainId: parseInt(currentChainId, 16),
          } as any;
        },

        async disconnect() {
          // No-op — extension wallet doesn't have a disconnect concept
        },

        async getAccounts() {
          const provider = getPooterProvider();
          if (!provider) return [];
          const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
          return accounts as `0x${string}`[];
        },

        async getChainId() {
          const provider = getPooterProvider();
          if (!provider) return 84532; // Base Sepolia default
          const chainId = await provider.request({ method: 'eth_chainId' }) as string;
          return parseInt(chainId, 16);
        },

        async getProvider() {
          return getPooterProvider();
        },

        async isAuthorized() {
          const provider = getPooterProvider();
          if (!provider) return false;
          try {
            const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
            return accounts.length > 0;
          } catch {
            return false;
          }
        },

        async switchChain({ chainId }) {
          const provider = getPooterProvider();
          if (!provider) throw new Error('pooter world extension not installed');
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + chainId.toString(16) }],
          });
          return config.chains.find(c => c.id === chainId) || config.chains[0];
        },

        onAccountsChanged(callback) {
          const provider = getPooterProvider();
          provider?.on('accountsChanged', callback);
        },

        onChainChanged(callback: any) {
          const provider = getPooterProvider();
          provider?.on('chainChanged', (chainId: string) => {
            callback(parseInt(chainId, 16));
          });
        },

        onDisconnect(callback) {
          const provider = getPooterProvider();
          provider?.on('disconnect', callback);
        },
      }));
    },
  };
}
