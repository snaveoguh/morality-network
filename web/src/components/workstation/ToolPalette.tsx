"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useTheme } from "@/lib/theme";
import { DitherSwatch } from "./DitherSwatch";

const COMMANDS: { label: string; href: string }[] = [
  { label: "Feed", href: "/" },
  { label: "Pipe", href: "/pipe" },
  { label: "Markets", href: "/markets" },
  { label: "Agents", href: "/bots" },
  { label: "Index", href: "/sentiment" },
  { label: "Originals", href: "/originals" },
  { label: "Archive", href: "/archive" },
  { label: "Governance", href: "/proposals" },
  { label: "Co-op", href: "/coop" },
];

const FILLS: { label: string; pattern: React.ComponentProps<typeof DitherSwatch>["pattern"] }[] = [
  { label: "All", pattern: "solid" },
  { label: "World", pattern: "75" },
  { label: "Tech", pattern: "50" },
  { label: "Crypto", pattern: "25" },
  { label: "Onchain", pattern: "diag" },
  { label: "Originals", pattern: "cross" },
];

const TOOL_ICONS = [
  // 13 bitmap-like 16x16 SVG glyphs
  // line
  "M2 14 L14 2",
  // rect outline
  "M2 3 H14 V13 H2 Z",
  // rect filled
  "M2 3 H14 V13 H2 Z|fill",
  // polygon (triangle)
  "M8 2 L14 13 H2 Z",
  // A (text)
  "TEXT_A",
  // frame
  "M1 1 H15 V15 H1 Z M3 3 H13 V13 H3 Z",
  // curve
  "M2 13 Q8 0 14 13",
  // circle outline
  "CIRCLE_O",
  // circle filled
  "CIRCLE_F",
  // polyline
  "M2 12 L6 5 L10 9 L14 3",
  // text icon (lines)
  "M3 4 H13 M3 8 H13 M3 12 H10",
  // pen
  "M3 13 L8 8 L11 11 L13 5 L11 3 L5 5 L8 8",
  // arrow
  "M2 8 H12 M9 5 L13 8 L9 11",
];

function ToolGlyph({ spec }: { spec: string }) {
  if (spec === "TEXT_A") {
    return (
      <text x="8" y="13" fontFamily="var(--font-sans)" fontSize="14" fontWeight="700" textAnchor="middle" fill="currentColor">
        A
      </text>
    );
  }
  if (spec === "CIRCLE_O") {
    return <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1" fill="none" />;
  }
  if (spec === "CIRCLE_F") {
    return <circle cx="8" cy="8" r="5" fill="currentColor" />;
  }
  const [d, mod] = spec.split("|");
  return (
    <path d={d} stroke="currentColor" strokeWidth="1" fill={mod === "fill" ? "currentColor" : "none"} />
  );
}

interface ToolPaletteProps {
  activeFill?: string;
  onSelectFill?: (label: string) => void;
}

export function ToolPalette({ activeFill = "All", onSelectFill }: ToolPaletteProps) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [search, setSearch] = useState("");
  const [keepTool, setKeepTool] = useState(true);
  const [movement, setMovement] = useState<"none" | "h" | "v">("none");

  return (
    <aside className="palette w-[200px] shrink-0" aria-label="Workstation tool palette">
      {/* TITLE BAR — striped */}
      <div className="win-titlebar">
        <div className="win-titlebar-corner" aria-hidden />
        <div className="win-titlebar-text">
          <span>Tools</span>
        </div>
        <div className="win-titlebar-corner right" aria-hidden />
      </div>

      {/* SEARCH (compact text input) */}
      <div className="palette-section">
        <div className="palette-section-title">Search</div>
        <div className="palette-section-body">
          <form
            action="/search"
            method="get"
            className="flex border border-[var(--ink)]"
            onSubmit={(e) => {
              if (!search.trim()) {
                e.preventDefault();
              }
            }}
          >
            <input
              name="q"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="find..."
              className="w-full bg-[var(--bg)] px-1 font-mono text-[10px] outline-none"
              aria-label="Search"
            />
          </form>
        </div>
      </div>

      {/* COMMANDS — primary nav */}
      <div className="palette-section">
        <div className="palette-section-title">Commands</div>
        <div className="palette-section-body">
          {COMMANDS.map((c) => {
            const isActive = c.href === "/" ? pathname === "/" : pathname.startsWith(c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                className="palette-row"
                data-active={isActive ? "true" : undefined}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* TOOLS — 13 bitmap icons */}
      <div className="palette-section">
        <div className="palette-section-title">Tools</div>
        <div className="palette-section-body">
          <div className="palette-grid">
            {TOOL_ICONS.map((spec, i) => (
              <span key={i} aria-hidden>
                <svg width="16" height="16" viewBox="0 0 16 16" shapeRendering="crispEdges">
                  <ToolGlyph spec={spec} />
                </svg>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* FILLS — feed category filters */}
      <div className="palette-section">
        <div className="palette-section-title">Fills</div>
        <div className="palette-section-body">
          <div className="palette-swatches">
            {FILLS.map((f) => (
              <DitherSwatch
                key={f.label}
                pattern={f.pattern}
                size={20}
                title={f.label}
                selected={activeFill === f.label}
                onClick={() => onSelectFill?.(f.label)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* BORDERS — same swatches, decorative */}
      <div className="palette-section">
        <div className="palette-section-title">Borders</div>
        <div className="palette-section-body">
          <div className="palette-swatches">
            <DitherSwatch pattern="solid" size={20} title="solid" />
            <DitherSwatch pattern="75" size={20} title="75%" />
            <DitherSwatch pattern="50" size={20} title="50%" />
            <DitherSwatch pattern="25" size={20} title="25%" />
            <DitherSwatch pattern="diag" size={20} title="diag" />
            <DitherSwatch pattern="cross" size={20} title="cross" />
          </div>
        </div>
      </div>

      {/* WIDTHS — line weights */}
      <div className="palette-section">
        <div className="palette-section-title">Widths</div>
        <div className="palette-section-body">
          <div className="flex flex-col gap-1 py-1">
            {[1, 2, 3, 4].map((w) => (
              <div
                key={w}
                style={{
                  height: w,
                  background: "var(--ink)",
                  width: "100%",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* OPTIONS — keep tool + movement */}
      <div className="palette-section">
        <div className="palette-section-title">Options</div>
        <div className="palette-section-body font-mono text-[10px]">
          <label className="flex items-center gap-1 py-0.5 cursor-pointer">
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                border: "1px solid var(--ink)",
                background: keepTool ? "var(--ink)" : "var(--bg)",
                display: "inline-block",
              }}
            />
            <input
              type="checkbox"
              className="sr-only"
              checked={keepTool}
              onChange={(e) => setKeepTool(e.target.checked)}
            />
            Keep Tool
          </label>
          <div className="mt-1">Movement:</div>
          {([
            ["none", "Unconstrained"],
            ["h", "H. Only"],
            ["v", "V. Only"],
          ] as const).map(([k, lbl]) => (
            <label key={k} className="flex items-center gap-1 py-0.5 cursor-pointer">
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  border: "1px solid var(--ink)",
                  background: movement === k ? "var(--ink)" : "var(--bg)",
                  display: "inline-block",
                }}
              />
              <input
                type="radio"
                className="sr-only"
                name="movement"
                checked={movement === k}
                onChange={() => setMovement(k)}
              />
              {lbl}
            </label>
          ))}
        </div>
      </div>

      {/* SYSTEM — theme + wallet + subscribe */}
      <div className="palette-section">
        <div className="palette-section-title">System</div>
        <div className="palette-section-body">
          <button type="button" onClick={toggle} className="palette-row w-full text-left">
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <Link href="/subscribe" className="palette-row block">
            Subscribe
          </Link>
          <Link href="/write" className="palette-row block">
            Create
          </Link>
          <div className="palette-row p-0 mt-1">
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, openAccountModal, mounted, authenticationStatus }) => {
                const ready = mounted && authenticationStatus !== "loading";
                const connected =
                  ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");
                if (!connected) {
                  return (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="w-full border border-[var(--ink)] bg-[var(--ink)] px-1 font-mono text-[10px] text-[var(--bg)]"
                      style={{ height: 16, lineHeight: "14px" }}
                    >
                      [ Connect ]
                    </button>
                  );
                }
                return (
                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="w-full border border-[var(--ink)] bg-[var(--bg)] px-1 font-mono text-[10px] text-[var(--ink)]"
                    style={{ height: 16, lineHeight: "14px" }}
                  >
                    {account.displayName}
                  </button>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </div>
    </aside>
  );
}

