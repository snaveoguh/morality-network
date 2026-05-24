"use client";

/**
 * ToolPalette — floating right-side palette.
 * FrameMaker 1.0 Tools palette: striped title bar, sections for Commands /
 * Tools / Fills / Borders / Widths. We use the same visual frame but wrap
 * the existing chrome controls (Search, Theme, Wallet, Subscribe) inside.
 *
 * The palette is collapsible — Keep Tool checkbox toggles minimised state.
 * On mobile (<768px) the palette hides via CSS; the existing Header still
 * provides those controls.
 */
import Link from "next/link";
import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SearchBar } from "@/components/layout/SearchBar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function ToolPalette() {
  const [open, setOpen] = useState(true);

  return (
    <aside
      className="chrome-tool-palette palette w-[164px] select-none"
      aria-label="Workstation tools palette"
    >
      <div className="win-titlebar">
        <div className="win-titlebar-text">
          <span className="win-titlebar-btn" aria-hidden />
          <span>Tools</span>
        </div>
      </div>

      <div className="palette-section flex items-center justify-between">
        <label className="font-chrome-tiny flex items-center gap-1">
          <input
            type="checkbox"
            checked={open}
            onChange={(e) => setOpen(e.target.checked)}
            className="h-2.5 w-2.5 accent-black"
          />
          Keep Tool
        </label>
        <span className="font-chrome-tiny text-[var(--chrome-soft)]">v1.0</span>
      </div>

      {open ? (
        <>
          <PaletteSection label="Commands">
            <div className="space-y-1">
              <PaletteLink href="/write">Write…</PaletteLink>
              <PaletteLink href="/subscribe">Subscribe…</PaletteLink>
              <PaletteLink href="/daily">Editions…</PaletteLink>
            </div>
          </PaletteSection>

          <PaletteSection label="Tools">
            <div className="space-y-1.5">
              <div className="font-chrome-tiny text-[var(--chrome-soft)]">Search</div>
              <div className="[&_input]:!h-6 [&_input]:!text-[10px] [&_input]:!border-[var(--chrome-rule)]">
                <SearchBar />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-chrome-tiny text-[var(--chrome-soft)]">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </PaletteSection>

          <PaletteSection label="Wallet">
            <div className="[&_button]:!h-6 [&_button]:!text-[10px]">
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openAccountModal,
                  openChainModal,
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
                        className="block w-full border border-[var(--chrome-rule)] bg-[var(--chrome-ink)] px-2 py-1 font-chrome text-[var(--chrome-bg)] hover:bg-[var(--chrome-bg)] hover:text-[var(--chrome-ink)]"
                      >
                        Connect…
                      </button>
                    );
                  }
                  if (chain.unsupported) {
                    return (
                      <button
                        type="button"
                        onClick={openChainModal}
                        className="block w-full border border-[var(--chrome-rule)] bg-[var(--chrome-bg)] px-2 py-1 font-chrome text-[var(--chrome-ink)]"
                      >
                        Wrong Net
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={openAccountModal}
                      className="block w-full border border-[var(--chrome-rule)] bg-[var(--chrome-bg)] px-2 py-1 font-chrome text-[var(--chrome-ink)] hover:bg-[var(--chrome-bg-2)]"
                    >
                      {account.displayName}
                    </button>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </PaletteSection>

          <PaletteSection label="Fills">
            <div className="palette-swatch-grid">
              <div className="palette-swatch palette-swatch--solid-white" title="solid" />
              <div className="palette-swatch palette-swatch--d12" title="12%" />
              <div className="palette-swatch palette-swatch--d25" title="25%" />
              <div className="palette-swatch palette-swatch--d50" title="50%" />
              <div className="palette-swatch palette-swatch--d25" title="25%" />
              <div className="palette-swatch palette-swatch--d50" title="50%" />
              <div className="palette-swatch palette-swatch--solid-black" title="black" />
              <div className="palette-swatch palette-swatch--solid-black" title="black" />
            </div>
          </PaletteSection>

          <PaletteSection label="Movement">
            <div className="space-y-0.5 font-chrome">
              <Radio name="movement" defaultChecked label="Free" />
              <Radio name="movement" label="Vert" />
              <Radio name="movement" label="Horiz" />
            </div>
          </PaletteSection>
        </>
      ) : null}
    </aside>
  );
}

function PaletteSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="palette-section">
      <span className="palette-label">{label}</span>
      {children}
    </div>
  );
}

function PaletteLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block border border-[var(--chrome-rule)] bg-[var(--chrome-bg)] px-2 py-0.5 font-chrome text-[var(--chrome-ink)] hover:bg-[var(--chrome-ink)] hover:text-[var(--chrome-bg)]"
    >
      {children}
    </Link>
  );
}

function Radio({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 cursor-default">
      <input
        type="radio"
        name={name}
        defaultChecked={defaultChecked}
        className="h-2.5 w-2.5 accent-black"
      />
      <span>{label}</span>
    </label>
  );
}
