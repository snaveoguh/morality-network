"use client";

import { useState, useMemo, useCallback } from "react";
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Abi, AbiFunction } from "viem";

/* ── Helpers ── */

function camelToTitle(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function soliditySig(fn: AbiFunction): string {
  const params = fn.inputs.map((i) => i.type).join(", ");
  return `${fn.name}(${params})`;
}

/* ── Interface detection heuristics ── */

const KNOWN_INTERFACES: Record<string, string[]> = {
  "ERC-721": [
    "balanceOf", "ownerOf", "tokenURI", "approve", "getApproved",
    "setApprovalForAll", "isApprovedForAll", "transferFrom",
    "safeTransferFrom",
  ],
  "ERC-20": [
    "totalSupply", "balanceOf", "transfer", "allowance", "approve", "transferFrom",
    "name", "symbol", "decimals",
  ],
  "ERC-1155": [
    "balanceOf", "balanceOfBatch", "setApprovalForAll", "isApprovedForAll",
    "safeTransferFrom", "safeBatchTransferFrom", "uri",
  ],
  Ownable: ["owner", "renounceOwnership", "transferOwnership"],
  Pausable: ["paused", "pause", "unpause"],
  "UUPS Upgradeable": ["proxiableUUID", "upgradeTo", "upgradeToAndCall"],
};

function groupFunctions(fns: AbiFunction[]): Record<string, AbiFunction[]> {
  const nameSet = new Set(fns.map((f) => f.name));
  const assigned = new Set<string>();
  const groups: Record<string, AbiFunction[]> = {};

  for (const [label, signatures] of Object.entries(KNOWN_INTERFACES)) {
    const matchCount = signatures.filter((s) => nameSet.has(s)).length;
    // Require at least 60% match to label the group
    if (matchCount >= Math.ceil(signatures.length * 0.6)) {
      const matched = fns.filter(
        (f) => signatures.includes(f.name) && !assigned.has(f.name)
      );
      if (matched.length > 0) {
        groups[label] = matched;
        matched.forEach((f) => assigned.add(f.name));
      }
    }
  }

  const remaining = fns.filter((f) => !assigned.has(f.name));
  if (remaining.length > 0) {
    groups["Other"] = remaining;
  }

  return groups;
}

/* ── Types ── */

interface AbiPanelProps {
  abi: any[];
  address: string;
  mode: "read" | "write";
}

/* ── Function Form ── */

function FunctionForm({
  fn,
  address,
  mode,
}: {
  fn: AbiFunction;
  address: string;
  mode: "read" | "write";
}) {
  const publicClient = usePublicClient({ chainId: 8453 });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    writeContract,
    data: txHash,
    isPending: writePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: 8453,
      query: { enabled: !!txHash },
    });

  const setInput = useCallback(
    (name: string, value: string) => {
      setInputs((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  function parseArg(type: string, raw: string): unknown {
    if (type === "bool") return raw === "true" || raw === "1";
    if (type.startsWith("uint") || type.startsWith("int")) return BigInt(raw);
    if (type === "address") return raw as `0x${string}`;
    if (type.endsWith("[]")) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw.split(",").map((s) => s.trim());
      }
    }
    if (type === "bytes" || type.startsWith("bytes")) return raw as `0x${string}`;
    return raw;
  }

  async function handleRead() {
    if (!publicClient) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const args = fn.inputs.map((inp) =>
        parseArg(inp.type, inputs[inp.name || ""] || "")
      );
      const data = await publicClient.readContract({
        address: address as `0x${string}`,
        abi: [fn] as Abi,
        functionName: fn.name,
        args: args.length > 0 ? args : undefined,
      });
      setResult(formatResult(data));
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  function handleWrite() {
    resetWrite();
    setError(null);
    try {
      const args = fn.inputs.map((inp) =>
        parseArg(inp.type, inputs[inp.name || ""] || "")
      );
      writeContract({
        chainId: 8453,
        address: address as `0x${string}`,
        abi: [fn] as Abi,
        functionName: fn.name,
        args: args.length > 0 ? args : undefined,
      });
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || String(err));
    }
  }

  function formatResult(data: unknown): string {
    if (data === undefined || data === null) return "null";
    if (typeof data === "bigint") return data.toString();
    if (Array.isArray(data)) return data.map(formatResult).join(", ");
    if (typeof data === "object") return JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
    return String(data);
  }

  const isRead = mode === "read";
  const busy = isRead ? loading : writePending || isConfirming;

  return (
    <div>
      {/* Inputs */}
      {fn.inputs.length > 0 && (
        <div className="mt-3 space-y-2">
          {fn.inputs.map((inp, i) => (
            <div key={i}>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] mb-0.5">
                {inp.name || `arg${i}`}{" "}
                <span className="text-[var(--ink-light)]">({inp.type})</span>
              </label>
              <input
                type="text"
                value={inputs[inp.name || ""] || ""}
                onChange={(e) => setInput(inp.name || `arg${i}`, e.target.value)}
                placeholder={inp.type}
                className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1.5 font-mono text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--rule)] focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* Action button */}
      <button
        onClick={isRead ? handleRead : handleWrite}
        disabled={busy}
        className="mt-3 border border-[var(--rule)] bg-[var(--paper-dark)] px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40 transition-colors"
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 animate-spin border border-current border-t-transparent" />
            {isRead ? "Reading..." : isConfirming ? "Confirming..." : "Sending..."}
          </span>
        ) : isRead ? (
          "Read"
        ) : (
          "Send Transaction"
        )}
      </button>

      {/* Results */}
      {result !== null && (
        <div className="mt-3 border-t border-[var(--rule-light)] pt-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            Result
            {fn.outputs.length > 0 && (
              <> &rarr; {fn.outputs.map((o) => o.type).join(", ")}</>
            )}
          </span>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-[var(--ink)]">
            {result}
          </pre>
        </div>
      )}

      {/* Transaction hash */}
      {txHash && (
        <div className="mt-2 border-t border-[var(--rule-light)] pt-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            Tx Hash
          </span>
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate font-mono text-xs text-[var(--accent-red)] underline"
          >
            {txHash}
          </a>
          {isConfirmed && (
            <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
              Confirmed
            </span>
          )}
        </div>
      )}

      {/* Errors */}
      {(error || writeError) && (
        <div className="mt-2 border-t border-[var(--rule-light)] pt-2">
          <span className="font-mono text-[10px] text-[var(--accent-red)]">
            {error ||
              (writeError as { shortMessage?: string })?.shortMessage ||
              writeError?.message}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Main Panel ── */

export function AbiPanel({ abi, address, mode }: AbiPanelProps) {
  const functions = useMemo(() => {
    const items = (abi as AbiFunction[]).filter(
      (item) => item.type === "function"
    );
    if (mode === "read") {
      return items.filter(
        (f) => f.stateMutability === "view" || f.stateMutability === "pure"
      );
    }
    return items.filter(
      (f) =>
        f.stateMutability === "nonpayable" || f.stateMutability === "payable"
    );
  }, [abi, mode]);

  const groups = useMemo(() => groupFunctions(functions), [functions]);
  const groupNames = Object.keys(groups);

  const [selectedFn, setSelectedFn] = useState<string | null>(
    functions[0]?.name ?? null
  );

  const activeFn = functions.find((f) => f.name === selectedFn) ?? null;

  if (functions.length === 0) {
    return (
      <p className="py-8 text-center font-mono text-xs text-[var(--ink-faint)]">
        No {mode === "read" ? "read" : "write"} functions found in ABI.
      </p>
    );
  }

  return (
    <div className="flex min-h-[320px] border border-[var(--rule-light)]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 overflow-y-auto border-r border-[var(--rule-light)] bg-[var(--paper-dark)]">
        {groupNames.map((group) => (
          <div key={group}>
            {/* Group header */}
            <div className="flex items-center gap-2 border-b border-[var(--rule-light)] px-3 py-1.5">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
                {group}
              </span>
              <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                ({groups[group].length})
              </span>
            </div>
            {/* Function list */}
            {groups[group].map((fn) => (
              <button
                key={fn.name}
                onClick={() => setSelectedFn(fn.name)}
                className={`block w-full px-3 py-1.5 text-left font-mono text-[11px] transition-colors ${
                  selectedFn === fn.name
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--ink)] hover:bg-[var(--paper-tint)]"
                }`}
              >
                {fn.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Detail pane */}
      <div className="flex-1 p-4">
        {activeFn ? (
          <>
            <h3 className="font-headline-serif text-lg text-[var(--ink)]">
              {camelToTitle(activeFn.name)}
            </h3>
            <code className="mt-0.5 block font-mono text-[11px] text-[var(--ink-light)]">
              {soliditySig(activeFn)}
            </code>
            {activeFn.outputs.length > 0 && (
              <span className="mt-1 block font-mono text-[10px] text-[var(--ink-faint)]">
                returns ({activeFn.outputs.map((o) => `${o.type}${o.name ? " " + o.name : ""}`).join(", ")})
              </span>
            )}
            <FunctionForm fn={activeFn} address={address} mode={mode} />
          </>
        ) : (
          <p className="py-8 text-center font-mono text-xs text-[var(--ink-faint)]">
            Select a function from the sidebar.
          </p>
        )}
      </div>
    </div>
  );
}
