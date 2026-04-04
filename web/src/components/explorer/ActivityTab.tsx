"use client";

import { useState } from "react";
import Link from "next/link";

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  functionName?: string;
  methodId: string;
  timestamp: number;
  isError: boolean;
  gasUsed: string;
  blockNumber: number;
}

interface ActivityTabProps {
  address: string;
  transactions: Transaction[];
  hasMore: boolean;
  onLoadMore?: () => void;
  loading?: boolean;
}

type FilterMode = "all" | "incoming" | "outgoing" | "external";

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortenHash(hash: string): string {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 10)}...`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() / 1000) - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatEthValue(weiStr: string): string {
  try {
    const wei = BigInt(weiStr);
    if (wei === BigInt(0)) return "";
    const eth = Number(wei) / 1e18;
    if (eth < 0.001) return "<0.001 ETH";
    return `${eth.toFixed(4)} ETH`;
  } catch {
    return "";
  }
}

function humanizeFunctionName(name?: string): string {
  if (!name) return "";
  // Remove args part if present
  const baseName = name.split("(")[0];
  // camelCase → spaced
  return baseName.replace(/([A-Z])/g, " $1").trim();
}

export function ActivityTab({
  address,
  transactions,
  hasMore,
  onLoadMore,
  loading = false,
}: ActivityTabProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [functionFilter, setFunctionFilter] = useState("all");

  const lowerAddress = address.toLowerCase();

  // Get unique function names for the function filter
  const functionNames = Array.from(
    new Set(
      transactions
        .map((tx) => tx.functionName?.split("(")[0])
        .filter(Boolean),
    ),
  ).sort();

  const filtered = transactions.filter((tx) => {
    // Direction filter
    if (filter === "incoming" && tx.to?.toLowerCase() !== lowerAddress) return false;
    if (filter === "outgoing" && tx.from?.toLowerCase() !== lowerAddress) return false;
    if (filter === "external" && tx.from?.toLowerCase() === lowerAddress) return false;

    // Function filter
    if (functionFilter !== "all") {
      const fnName = tx.functionName?.split("(")[0];
      if (fnName !== functionFilter) return false;
    }

    return true;
  });

  const FILTERS: { value: FilterMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "incoming", label: "Incoming" },
    { value: "outgoing", label: "Outgoing" },
    { value: "external", label: "External" },
  ];

  return (
    <div className="mt-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--rule-light)] pb-3">
        {/* Direction filters */}
        <div className="flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
          {FILTERS.map((f, i) => (
            <span key={f.value} className="flex items-center">
              {i > 0 && (
                <span className="mx-1.5 text-[var(--rule-light)]">|</span>
              )}
              <button
                onClick={() => setFilter(f.value)}
                className={`transition-colors ${
                  filter === f.value
                    ? "font-bold text-[var(--ink)] underline underline-offset-4"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {f.label}
              </button>
            </span>
          ))}
        </div>

        {/* Function filter dropdown */}
        {functionNames.length > 0 && (
          <select
            value={functionFilter}
            onChange={(e) => setFunctionFilter(e.target.value)}
            className="border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none"
          >
            <option value="all">All functions</option>
            {functionNames.map((fn) => (
              <option key={fn} value={fn}>
                {fn}()
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Transaction list */}
      <div className="divide-y divide-[var(--rule-light)]">
        {filtered.length === 0 && (
          <div className="py-8 text-center font-mono text-xs text-[var(--ink-faint)]">
            No transactions found
          </div>
        )}

        {filtered.map((tx) => {
          const isIncoming = tx.to?.toLowerCase() === lowerAddress;
          const isOutgoing = tx.from?.toLowerCase() === lowerAddress;
          const ethValue = formatEthValue(tx.value);
          const fnDisplay = tx.functionName
            ? `${humanizeFunctionName(tx.functionName)}()`
            : tx.methodId !== "0x"
              ? `${tx.methodId.slice(0, 10)}()`
              : "transfer";

          return (
            <div
              key={tx.hash}
              className="flex items-center justify-between py-2.5 hover:bg-[var(--paper-dark)]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* Direction indicator */}
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    tx.isError
                      ? "bg-[var(--accent-red)]"
                      : isIncoming
                        ? "bg-green-500"
                        : "bg-[var(--ink-faint)]"
                  }`}
                />

                {/* From address */}
                <Link
                  href={`/address/${tx.from}`}
                  className="font-mono text-xs text-[var(--ink-light)] hover:text-[var(--ink)] hover:underline"
                >
                  {shortenAddress(tx.from)}
                </Link>

                {/* Action */}
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  called
                </span>

                {/* Function name */}
                <span className="font-mono text-xs text-[var(--ink)]">
                  {fnDisplay}
                </span>

                {/* Target (if different from this address) */}
                {tx.to && tx.to.toLowerCase() !== lowerAddress && (
                  <>
                    <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                      on
                    </span>
                    <Link
                      href={`/address/${tx.to}`}
                      className="font-mono text-xs text-[var(--ink-light)] hover:text-[var(--ink)] hover:underline"
                    >
                      {shortenAddress(tx.to)}
                    </Link>
                  </>
                )}

                {/* Reverted badge */}
                {tx.isError && (
                  <span className="font-mono text-[9px] text-[var(--accent-red)]">
                    reverted
                  </span>
                )}
              </div>

              {/* Right side: value + time */}
              <div className="flex shrink-0 items-center gap-4 text-right">
                {ethValue && (
                  <span className="font-mono text-xs text-[var(--ink-light)]">
                    {ethValue}
                  </span>
                )}
                <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                  {timeAgo(tx.timestamp)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="border border-[var(--rule-light)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
