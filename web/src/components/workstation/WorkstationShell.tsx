"use client";

/**
 * WorkstationShell — wraps the newspaper document in 1989 SunOS/FrameMaker
 * chrome. Top: menu bar + top-right "EN TOOLS HELP INFO" + analog clock.
 * Right: floating ToolPalette. Bottom: StatusBar. Center: a Window with
 * striped title bar holding the existing newspaper content.
 *
 * The existing newspaper layout (Masthead, Feed, etc.) renders INSIDE the
 * window — cream paper, Fraktur masthead, drop caps, all preserved. The
 * chrome merely frames them.
 */
import { ReactNode } from "react";
import { MenuBar } from "./MenuBar";
import { AnalogClock } from "./AnalogClock";
import { StatusBar } from "./StatusBar";
import { ToolPalette } from "./ToolPalette";
import { Window } from "./Window";

export interface WorkstationShellProps {
  children: ReactNode;
}

export function WorkstationShell({ children }: WorkstationShellProps) {
  return (
    <div className="workstation-desktop min-h-screen">
      {/* TOP STRIP — menu bar on the left, system menu on the right */}
      <div className="flex w-full items-stretch border-b border-[var(--chrome-rule)] bg-[var(--chrome-bg)]">
        <div className="flex-1 overflow-x-auto">
          <MenuBar />
        </div>
        <div className="hidden md:flex items-center gap-3 border-l border-[var(--chrome-rule)] px-3">
          <div className="topright-menu">
            <span className="topright-menu-item">EN</span>
            <span className="topright-menu-item">TOOLS</span>
            <span className="topright-menu-item">HELP</span>
            <span className="topright-menu-item">INFO</span>
          </div>
          <div className="border-l border-[var(--chrome-rule)] pl-2 text-[var(--chrome-ink)]">
            <AnalogClock />
          </div>
        </div>
      </div>

      {/* DESKTOP — left-right split: document window + floating tools palette */}
      <div className="mx-auto flex w-full max-w-[1400px] gap-3 px-2 pt-2 pb-2">
        {/* CONSOLE — tiny terminal block in the top-left, decorative.
            Hidden on small screens. */}
        <aside className="chrome-side-rail hidden lg:flex w-[148px] flex-col gap-2 shrink-0">
          <ConsoleBlock title="console" lines={["upernavik# screendump", "upernavik# _"]} />
          <ConsoleBlock
            title="cmdtool"
            lines={["$ ls", "agents/  contracts/", "web/      mobile/"]}
          />
          <DesktopIcon label="trash" />
        </aside>

        {/* DOCUMENT — the FrameMaker window holding the newspaper. */}
        <main className="min-w-0 flex-1">
          <Window
            title="POOTER.FRM"
            subtitle="— daily-edition.po"
            ruler
            transparentBody
          >
            <div className="bg-[var(--paper)] text-[var(--ink)] mx-auto max-w-7xl px-4 py-3">
              {children}
            </div>
          </Window>
        </main>

        {/* TOOL PALETTE — right side, floating. */}
        <aside className="shrink-0 hidden md:block">
          <ToolPalette />
        </aside>
      </div>

      {/* BOTTOM STATUS BAR */}
      <div className="mx-auto w-full max-w-[1400px] px-2 pb-3">
        <StatusBar />
      </div>
    </div>
  );
}

function ConsoleBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="win">
      <div className="win-titlebar">
        <div className="win-titlebar-text">
          <span className="win-titlebar-btn" aria-hidden />
          <span>{title}</span>
        </div>
      </div>
      <div className="win-body p-1.5">
        {lines.map((l, i) => (
          <div key={i} className="font-terminal whitespace-pre">
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function DesktopIcon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 mt-2">
      <div className="h-8 w-8 border border-[var(--chrome-rule)] bg-[var(--chrome-bg)] relative">
        <div
          className="absolute inset-1"
          style={{
            backgroundImage: "var(--dither-25)",
          }}
        />
      </div>
      <span className="font-chrome-tiny text-[var(--chrome-ink)]">{label}</span>
    </div>
  );
}
