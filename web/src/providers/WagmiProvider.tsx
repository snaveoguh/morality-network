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

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// RainbowKit's connectorsForWallets ALWAYS opens a WalletConnect WebSocket relay,
// even for MetaMask/Coinbase (they use WC for QR scanning).
// With an invalid project ID the relay rejects immediately → "Connection closed" → app crash.
// When no valid WC project ID is set, fall back to raw wagmi connectors (no WC relay).
const hasValidWC =
  projectId.length > 0 && projectId !== "demo" && projectId !== "placeholder";

const chains = [baseSepolia, base, mainnet] as const;

const config = hasValidWC
  ? createConfig({
      connectors: connectorsForWallets(
        [
          { groupName: "pooter world", wallets: [pooterWallet] },
          {
            groupName: "Popular",
            wallets: [
              metaMaskWallet,
              coinbaseWallet,
              walletConnectWallet,
              injectedWallet,
            ],
          },
        ],
        { appName: "pooter world", projectId }
      ),
      chains,
      transports: {
        [baseSepolia.id]: http(),
        [base.id]: http(),
        [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
      },
      ssr: true,
    })
  : createConfig({
      connectors: [injected(), cbWallet({ appName: "pooter world" })],
      chains,
      transports: {
        [baseSepolia.id]: http(),
        [base.id]: http(),
        [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
      },
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
        {hasValidWC ? (
          <RainbowKitProvider theme={rkTheme}>{children}</RainbowKitProvider>
        ) : (
          // No RainbowKit when WC is unavailable — just wagmi + injected/coinbase
          children
        )}
      </QueryClientProvider>
    </WagmiProviderBase>
  );
}
