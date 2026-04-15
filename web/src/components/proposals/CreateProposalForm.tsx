"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, CONTRACTS_CHAIN_ID, COMMENTS_ABI } from "@/lib/contracts";
import { computeEntityHash } from "@/lib/entity";

/**
 * CreateProposalForm — Creates a governance proposal as an onchain entity.
 *
 * A "proposal" is just an entity (hashed from a canonical identifier) with
 * a first comment that uses the [CLAIM] argument type. This reuses the
 * existing Comments contract and structured comment infrastructure.
 *
 * The canonical identifier is: "pooter-proposal:{title-slug}"
 * Anyone can then argue on it using the CommentThread component
 * with [CLAIM], [COUNTER], [EVIDENCE], and [SOURCE] argument types.
 */

export function CreateProposalForm({ onCreated }: { onCreated?: () => void }) {
  const { isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  if (isSuccess) {
    setTitle("");
    setBody("");
    setExpanded(false);
    reset();
    onCreated?.();
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  const identifier = `pooter-proposal:${slug}`;
  const entityHash = slug ? computeEntityHash(identifier) : null;

  const handleSubmit = () => {
    if (!entityHash || !body.trim()) return;

    const content = `${title}\n\n${body.trim()}`;
    const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

    writeContract({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "commentStructured",
      args: [entityHash, content, BigInt(0), 1, BigInt(0), ZERO_HASH],
      chainId: CONTRACTS_CHAIN_ID,
    });
  };

  if (!isConnected) return null;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mb-4 border border-[var(--rule)] px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        Create Proposal
      </button>
    );
  }

  return (
    <div className="mb-6 border border-[var(--rule)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">
          New Proposal
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        >
          Cancel
        </button>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Proposal title"
        maxLength={120}
        className="mb-2 w-full border border-[var(--rule-light)] bg-transparent px-3 py-2 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="State your case. What should change and why? Be specific — name the problem, the proposed solution, and what it costs."
        rows={4}
        className="mb-2 w-full border border-[var(--rule-light)] bg-transparent px-3 py-2 font-mono text-[9px] leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--ink)]"
      />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[7px] text-[var(--ink-faint)]">
          Posted as [CLAIM] onchain via Comments contract. Others can argue with [COUNTER] and [EVIDENCE].
        </span>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || isConfirming || !title.trim() || !body.trim()}
          className="border border-[var(--ink)] px-4 py-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "Signing..." : isConfirming ? "Confirming..." : "Submit Onchain"}
        </button>
      </div>

      {writeError && (
        <p className="mt-2 font-mono text-[8px] text-[var(--accent-red)]">
          {writeError.message.slice(0, 120)}
        </p>
      )}
    </div>
  );
}
