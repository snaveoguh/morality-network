"use client";

import { useEffect, useState } from "react";

function nextDropAt(): Date {
  // Next drop = next 00:00 UTC.
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  return next;
}

function format(msTotal: number): { h: string; m: string; s: string } {
  const total = Math.max(0, Math.floor(msTotal / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

export function Countdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return (
      <div className="font-headline text-5xl sm:text-6xl lg:text-7xl text-[var(--ink)]">
        --:--:--
      </div>
    );
  }

  const { h, m, s } = format(nextDropAt().getTime() - now);

  return (
    <div className="flex items-baseline justify-center gap-2 sm:gap-4 font-headline text-5xl sm:text-6xl lg:text-7xl text-[var(--ink)]">
      <span>{h}</span>
      <span className="text-[var(--ink-faint)] text-3xl sm:text-4xl lg:text-5xl">:</span>
      <span>{m}</span>
      <span className="text-[var(--ink-faint)] text-3xl sm:text-4xl lg:text-5xl">:</span>
      <span>{s}</span>
    </div>
  );
}
