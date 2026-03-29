"use client";

import { useState, useCallback } from "react";
import type { EntityScore } from "@/lib/entity-scorer";
import { EntityScoreCard } from "./EntityScoreCard";

export function EntitySearch() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<EntityScore | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScore = useCallback(async () => {
    const identifier = input.trim();
    if (!identifier) return;

    setLoading(true);
    setError(null);
    setScore(null);

    try {
      const res = await fetch("/api/registry/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as EntityScore;
      setScore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scoring failed");
    } finally {
      setLoading(false);
    }
  }, [input]);

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleScore();
            }
          }}
          placeholder="Paste any URL, contract address, domain, or wallet..."
          className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-3 py-2.5 font-mono text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--rule)]"
        />
        <button
          onClick={() => void handleScore()}
          disabled={loading || !input.trim()}
          className="shrink-0 border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--paper)] hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {loading ? "Scoring..." : "Score"}
        </button>
      </div>

      {/* Examples */}
      <div className="flex flex-wrap gap-2">
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          Try:
        </span>
        {[
          "https://nytimes.com",
          "uniswap.org",
          "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
          "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
        ].map((example) => (
          <button
            key={example}
            onClick={() => {
              setInput(example);
              setScore(null);
              setError(null);
            }}
            className="border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[8px] text-[var(--ink-faint)] hover:border-[var(--rule)] hover:text-[var(--ink)]"
          >
            {example.length > 30 ? `${example.slice(0, 12)}...${example.slice(-6)}` : example}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="border border-[var(--accent-red)] p-3">
          <p className="font-mono text-[11px] text-[var(--accent-red)]">{error}</p>
        </div>
      )}

      {/* Score card */}
      {score && <EntityScoreCard score={score} />}
    </div>
  );
}
