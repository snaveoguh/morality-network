"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { SearchBar } from "@/components/layout/SearchBar";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChainSwitcher } from "@/components/shared/ChainSwitcher";
import { BevelButton } from "./BevelButton";

/**
 * Floating Inspector palette — pinned to the right side, collapsible.
 * Holds the global tools: search, theme, wallet, subscribe.
 * Implemented as a small NeXT window panel.
 */
export function Inspector() {
  const [open, setOpen] = useState(true);
  const { theme, toggle } = useTheme();

  if (!open) {
    return (
      <div className="fixed right-2 top-24 z-30 hidden lg:block">
        <BevelButton
          onClick={() => setOpen(true)}
          className="h-7 px-2 text-[10px]"
        >
          Inspector ▸
        </BevelButton>
      </div>
    );
  }

  return (
    <aside
      className="fixed right-2 top-24 z-30 hidden w-56 lg:block"
      aria-label="Inspector palette"
    >
      <div className="next-window">
        {/* Title bar */}
        <div className="titlebar flex h-6 items-center px-1.5 select-none">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="titlebar-button"
            aria-label="Close inspector"
            title="Hide"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              shapeRendering="crispEdges"
              aria-hidden
            >
              <rect x="1" y="1" width="6" height="6" fill="#444" />
              <line x1="2" y1="2" x2="6" y2="6" stroke="#000" />
              <line x1="6" y1="2" x2="2" y2="6" stroke="#000" />
            </svg>
          </button>
          <div className="mx-2 flex-1 truncate titlebar-text text-[11px]">
            Inspector
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3 bg-[var(--bg)] p-2 text-[11px] text-[var(--ink)]">
          <Section title="Find">
            <SearchBar />
          </Section>

          <Section title="Display">
            <BevelButton
              onClick={toggle}
              className="w-full h-6 text-[10px]"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "■ Light Mode" : "□ Dark Mode"}
            </BevelButton>
          </Section>

          <Section title="Network">
            <div className="flex flex-col gap-1">
              <ChainSwitcher />
              <WalletPanel />
            </div>
          </Section>

          <Section title="Subscribe">
            <Link
              href="/subscribe"
              className="bevel-button bg-[var(--accent-red)] text-white text-[10px] h-6 flex items-center justify-center font-bold"
            >
              The Daily Pooter
            </Link>
          </Section>

          <Section title="Submit">
            <Link
              href="/write"
              className="bevel-button bg-[var(--chrome-mid)] text-[var(--ink)] text-[10px] h-6 flex items-center justify-center font-bold"
            >
              New Article…
            </Link>
          </Section>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-faint)] small-caps">
        {title}
      </div>
      {children}
    </div>
  );
}

function WalletPanel() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="bevel-button bg-[var(--accent-red)] text-white text-[10px] h-6 w-full font-bold"
            >
              Connect Wallet
            </button>
          );
        }
        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="bevel-button bg-[var(--chrome-mid)] text-[var(--ink)] text-[10px] h-6 w-full font-bold"
            title={account.address}
          >
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
