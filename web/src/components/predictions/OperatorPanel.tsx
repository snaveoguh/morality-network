"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_CHAIN_ID,
} from "@/lib/contracts";
import { formatEth } from "@/lib/entity";

interface OpsEntry {
  daoKey: string;
  daoLabel: string;
  proposalId: string;
  title: string;
  status: string;
  marketExists: boolean;
  outcome: number;
  totalPoolWei: string;
  operatorAction: string;
}

export function OperatorPanel() {
  const { address } = useAccount();
  const [entries, setEntries] = useState<OpsEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch("/api/predictions/ops?limit=25")
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) return null;

  const needsResolve = entries.filter((e) => e.operatorAction === "resolve-market");
  const resolved = entries.filter((e) => e.operatorAction === "resolved");

  if (loading) {
    return (
      <section className="mb-8 border-t-2 border-[var(--rule)] pt-6">
        <p className="font-mono text-[9px] text-[var(--ink-faint)]">Loading operator data...</p>
      </section>
    );
  }

  if (needsResolve.length === 0 && resolved.length === 0) {
    return null;
  }

  return (
    <section className="mb-8 border-t-2 border-[var(--rule)] pt-6">
      <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
        Operator Panel
      </h2>
      <p className="mb-4 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        Markets auto-create on first wager &mdash; resolve is permissionless for configured DAOs
      </p>

      {needsResolve.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent-red)]">
            Needs Resolution ({needsResolve.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[9px]">
              <thead>
                <tr className="border-b border-[var(--rule)] text-left text-[var(--ink-faint)]">
                  <th className="py-1 pr-3">DAO</th>
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Title</th>
                  <th className="py-1 pr-3">Pool</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {needsResolve.map((e) => (
                  <tr key={`${e.daoKey}-${e.proposalId}`} className="border-b border-[var(--rule-light)]">
                    <td className="py-1.5 pr-3 text-[var(--ink-light)]">{e.daoLabel}</td>
                    <td className="py-1.5 pr-3">{e.proposalId}</td>
                    <td className="max-w-[200px] truncate py-1.5 pr-3 text-[var(--ink-light)]">{e.title}</td>
                    <td className="py-1.5 pr-3">{formatEth(BigInt(e.totalPoolWei))}</td>
                    <td className="py-1.5 pr-3 uppercase text-[var(--ink-faint)]">{e.status}</td>
                    <td className="py-1.5">
                      <ResolveButton daoKey={e.daoKey} proposalId={e.proposalId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h3 className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            Already Resolved ({resolved.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[9px]">
              <thead>
                <tr className="border-b border-[var(--rule)] text-left text-[var(--ink-faint)]">
                  <th className="py-1 pr-3">DAO</th>
                  <th className="py-1 pr-3">#</th>
                  <th className="py-1 pr-3">Title</th>
                  <th className="py-1 pr-3">Pool</th>
                  <th className="py-1">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((e) => (
                  <tr key={`${e.daoKey}-${e.proposalId}`} className="border-b border-[var(--rule-light)]">
                    <td className="py-1.5 pr-3 text-[var(--ink-light)]">{e.daoLabel}</td>
                    <td className="py-1.5 pr-3">{e.proposalId}</td>
                    <td className="max-w-[200px] truncate py-1.5 pr-3 text-[var(--ink-light)]">{e.title}</td>
                    <td className="py-1.5 pr-3">{formatEth(BigInt(e.totalPoolWei))}</td>
                    <td className="py-1.5">
                      <span className={e.outcome === 1 ? "text-[var(--ink)]" : e.outcome === 2 ? "text-[var(--accent-red)]" : "text-[var(--ink-faint)]"}>
                        {OUTCOME_LABEL[e.outcome] ?? "?"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

const OUTCOME_LABEL: Record<number, string> = { 1: "PASSED", 2: "FAILED", 3: "VOID" };

function ResolveButton({ daoKey, proposalId }: { daoKey: string; proposalId: string }) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: PREDICTION_MARKET_CHAIN_ID,
    query: { enabled: !!txHash },
  });

  if (isSuccess) return <span className="text-[var(--ink)]">Resolved</span>;

  return (
    <div>
      <button
        onClick={() =>
          writeContract({
            chainId: PREDICTION_MARKET_CHAIN_ID,
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: "resolve",
            args: [daoKey, proposalId],
          })
        }
        disabled={isPending || isConfirming}
        className="border border-[var(--accent-red)] px-2 py-0.5 text-[var(--accent-red)] transition-colors hover:bg-[var(--accent-red)] hover:text-[var(--paper)] disabled:opacity-50"
      >
        {isPending ? "Sign..." : isConfirming ? "Confirming..." : "Resolve"}
      </button>
      {error && (
        <p className="mt-0.5 text-[8px] text-[var(--accent-red)]">
          {(error as { shortMessage?: string }).shortMessage || error.message}
        </p>
      )}
    </div>
  );
}
