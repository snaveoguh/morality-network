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
import "@rainbow-me/rainbowkit/styles.css";
import { type ReactNode } from "react";
import { pooterWallet } from "@/lib/pooterWallet";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo";

const connectors = connectorsForWallets(
  [
    {
      groupName: "pooter world",
      wallets: [pooterWallet],
    },
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet, injectedWallet],
    },
  ],
  {
    appName: "pooter world",
    projectId,
  }
);

const config = createConfig({
  connectors,
  chains: [baseSepolia, base, mainnet],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderBase config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: "#1A1A1A",
            accentColorForeground: "#F5F0E8",
            borderRadius: "none",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProviderBase>
  );
}
