"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainSwitcher } from "@/components/shared/ChainSwitcher";
import { TranslateMenu } from "@/components/layout/TranslateMenu";
import { useTheme } from "@/lib/theme";

// Account rows for the More page: wallet, chain, theme, translate, settings.
// Each row is a 48px touch target; the value sits on the right in ink-light.

const ROW =
  "flex min-h-12 items-center justify-between gap-3 border-b border-[var(--rule-light)] text-[15px] text-[var(--ink)]";

function WalletRow() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");
        const onClick = !connected ? openConnectModal : chain.unsupported ? openChainModal : openAccountModal;
        const value = !connected
          ? "Connect ›"
          : chain.unsupported
            ? "Wrong network ›"
            : `${account.displayName} ›`;
        return (
          <button type="button" onClick={onClick} className={`${ROW} w-full text-left`}>
            <span>Wallet</span>
            <span className="text-[13px] text-[var(--ink-light)]">{value}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

function ThemeRow() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} className={`${ROW} w-full text-left`}>
      <span>Theme</span>
      <span className="text-[13px] text-[var(--ink-light)]">
        {theme === "dark" ? "Dark" : "Light"} · switch ›
      </span>
    </button>
  );
}

export function MoreAccount() {
  return (
    <div className="flex flex-col">
      <WalletRow />
      <div className={ROW}>
        <span>Chain</span>
        <ChainSwitcher />
      </div>
      <ThemeRow />
      <div className={ROW}>
        <span>Translate</span>
        <TranslateMenu />
      </div>
      <Link href="/account" className={ROW}>
        <span>Account settings</span>
        <span className="text-[var(--ink-light)]">›</span>
      </Link>
    </div>
  );
}
