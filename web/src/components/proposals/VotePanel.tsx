"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Proposal } from "@/lib/governance";
import { PROPOSAL_VOTING_ABI, PROPOSAL_VOTING_ADDRESS, NOUNS_TOKEN_ADDRESS } from "@/lib/contracts";

interface VotePanelProps {
  proposal: Proposal;
}

// Minimal ERC721 balanceOf for checking Noun ownership
const NOUNS_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export function VotePanel({ proposal }: VotePanelProps) {
  const { address, isConnected } = useAccount();
  const [selectedVote, setSelectedVote] = useState<0 | 1 | 2 | null>(null);
  const [reason, setReason] = useState("");

  // Check if user holds a Noun
  const { data: nounBalance } = useReadContract({
    address: NOUNS_TOKEN_ADDRESS,
    abi: NOUNS_BALANCE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 1, // Nouns are on mainnet
    query: { enabled: !!address },
  });

  const isNounHolder = nounBalance != null && nounBalance > BigInt(0);

  // Extract DAO key and proposal ID for the contract
  const daoKey = proposal.dao === "Nouns DAO" ? "nouns" : proposal.dao.toLowerCase().replace(/\s+/g, "-");
  const rawProposalId = proposal.id.replace(/^(nouns-|compound-)/, "");

  // Check if already voted
  const { data: existingVote } = useReadContract({
    address: PROPOSAL_VOTING_ADDRESS,
    abi: PROPOSAL_VOTING_ABI,
    functionName: "getVote",
    args: [daoKey, rawProposalId, address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  const hasVoted = existingVote ? (existingVote as any)[3] === true : false;

  // Cast vote
  const { data: txHash, writeContract, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleVote = () => {
    if (selectedVote === null || !isConnected) return;
    writeContract({
      address: PROPOSAL_VOTING_ADDRESS,
      abi: PROPOSAL_VOTING_ABI,
      functionName: "castVote",
      args: [daoKey, rawProposalId, selectedVote, reason],
    });
  };

  const isVoting = isPending || isConfirming;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        Signal Vote
      </h3>
      <p className="mb-4 text-xs text-zinc-600">
        Cast your opinion on this proposal via MO
      </p>

      {!isConnected ? (
        <div className="rounded-lg border border-zinc-800 py-6 text-center">
          <p className="text-sm text-zinc-400">Connect wallet to vote</p>
        </div>
      ) : hasVoted ? (
        <div className="rounded-lg border border-[#31F387]/20 bg-[#31F387]/5 py-6 text-center">
          <p className="text-sm font-medium text-[#31F387]">
            You already voted on this proposal
          </p>
        </div>
      ) : isSuccess ? (
        <div className="rounded-lg border border-[#31F387]/20 bg-[#31F387]/5 py-6 text-center">
          <p className="text-sm font-medium text-[#31F387]">
            Vote cast successfully!
          </p>
        </div>
      ) : (
        <>
          {/* Noun holder badge */}
          {isNounHolder ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#31F387]/20 bg-[#31F387]/5 px-3 py-2">
              <span className="text-lg">⌐◨-◨</span>
              <div>
                <p className="text-xs font-medium text-[#31F387]">
                  Noun Holder
                </p>
                <p className="text-[10px] text-[#31F387]/70">
                  Gas refund on vote
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2">
              <span className="text-sm text-zinc-500">⌐◨-◨</span>
              <div>
                <p className="text-xs text-zinc-400">
                  Non-holder vote
                </p>
                <p className="text-[10px] text-zinc-600">
                  Standard gas fee applies
                </p>
              </div>
            </div>
          )}

          {/* Vote buttons */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(
              [
                [1, "For", "border-[#31F387] bg-[#31F387]/10 text-[#31F387]"],
                [0, "Against", "border-[#D0021B] bg-[#D0021B]/10 text-[#D0021B]"],
                [2, "Abstain", "border-zinc-600 bg-zinc-800 text-zinc-400"],
              ] as const
            ).map(([value, label, activeClass]) => (
              <button
                key={value}
                onClick={() => setSelectedVote(value as 0 | 1 | 2)}
                className={`rounded-lg border py-3 text-sm font-medium transition-all ${
                  selectedVote === value
                    ? activeClass
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Reason (optional) */}
          <textarea
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mb-4 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors focus:border-[#2F80ED]"
          />

          {/* Submit */}
          <button
            onClick={handleVote}
            disabled={selectedVote === null || isVoting}
            className={`w-full rounded-lg py-3 text-sm font-semibold transition-all ${
              selectedVote === null
                ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                : isVoting
                  ? "cursor-wait bg-[#2F80ED]/50 text-white/50"
                  : "bg-[#2F80ED] text-white hover:bg-[#2F80ED]/80"
            }`}
          >
            {isVoting
              ? "Voting..."
              : selectedVote === null
                ? "Select a vote"
                : `Cast ${selectedVote === 1 ? "For" : selectedVote === 0 ? "Against" : "Abstain"} Vote`}
          </button>
        </>
      )}
    </div>
  );
}
