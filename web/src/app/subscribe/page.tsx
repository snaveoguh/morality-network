"use client";

import { useState } from "react";
import Link from "next/link";

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong");
        return;
      }

      // The API answers the same way for every address: nothing is subscribed
      // until the emailed link is confirmed.
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Try again.");
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <div className="text-center">
        <p className="mb-2 font-mono text-[8px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Free · Daily · No spam
        </p>
        <h1 className="mb-3 font-headline text-4xl font-bold tracking-tight">
          The Daily Pooter
        </h1>
        <p className="mb-8 font-serif text-base leading-relaxed text-[var(--ink-light,#555)]">
          Morning intelligence brief. Top stories, market signals, trading activity,
          and AI predictions — delivered to your inbox before the coffee cools.
        </p>
      </div>

      {status === "success" ? (
        <div className="border-2 border-[var(--ink)] p-6 text-center">
          <p className="mb-2 font-headline text-xl font-bold">Check your inbox.</p>
          <p className="font-serif text-sm text-[var(--ink-light,#555)]">
            We&apos;ve sent a confirmation link to {email.trim()}. You won&apos;t receive the
            briefing until you open it and confirm.
          </p>
          <p className="mt-3 font-serif text-sm text-[var(--ink-light,#555)]">
            If this address is already subscribed, there is nothing more to do and no
            email will arrive.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            &larr; Back to pooter.world
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="flex-1 border-2 border-[var(--ink)] bg-transparent px-4 py-3 font-mono text-sm outline-none placeholder:text-[var(--ink-faint)] focus:bg-[var(--paper-dark)]"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="border-2 border-[var(--ink)] bg-[var(--ink)] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--paper)] transition-colors hover:bg-transparent hover:text-[var(--ink)] disabled:opacity-40"
          >
            {status === "loading" ? "Subscribing..." : "Subscribe"}
          </button>
        </form>
      )}

      {status === "error" && (
        <p className="mt-3 font-mono text-[10px] text-[var(--accent-red)]">{errorMsg}</p>
      )}

      {/* What you get */}
      <div className="mt-12 border-t border-[var(--rule)] pt-8">
        <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em]">
          What&apos;s inside
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { icon: "01", label: "Global Radar", desc: "Top stories from 80+ sources" },
            { icon: "02", label: "Market Pulse", desc: "Positions, P&L, win rate" },
            { icon: "03", label: "Signal Desk", desc: "Active signals + confidence" },
            { icon: "04", label: "Predictions", desc: "AI takes on what happens next" },
            { icon: "05", label: "On-Chain", desc: "Ratings, tips, entity activity" },
            { icon: "06", label: "Editorial", desc: "pooter1's daily analysis" },
          ].map((item) => (
            <div key={item.icon} className="border-l-2 border-[var(--rule)] pl-3">
              <span className="block font-mono text-[8px] text-[var(--ink-faint)]">
                {item.icon}
              </span>
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider">
                {item.label}
              </span>
              <span className="block font-mono text-[8px] text-[var(--ink-faint)]">
                {item.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-10 font-mono text-[8px] text-[var(--ink-faint)] leading-relaxed">
        The Daily Pooter contains AI-generated analysis and autonomous trading signals.
        This is not financial advice. All market data and predictions are for informational
        and entertainment purposes only. Unsubscribe anytime.
      </p>
    </main>
  );
}
