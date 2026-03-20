"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as WagmiProviderBase, http } from "wagmi";
import { base, baseSepolia, mainnet } from "wagmi/chains";
import {
  RainbowKitProvider,
  connectorsForWallets,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig } from "wagmi";
import { injected, coinbaseWallet as cbWallet } from "wagmi/connectors";
import "@rainbow-me/rainbowkit/styles.css";
import { type ReactNode } from "react";
import { pooterWallet } from "@/lib/pooterWallet";
import { NotificationProvider } from "@/providers/NotificationProvider";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// RainbowKit's connectorsForWallets ALWAYS opens a WalletConnect WebSocket relay,
// even for MetaMask/Coinbase (they use WC for QR code scanning).
// With an invalid project ID the relay rejects → "Connection closed" → React crash.
// When no valid WC project ID, use raw wagmi connectors (no WC relay at all).
const hasValidWC =
  projectId.length > 0 &&
  projectId !== "demo" &&
  projectId !== "placeholder" &&
  !projectId.startsWith("replace");

const chains = [base, baseSepolia, mainnet] as const;

const transports = {
  [baseSepolia.id]: http(),
  [base.id]: http(),
  [mainnet.id]: http("https://mainnet.rpc.buidlguidl.com"),
};

// Two config paths: with WC (full RainbowKit) or without (raw connectors, no WC relay)
const config = hasValidWC
  ? createConfig({
      connectors: connectorsForWallets(
        [
          { groupName: "pooter world", wallets: [pooterWallet] },
          {
            groupName: "Popular",
            wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet, injectedWallet],
          },
        ],
        { appName: "pooter world", projectId }
      ),
      chains,
      transports,
      ssr: true,
    })
  : createConfig({
      connectors: [injected(), cbWallet({ appName: "pooter world" })],
      chains,
      transports,
      ssr: true,
    });

const queryClient = new QueryClient();

const rkTheme = lightTheme({
  accentColor: "#1A1A1A",
  accentColorForeground: "#F5F0E8",
  borderRadius: "none",
  overlayBlur: "small",
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderBase config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProviderBase>
  );
}
