"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/lib/theme";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SearchBar } from "@/components/layout/SearchBar";

/**
 * Top NeXT menu bar. Small-caps Helvetica menu items.
 *
 *  Pooter | File | Edit | View | Tools | Windows | Help        clock · wallet
 */

type MenuDef = {
  label: string;
  items: { label: string; href?: string; onClick?: () => void; divider?: boolean }[];
};

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    function tick() {
      const d = new Date();
      setClock(
        d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      );
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    if (openMenu) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [openMenu]);

  const menus: MenuDef[] = [
    {
      label: "Pooter",
      items: [
        { label: "About Pooter.app", href: "/architecture" },
        { divider: true, label: "" },
        { label: "Style Guide", href: "/style-guide" },
        { label: "Typography Lab", href: "/typography" },
        { divider: true, label: "" },
        { label: "System Status", href: "/status" },
        { label: "Appendix", href: "/appendix" },
      ],
    },
    {
      label: "File",
      items: [
        { label: "New Article…", href: "/write" },
        { label: "Subscribe…", href: "/subscribe" },
        { divider: true, label: "" },
        { label: "Daily Editions", href: "/daily" },
        { label: "Archive", href: "/archive" },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Search…", onClick: () => {} },
        { label: "Stumble", href: "/stumble" },
        { divider: true, label: "" },
        { label: "Discuss", href: "/discuss" },
        { label: "Originals", href: "/originals" },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: theme === "dark" ? "Light Mode" : "Dark Mode",
          onClick: toggle,
        },
        { divider: true, label: "" },
        { label: "Feed", href: "/" },
        { label: "Sentiment Index", href: "/sentiment" },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "Markets", href: "/markets" },
        { label: "Predictions", href: "/predictions" },
        { label: "Vault", href: "/vault" },
        { label: "Pipe", href: "/pipe" },
        { divider: true, label: "" },
        { label: "Agents", href: "/bots" },
        { label: "Governance", href: "/proposals" },
      ],
    },
    {
      label: "Windows",
      items: [
        { label: "Co-op", href: "/coop" },
        { label: "Registry", href: "/registry" },
        { label: "Leaderboard", href: "/leaderboard" },
        { label: "Nouns", href: "/nouns" },
        { label: "Pepe", href: "/pepe" },
        { label: "Music", href: "/music" },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "ZK Recovery", href: "/zk-recovery" },
        { label: "Style Guide", href: "/style-guide" },
        { label: "Architecture", href: "/architecture" },
      ],
    },
  ];

  return (
    <div
      ref={ref}
      className="menubar fixed top-0 left-0 right-0 z-50 flex h-6 items-center pl-16 pr-2 text-[11px]"
    >
      {/* Pooter glyph as the first menu */}
      <span className="mr-1 inline-flex h-6 w-6 items-center justify-center">
        <svg width="14" height="14" viewBox="0 0 14 14" shapeRendering="crispEdges">
          <rect x="2" y="3" width="10" height="10" fill="#000" />
          <polygon points="2,3 4,1 14,1 12,3" fill="#666" />
          <polygon points="12,3 14,1 14,11 12,13" fill="#333" />
          <rect x="4" y="5" width="6" height="1" fill="#CC0000" />
        </svg>
      </span>

      {menus.map((menu) => {
        const isOpen = openMenu === menu.label;
        return (
          <div key={menu.label} className="relative h-full">
            <button
              type="button"
              className="menubar-item"
              data-open={isOpen ? "true" : "false"}
              onClick={() => setOpenMenu(isOpen ? null : menu.label)}
            >
              {menu.label}
              <span className="ml-1 text-[8px] opacity-60">▼</span>
            </button>
            {isOpen && (
              <div className="next-panel absolute left-0 top-full min-w-[180px] py-1">
                {menu.items.map((item, idx) =>
                  item.divider ? (
                    <div
                      key={`d-${idx}`}
                      className="my-1 h-px bg-black/40 mx-1"
                      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.5)" }}
                    />
                  ) : item.href ? (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setOpenMenu(null)}
                      className="block px-3 py-1 text-[11px] text-[var(--ink)] hover:bg-[var(--accent-blue)] hover:text-white"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        item.onClick?.();
                        setOpenMenu(null);
                      }}
                      className="block w-full px-3 py-1 text-left text-[11px] text-[var(--ink)] hover:bg-[var(--accent-blue)] hover:text-white"
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Spacer */}
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden md:block">
          <SearchBar />
        </div>
        <MiniWallet />
        <span className="font-mono text-[10px] text-[var(--ink)] px-1">{clock}</span>
      </div>
    </div>
  );
}

function MiniWallet() {
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
              className="bevel-button bg-[var(--chrome-mid)] px-2 text-[10px] font-bold text-[var(--ink)] h-5"
            >
              Connect
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openAccountModal}
            className="bevel-button bg-[var(--chrome-mid)] px-2 text-[10px] font-bold text-[var(--ink)] h-5"
          >
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
