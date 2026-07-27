"use client";

import { useState } from "react";

type State = "idle" | "sending" | "sent" | "error";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setMessage("");

    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(body?.error ?? "Something went wrong. Try again.");
        return;
      }
      setState("sent");
      setMessage(body?.message ?? "Check your inbox.");
    } catch {
      setState("error");
      setMessage("Could not reach the server. Try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
        <p className="font-headline text-lg leading-tight">Check your inbox</p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-light)]">{message}</p>
        <p className="mt-4 text-xs leading-relaxed text-[var(--ink-faint)]">
          The link works once and expires in 20 minutes.
        </p>
        <button
          type="button"
          onClick={() => {
            setState("idle");
            setMessage("");
          }}
          className="mt-4 text-xs uppercase tracking-[0.14em] text-[var(--accent-red)] underline underline-offset-4"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
      <label
        htmlFor="account-email"
        className="block text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]"
      >
        Email address
      </label>
      <input
        id="account-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-2 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-3 text-base text-[var(--ink)] outline-none focus:border-[var(--accent-red)]"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="mt-4 w-full bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state === "error" && (
        <p className="mt-3 text-sm text-[var(--accent-red)]">{message}</p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-[var(--ink-faint)]">
        Use the address you registered with on morality.network. No password —
        we send a one-time link.
      </p>
    </form>
  );
}
