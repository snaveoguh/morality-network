"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FeedIcon,
  MarketsIcon,
  PredictionsIcon,
  LeaderboardIcon,
  DiscussIcon,
  WriteIcon,
  VaultIcon,
  AgentsIcon,
  ArchiveIcon,
  StumbleIcon,
  PipeIcon,
  IndexIcon,
  NeXTCubeIcon,
} from "./DockIcons";
import { NeXTClock } from "./NeXTClock";
import { ProcessMeter } from "./ProcessMeter";

type DockItem = {
  href: string;
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  matchPrefix?: boolean;
};

/**
 * Vertical Workspace dock on the LEFT edge of the viewport.
 * 64px wide, fixed, column of 48px square tiles each with the NeXT bevel.
 * Active tile is sunken with a NeXT red left-bar.
 */

const DOCK_ITEMS: DockItem[] = [
  { href: "/", label: "Feed", icon: FeedIcon },
  { href: "/pipe", label: "Pipe", icon: PipeIcon, matchPrefix: true },
  { href: "/markets", label: "Markets", icon: MarketsIcon, matchPrefix: true },
  { href: "/predictions", label: "Predictions", icon: PredictionsIcon, matchPrefix: true },
  { href: "/sentiment", label: "Index", icon: IndexIcon, matchPrefix: true },
  { href: "/bots", label: "Agents", icon: AgentsIcon, matchPrefix: true },
  { href: "/discuss", label: "Discuss", icon: DiscussIcon, matchPrefix: true },
  { href: "/leaderboard", label: "Board", icon: LeaderboardIcon, matchPrefix: true },
  { href: "/vault", label: "Vault", icon: VaultIcon, matchPrefix: true },
  { href: "/write", label: "Write", icon: WriteIcon, matchPrefix: true },
  { href: "/archive", label: "Archive", icon: ArchiveIcon, matchPrefix: true },
  { href: "/stumble", label: "Stumble", icon: StumbleIcon, matchPrefix: true },
];

export function WorkspaceDock() {
  const pathname = usePathname() ?? "/";

  return (
    <aside
      className="dock fixed left-0 top-0 bottom-0 z-40 hidden w-16 flex-col items-center py-1 md:flex"
      aria-label="Workspace dock"
    >
      {/* NeXT cube — at the top of the dock as the "system" tile */}
      <Link
        href="/architecture"
        className="dock-tile mb-2 mt-1 flex h-12 w-12 items-center justify-center"
        title="Architecture"
        data-active={pathname === "/architecture" ? "true" : "false"}
      >
        <NeXTCubeIcon size={32} />
      </Link>

      {/* Thin divider */}
      <div className="my-1 h-px w-10 bg-black/40" />
      <div className="mb-2 h-px w-10 bg-white/40" />

      {/* App tiles — scroll if overflow */}
      <div className="scrollbar-hide flex w-14 flex-col items-center gap-1 overflow-y-auto">
        {DOCK_ITEMS.map(({ href, label, icon: Icon, matchPrefix }) => {
          const isActive = matchPrefix
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="dock-tile flex h-12 w-12 flex-col items-center justify-center"
              data-active={isActive ? "true" : "false"}
              title={label}
            >
              <Icon size={28} />
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-tight leading-none text-[var(--ink)]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Footer: clock + process meter */}
      <div className="mt-auto flex w-14 flex-col items-center gap-1 pb-1">
        <div className="my-1 h-px w-10 bg-black/40" />
        <ProcessMeter />
        <NeXTClock />
      </div>
    </aside>
  );
}
