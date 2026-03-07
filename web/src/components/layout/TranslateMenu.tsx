"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "zh-CN", label: "中文 (简体)" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ru", label: "Русский" },
] as const;

const STORAGE_KEY = "pooter.translate.lang";

function resolveSourceUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes("translate.google") && parsed.pathname.includes("/translate")) {
      const original = parsed.searchParams.get("u");
      if (original) return original;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function buildGoogleTranslateUrl(sourceUrl: string, targetLang: string): string {
  return `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(targetLang)}&u=${encodeURIComponent(sourceUrl)}`;
}

export function TranslateMenu() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("en");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    setSelected(saved);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      window.addEventListener("mousedown", onPointerDown);
    }

    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const selectedLabel = useMemo(() => {
    return LANGUAGES.find((l) => l.code === selected)?.label || "English";
  }, [selected]);

  function translateTo(code: string) {
    const sourceUrl = resolveSourceUrl(window.location.href);

    window.localStorage.setItem(STORAGE_KEY, code);
    setSelected(code);
    setOpen(false);

    if (code === "en") {
      window.location.href = sourceUrl;
      return;
    }

    window.location.href = buildGoogleTranslateUrl(sourceUrl, code);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1 border border-[var(--rule-light)] px-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--rule)] hover:text-[var(--ink)]"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Translate (${selectedLabel})`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M3 5h12M9 5c0 7-3.5 11-6 13" />
          <path d="M6 12c1.2 1.8 2.7 3.3 4.5 4.5" />
          <path d="M13 19h8" />
          <path d="M17 5l4 14" />
          <path d="M13 19l4-14" />
        </svg>
        <span className="hidden sm:inline">Translate</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[9999] mt-1.5 w-44 border border-[var(--rule)] bg-[var(--paper)] p-1.5 shadow-lg">
          <p className="px-1 pb-1 font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            Language
          </p>
          <div className="max-h-56 overflow-auto" role="menu" aria-label="Translate page">
            {LANGUAGES.map((lang) => {
              const active = lang.code === selected;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => translateTo(lang.code)}
                  className={`block w-full px-1.5 py-1 text-left font-body-serif text-xs transition-colors ${
                    active
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "text-[var(--ink-light)] hover:bg-[var(--paper-dark)]"
                  }`}
                  role="menuitem"
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
