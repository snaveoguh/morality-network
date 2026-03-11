"use client";

import { useEffect, useState } from "react";
import { BRAND_NAME } from "@/lib/brand";

const INTRO_STORAGE_KEY = "pooter_intro_seen_v1";

export function IntroSplash() {
  const [isVisible, setIsVisible] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(INTRO_STORAGE_KEY);
      if (!seen) {
        setIsVisible(true);
      }
    } catch {
      // Ignore storage errors and continue without blocking page load.
    } finally {
      setIsReady(true);
    }
  }, []);

  function dismiss() {
    setIsVisible(false);
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
  }

  if (!isReady || !isVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 p-6 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${BRAND_NAME} mission statement`}
      onClick={dismiss}
    >
      <div
        className="intro-lofi relative w-full max-w-5xl overflow-hidden border-2 border-[var(--rule)] p-8 shadow-2xl sm:p-10 md:p-14"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={dismiss}
            className="border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            Enter
          </button>
        </div>

        <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.28em] text-[var(--paper-dark)]/90">
          {BRAND_NAME}
        </p>

        <h1 className="intro-mission-text text-3xl leading-[1.03] text-[var(--paper)] sm:text-5xl md:text-6xl lg:text-7xl">
          A public ledger of world events and their interpretation.
        </h1>

        <p className="mt-4 max-w-2xl font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--paper-dark)]/90">
          Onchain discussion. Public memory. Verifiable signal.
        </p>
      </div>
    </div>
  );
}
