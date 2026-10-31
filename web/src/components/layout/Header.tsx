"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BRAND_NAME } from "@/lib/brand";
import { CloseIcon, SearchIcon } from "@/components/layout/icons";
import { HeaderTicker, useLondonDate } from "@/components/layout/HeaderTicker";
import { HeaderSearch } from "@/components/layout/HeaderSearch";

// ============================================================================
// HEADER — direction C slim bar
//
//   phone   [pw] Accountability record · Thu 29 Oct          [search]
//   ≥1024   [pw] Accountability record · Thu 29 Oct   [ search… ] [Menu]
//           ‹ top stories by impact, scrolling right to left ›
//
// The big nav lives in /more (the More tab on phone, "Menu" on desktop).
// On /search and /more the right-hand control becomes Close, which returns
// to the page they were opened from (or the front page on a direct visit).
// ============================================================================

const OVERLAY_PATHS = new Set(["/search", "/more"]);

/** The blackletter "pw" mark — paper square, ink letters. */
export function PwMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10 text-[24px]" : "h-8 w-8 text-[19px]";
  return (
    <span
      aria-hidden
      className={`blackletter flex shrink-0 items-center justify-center bg-[var(--ink)] pb-[3px] leading-none text-[var(--paper)] ${box}`}
    >
      pw
    </span>
  );
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const overlay = OVERLAY_PATHS.has(pathname);
  const today = useLondonDate();

  // Remember whether we arrived here by navigating inside the site, so Close
  // can go back (keeping scroll position) rather than reloading the front.
  const lastPath = useRef<string | null>(null);
  const cameFrom = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      cameFrom.current = lastPath.current;
      lastPath.current = pathname;
    }
  }, [pathname]);
  const close = () => {
    if (cameFrom.current && !OVERLAY_PATHS.has(cameFrom.current)) router.back();
    else router.push("/");
  };

  const closeButton = (
    <button
      type="button"
      onClick={close}
      aria-label="Close"
      className="flex h-11 items-center justify-center gap-1.5 justify-self-end text-sm font-semibold text-[var(--ink)] max-lg:w-11 lg:border lg:border-[var(--rule)] lg:px-4 lg:transition-colors lg:hover:bg-[var(--paper-dark)]"
    >
      <CloseIcon className="h-[22px] w-[22px] lg:h-4 lg:w-4" />
      <span className="hidden lg:inline">Close</span>
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--rule-light)] bg-[var(--paper)]">
        <div className="mx-auto grid h-[56px] max-w-7xl grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-2 px-4 lg:h-[64px] lg:gap-x-3">
          <Link
            href="/"
            aria-label={`${BRAND_NAME} home`}
            className="flex h-11 w-11 items-center"
          >
            <PwMark />
          </Link>

          {/* No wordmark: the pw glyph is the brand. The notice line is dated. */}
          <Link
            href="/"
            className="flex h-11 min-w-0 items-baseline gap-1 self-center overflow-hidden whitespace-nowrap pt-[11px] text-[var(--ink)] lg:pt-[10px]"
          >
            <span className="font-news shrink-0 text-[15px] tracking-[0.02em] sm:text-[17px] sm:tracking-[0.04em] lg:text-[19px]">
              Accountability record
            </span>
            {today && (
              <time dateTime={today.iso} className="truncate text-[12px] text-[var(--ink-faint)] sm:text-[13px] lg:text-sm">
                <span aria-hidden>· </span>
                {today.label}
              </time>
            )}
          </Link>

          {overlay ? (
            <div className="flex justify-end">{closeButton}</div>
          ) : (
            <>
              {/* Phone + tablet: icon to the search page */}
              <Link
                href="/search"
                aria-label="Search"
                className="flex h-11 w-11 items-center justify-center justify-self-end text-[var(--ink)] lg:hidden"
              >
                <SearchIcon className="h-[22px] w-[22px]" />
              </Link>

              {/* Desktop: inline search box + Menu */}
              <div className="hidden items-center justify-end gap-2.5 lg:flex">
                <HeaderSearch />
                <Link
                  href="/more"
                  className="flex h-11 items-center border border-[var(--rule)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--paper-dark)]"
                >
                  Menu
                </Link>
              </div>
            </>
          )}
        </div>
        <div className="mx-auto max-w-7xl border-t border-[var(--rule-light)] px-4">
          <HeaderTicker />
        </div>
      </header>
    </>
  );
}
