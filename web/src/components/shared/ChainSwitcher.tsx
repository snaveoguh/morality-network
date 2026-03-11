"use client";

import { useState, useRef, useEffect } from "react";
import { useSwitchChain, useChainId } from "wagmi";

// ── Minimal grey outline chain icons (SVG inline) ──────────────────────────
// All icons: 16x16, stroke only, no fill, currentColor

function IconEthereum({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M8 1L3 8l5 3 5-3L8 1z" />
      <path d="M3 8l5 7 5-7-5 3-5-3z" />
    </svg>
  );
}

function IconBase({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8.5 4.5H6v7h2.5a3.5 3.5 0 000-7z" />
    </svg>
  );
}

function IconZcash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6 5h4L6 11h4" />
      <path d="M8 3.5v2M8 10.5v2" />
    </svg>
  );
}

// ── Chain definitions ──────────────────────────────────────────────────────

interface ChainOption {
  id: number;
  name: string;
  shortName: string;
  icon: React.FC<{ className?: string }>;
  enabled: boolean;
  teaser?: string; // shown as tooltip for disabled chains
}

const CHAINS: ChainOption[] = [
  { id: 1, name: "Ethereum Mainnet", shortName: "ETH", icon: IconEthereum, enabled: true },
  { id: 8453, name: "Base", shortName: "BASE", icon: IconBase, enabled: true },
  { id: 84532, name: "Base Sepolia", shortName: "SEP", icon: IconBase, enabled: true },
  { id: -1, name: "Zcash", shortName: "ZEC", icon: IconZcash, enabled: false, teaser: "Coming soon" },
];

// ── Component ──────────────────────────────────────────────────────────────

export function ChainSwitcher() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const current = CHAINS.find((c) => c.id === chainId) || CHAINS[0];
  const CurrentIcon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-5 items-center gap-1 border border-[var(--rule)] bg-[var(--paper)] px-1.5 font-mono text-[7px] uppercase tracking-[0.12em] text-[var(--ink)] transition-colors hover:bg-[var(--paper-dark)]"
        title={current.name}
      >
        <CurrentIcon className="h-2.5 w-2.5 text-[var(--ink)]" />
        <span>{current.shortName}</span>
        <svg viewBox="0 0 8 5" className="h-1.5 w-2 text-[var(--ink-faint)]" fill="currentColor">
          <path d="M0 0l4 5 4-5z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] border border-[var(--rule)] bg-[var(--paper)] shadow-sm">
          {CHAINS.map((chain) => {
            const Icon = chain.icon;
            const isActive = chain.id === chainId;
            const disabled = !chain.enabled;

            return (
              <button
                key={chain.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (chain.enabled && chain.id !== chainId) {
                    switchChain({ chainId: chain.id });
                  }
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[8px] uppercase tracking-[0.14em] transition-colors ${
                  disabled
                    ? "cursor-default text-[var(--rule-light)]"
                    : isActive
                      ? "bg-[var(--paper-dark)] font-bold text-[var(--ink)]"
                      : "text-[var(--ink-faint)] hover:bg-[var(--paper-dark)] hover:text-[var(--ink)]"
                }`}
                title={disabled ? chain.teaser : chain.name}
              >
                <Icon className={`h-3 w-3 ${disabled ? "text-[var(--rule-light)]" : isActive ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"}`} />
                <span className="flex-1">{chain.name}</span>
                {isActive && (
                  <span className="h-1 w-1 rounded-full bg-[var(--ink)]" />
                )}
                {disabled && chain.teaser && (
                  <span className="text-[6px] italic tracking-normal normal-case text-[var(--rule)]">
                    {chain.teaser}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
