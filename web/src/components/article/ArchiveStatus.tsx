"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { keccak256, toBytes, type Address } from "viem";
import { CONTRACTS, COMMENTS_ABI } from "@/lib/contracts";

interface ArchiveStatusProps {
  entityHash: string;
  generatedBy: "claude-ai" | "template-fallback";
  generatedAt: string;
  contentHash: string;
  onchainTxHash?: string;
}

export function ArchiveStatus({
  entityHash,
  generatedBy,
  generatedAt,
  contentHash,
  onchainTxHash: initialTxHash,
}: ArchiveStatusProps) {
  const { isConnected } = useAccount();
  const [txHash, setTxHash] = useState(initialTxHash);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  const handleArchiveToChain = useCallback(async () => {
    if (!contentHash) {
      setError("No content hash — editorial may not be saved yet");
      return;
    }

    setIsArchiving(true);
    setError(null);

    try {
      const hash = await writeContractAsync({
        address: CONTRACTS.comments as Address,
        abi: COMMENTS_ABI,
        functionName: "commentStructured",
        args: [
          entityHash as `0x${string}`,
          "Editorial archive v1 — content hash verified",
          BigInt(0), // parentId
          3, // argumentType: EVIDENCE
          BigInt(0), // referenceCommentId
          contentHash as `0x${string}`, // evidenceHash
        ],
      });

      setTxHash(hash);

      // Persist the tx hash to the editorial archive
      try {
        await fetch("/api/editorial/mark-onchain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityHash, txHash: hash }),
        });
      } catch {
        // Non-critical — the tx is already onchain
        console.warn("[archive-status] failed to persist txHash");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Transaction failed",
      );
    } finally {
      setIsArchiving(false);
    }
  }, [entityHash, contentHash, writeContractAsync]);

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--rule-light)] pt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
      {/* Generation badge */}
      <span
        className={`border px-1.5 py-0.5 ${
          generatedBy === "claude-ai"
            ? "border-[var(--ink)] text-[var(--ink)]"
            : "border-[var(--rule-light)] text-[var(--ink-faint)]"
        }`}
      >
        {generatedBy === "claude-ai" ? "AI Editorial" : "Template"}
      </span>

      {/* Archived badge */}
      {formattedDate && (
        <span className="text-[var(--ink-faint)]">
          Archived {formattedDate}
        </span>
      )}

      {/* Onchain verification */}
      {txHash ? (
        <a
          href={`https://sepolia.basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-[var(--ink)] px-1.5 py-0.5 text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {isConfirming ? "Confirming..." : "Verified Onchain"}
        </a>
      ) : isConnected && contentHash ? (
        <button
          onClick={handleArchiveToChain}
          disabled={isArchiving}
          className="ml-auto border border-[var(--ink)] px-2 py-0.5 text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isArchiving ? "Archiving..." : "Archive to Chain"}
        </button>
      ) : null}

      {/* Error display */}
      {error && (
        <span className="text-[var(--accent-red)] normal-case">
          {error.length > 60 ? error.slice(0, 60) + "..." : error}
        </span>
      )}
    </div>
  );
}
