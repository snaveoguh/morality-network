"use client";

import { useState, type CSSProperties } from "react";

/* ============================================================================
   TYPOGRAPHY LAB — Variable-axis font candidates
   ============================================================================
   Three fonts side-by-side, each demonstrating the Benji Taylor effect:
   sidebar nav items where labels morph (heavier + wider) on hover & selected.
   ========================================================================= */

type Axis = { tag: string; min: number; max: number; default: number };

interface FontDef {
  id: string;
  name: string;
  cssVar: string;
  blurb: string;
  axes: Axis[];
  // Three preset hover targets — subtle / medium / dramatic
  presets: Array<{
    label: string;
    rest: Record<string, number>;
    hover: Record<string, number>;
  }>;
}

const FONTS: FontDef[] = [
  {
    id: "mona",
    name: "Mona Sans",
    cssVar: "var(--font-mona)",
    blurb:
      "GitHub's variable workhorse. wght × wdth. Modern, neutral, plays well with editorial serifs.",
    axes: [
      { tag: "wght", min: 200, max: 900, default: 400 },
      { tag: "wdth", min: 75, max: 125, default: 100 },
    ],
    presets: [
      {
        label: "Subtle",
        rest: { wght: 400, wdth: 100 },
        hover: { wght: 600, wdth: 105 },
      },
      {
        label: "Medium",
        rest: { wght: 400, wdth: 100 },
        hover: { wght: 750, wdth: 115 },
      },
      {
        label: "Dramatic",
        rest: { wght: 300, wdth: 90 },
        hover: { wght: 900, wdth: 125 },
      },
    ],
  },
  {
    id: "recursive",
    name: "Recursive",
    cssVar: "var(--font-recursive)",
    blurb:
      "Multi-axis personality. wght × CASL (casual) × MONO × slnt. No wdth — uses CASL for character morph.",
    axes: [
      { tag: "wght", min: 300, max: 1000, default: 400 },
      { tag: "CASL", min: 0, max: 1, default: 0 },
      { tag: "MONO", min: 0, max: 1, default: 0 },
      { tag: "slnt", min: -15, max: 0, default: 0 },
    ],
    presets: [
      {
        label: "Subtle",
        rest: { wght: 400, CASL: 0 },
        hover: { wght: 600, CASL: 0.25 },
      },
      {
        label: "Medium",
        rest: { wght: 400, CASL: 0 },
        hover: { wght: 800, CASL: 0.5 },
      },
      {
        label: "Dramatic",
        rest: { wght: 300, CASL: 0, slnt: 0 },
        hover: { wght: 1000, CASL: 1, slnt: -8 },
      },
    ],
  },
  {
    id: "roboto-flex",
    name: "Roboto Flex",
    cssVar: "var(--font-roboto-flex)",
    blurb:
      "Most axes (13). wght × wdth × opsz × GRAD × slnt. Most flexible, slightly generic.",
    axes: [
      { tag: "wght", min: 100, max: 1000, default: 400 },
      { tag: "wdth", min: 25, max: 151, default: 100 },
      { tag: "opsz", min: 8, max: 144, default: 14 },
      { tag: "GRAD", min: -200, max: 150, default: 0 },
      { tag: "slnt", min: -10, max: 0, default: 0 },
    ],
    presets: [
      {
        label: "Subtle",
        rest: { wght: 400, wdth: 100 },
        hover: { wght: 600, wdth: 105 },
      },
      {
        label: "Medium",
        rest: { wght: 400, wdth: 100 },
        hover: { wght: 800, wdth: 120 },
      },
      {
        label: "Dramatic",
        rest: { wght: 300, wdth: 75, GRAD: -100 },
        hover: { wght: 1000, wdth: 151, GRAD: 150 },
      },
    ],
  },
];

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "explore", label: "Explore", icon: SearchIcon },
  { id: "notifications", label: "Notifications", icon: BellIcon, badge: 5 },
  { id: "chat", label: "Chat", icon: ChatIcon },
];

function fvs(values: Record<string, number>): string {
  return Object.entries(values)
    .map(([tag, val]) => `'${tag}' ${val}`)
    .join(", ");
}

export default function TypographyLab() {
  return (
    <main className="mx-auto max-w-6xl py-8 px-4">
      {/* Header */}
      <header className="mb-8 border-b-2 border-[var(--rule)] pb-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Brand &middot; Typography Lab
        </p>
        <h1 className="font-headline text-3xl text-[var(--ink)] md:text-5xl">
          Variable-axis font candidates
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base text-[var(--ink-light)]">
          Hover the nav items below to feel each font's morph. The goal: a
          hover/selected state that feels alive without screaming. Pick one — we
          ship it as the body sans alongside the existing serif stack.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span>Reference: Benji Taylor &mdash;</span>
          <a
            href="https://twitter.com/benjitaylor"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--ink-light)] underline underline-offset-2 hover:text-[var(--ink)]"
          >
            @benjitaylor
          </a>
        </div>
      </header>

      {/* Font sections */}
      <div className="space-y-12">
        {FONTS.map((font) => (
          <FontSection key={font.id} font={font} />
        ))}
      </div>

      {/* Footer / decision tracker */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-6 pb-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Decision
        </p>
        <p className="mt-2 font-body-serif text-base italic text-[var(--ink-light)]">
          Test each one for ~30 seconds. Whichever you can't stop mousing over,
          that's the pick.
        </p>
      </footer>
    </main>
  );
}

/* ── Font section ──────────────────────────────────────────────────────── */

function FontSection({ font }: { font: FontDef }) {
  const fontStyle: CSSProperties = { fontFamily: font.cssVar };

  return (
    <section className="border border-[var(--rule-light)] bg-[var(--paper-dark)]/30">
      {/* Section header */}
      <div className="flex flex-col gap-2 border-b border-[var(--rule-light)] px-6 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-3xl text-[var(--ink)] md:text-4xl"
            style={{
              ...fontStyle,
              fontVariationSettings: fvs({ wght: 800 }),
            }}
          >
            {font.name}
          </h2>
          <p
            className="mt-1 max-w-2xl text-sm text-[var(--ink-light)]"
            style={fontStyle}
          >
            {font.blurb}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {font.axes.map((axis) => (
            <span
              key={axis.tag}
              className="border border-[var(--rule-light)] px-1.5 py-0.5"
            >
              {axis.tag} {axis.min}–{axis.max}
            </span>
          ))}
        </div>
      </div>

      {/* Three presets side-by-side */}
      <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
        {font.presets.map((preset, idx) => (
          <PresetColumn
            key={preset.label}
            preset={preset}
            fontStyle={fontStyle}
            isLast={idx === font.presets.length - 1}
          />
        ))}
      </div>

      {/* Manual axis playground */}
      <AxisPlayground font={font} fontStyle={fontStyle} />
    </section>
  );
}

/* ── Preset column with sidebar nav demo ──────────────────────────────── */

function PresetColumn({
  preset,
  fontStyle,
  isLast,
}: {
  preset: FontDef["presets"][number];
  fontStyle: CSSProperties;
  isLast: boolean;
}) {
  const [selected, setSelected] = useState("notifications");

  return (
    <div
      className={`px-6 py-6 md:py-8 ${
        !isLast ? "md:border-r border-[var(--rule-light)]" : ""
      } ${"border-b md:border-b-0 border-[var(--rule-light)]"}`}
    >
      <p className="mb-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
        {preset.label} &middot; rest {fvs(preset.rest)} &rarr; hover{" "}
        {fvs(preset.hover)}
      </p>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isSelected = selected === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              className={`group relative flex items-center gap-3 rounded-full px-3 py-2 text-left text-xl transition-all duration-300 ease-out md:text-2xl ${
                isSelected
                  ? "bg-[var(--ink)]/8 text-[var(--ink)]"
                  : "text-[var(--ink-light)] hover:text-[var(--ink)]"
              }`}
              style={{
                ...fontStyle,
                fontVariationSettings: fvs(
                  isSelected ? preset.hover : preset.rest,
                ),
                transition:
                  "font-variation-settings 300ms ease-out, color 200ms, background-color 200ms",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.fontVariationSettings = fvs(
                    preset.hover,
                  );
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.fontVariationSettings = fvs(
                    preset.rest,
                  );
                }
              }}
            >
              <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
                <Icon active={isSelected} />
                {item.badge ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent-red)] px-1 font-mono text-[9px] font-bold text-[var(--paper)]">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ── Axis playground (live sliders) ───────────────────────────────────── */

function AxisPlayground({
  font,
  fontStyle,
}: {
  font: FontDef;
  fontStyle: CSSProperties;
}) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(font.axes.map((a) => [a.tag, a.default])),
  );

  const update = (tag: string, val: number) => {
    setValues((v) => ({ ...v, [tag]: val }));
  };

  return (
    <div className="border-t border-[var(--rule-light)] bg-[var(--paper)] px-6 py-6">
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
        Live axis playground
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Sample */}
        <div className="flex items-center">
          <p
            className="text-3xl leading-tight text-[var(--ink)] md:text-4xl"
            style={{
              ...fontStyle,
              fontVariationSettings: fvs(values),
            }}
          >
            The quick brown fox jumps over the lazy dog
          </p>
        </div>

        {/* Sliders */}
        <div className="space-y-3">
          {font.axes.map((axis) => (
            <div key={axis.tag} className="flex items-center gap-3">
              <label className="w-12 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
                {axis.tag}
              </label>
              <input
                type="range"
                min={axis.min}
                max={axis.max}
                step={axis.tag === "CASL" ? 0.05 : 1}
                value={values[axis.tag]}
                onChange={(e) => update(axis.tag, Number(e.target.value))}
                className="flex-1 accent-[var(--ink)]"
              />
              <span className="w-12 text-right font-mono text-[10px] text-[var(--ink-faint)]">
                {values[axis.tag]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.4 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1Z" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.4 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.4 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" />
    </svg>
  );
}
