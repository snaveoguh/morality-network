"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Proposal } from "@/lib/governance";
import { PROPOSAL_VOTING_ABI, PROPOSAL_VOTING_ADDRESS, NOUNS_TOKEN_ADDRESS, CONTRACTS_CHAIN_ID } from "@/lib/contracts";

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
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const votingAvailable = PROPOSAL_VOTING_ADDRESS !== ZERO_ADDRESS;

  // Check if user holds a Noun
  const { data: nounBalance } = useReadContract({
    address: NOUNS_TOKEN_ADDRESS,
    abi: NOUNS_BALANCE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 1,
    query: { enabled: !!address },
  });

  const isNounHolder = nounBalance != null && nounBalance > BigInt(0);

  const daoKey =
    proposal.dao === "Lil Nouns"
      ? "lil-nouns"
      : proposal.dao === "Nouns DAO"
        ? "nouns"
        : proposal.dao.toLowerCase().replace(/\s+/g, "-");

  const proposalId =
    Number.isFinite(proposal.proposalNumber) && proposal.proposalNumber != null
      ? String(proposal.proposalNumber)
      : proposal.id;

  const { data: daoResolvableData } = useReadContract({
    address: PROPOSAL_VOTING_ADDRESS,
    abi: PROPOSAL_VOTING_ABI,
    functionName: "isDaoResolvable",
    args: [daoKey],
    query: { enabled: votingAvailable },
  });

  const isDaoResolvable = daoResolvableData === true;

  const { data: existingVote } = useReadContract({
    address: PROPOSAL_VOTING_ADDRESS,
    abi: PROPOSAL_VOTING_ABI,
    functionName: "getVote",
    args: [daoKey, proposalId, address || ZERO_ADDRESS],
    query: { enabled: votingAvailable && !!address },
  });

  const hasVoted = existingVote ? (existingVote as any)[3] === true : false;

  const { data: txHash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleVote = () => {
    if (selectedVote === null || !isConnected || !votingAvailable) return;
    writeContract({
      chainId: CONTRACTS_CHAIN_ID,
      address: PROPOSAL_VOTING_ADDRESS,
      abi: PROPOSAL_VOTING_ABI,
      functionName: "castVote",
      args: [daoKey, proposalId, selectedVote, reason],
    });
  };

  const isVoting = isPending || isConfirming;

  return (
    <div className="border-t border-[var(--rule)] pt-4">
      <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        Signal Vote
      </h3>
      <p className="mt-0.5 font-mono text-[8px] text-[var(--ink-faint)]">
        Cast your interpretation on this proposal via MO
      </p>

      <div className="mt-3">
        {!votingAvailable ? (
          <p className="border-t border-[var(--rule-light)] py-4 text-center font-mono text-[10px] text-[var(--ink-faint)]">
            Voting contract not deployed on this network
          </p>
        ) : !isConnected ? (
          <p className="border-t border-[var(--rule-light)] py-4 text-center font-mono text-[10px] text-[var(--ink-faint)]">
            Connect wallet to vote
          </p>
        ) : hasVoted ? (
          <p className="border-t border-[var(--rule-light)] py-4 text-center font-mono text-[10px] font-bold text-[var(--ink)]">
            You already voted on this proposal
          </p>
        ) : isSuccess ? (
          <p className="border-t border-[var(--rule-light)] py-4 text-center font-mono text-[10px] font-bold text-[var(--ink)]">
            Vote cast successfully
          </p>
        ) : (
          <>
            {/* Noun holder badge */}
            {isNounHolder ? (
              <div className="mb-3 flex items-center gap-2 border border-[var(--rule)] px-2 py-1.5">
                <span className="text-xs">⌐◨-◨</span>
                <div>
                  <p className="font-mono text-[9px] font-bold text-[var(--ink)]">
                    Noun Holder
                  </p>
                  <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                    {isDaoResolvable
                      ? "Gas refund eligible for this onchain proposal"
                      : "No gas refund for this source"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-3 flex items-center gap-2 border border-[var(--rule-light)] px-2 py-1.5">
                <span className="text-[10px] text-[var(--ink-faint)]">⌐◨-◨</span>
                <div>
                  <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                    Non-holder vote
                  </p>
                  <p className="font-mono text-[8px] text-[var(--ink-faint)]">
                    Standard gas fee applies
                  </p>
                </div>
              </div>
            )}

            {/* Vote buttons — pipe-style inline */}
            <div className="mb-3 flex gap-0 font-mono text-[10px] uppercase tracking-wider">
              {(
                [
                  [1, "For"],
                  [0, "Against"],
                  [2, "Abstain"],
                ] as const
              ).map(([value, label], i) => (
                <span key={value} className="flex items-center">
                  {i > 0 && <span className="mx-2 text-[var(--rule-light)]">|</span>}
                  <button
                    onClick={() => setSelectedVote(value as 0 | 1 | 2)}
                    className={`transition-colors ${
                      selectedVote === value
                        ? "font-bold text-[var(--ink)] underline underline-offset-4"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {label}
                  </button>
                </span>
              ))}
            </div>

            {/* Reason */}
            <textarea
              placeholder="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mb-3 w-full resize-none border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1.5 font-body-serif text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--rule)]"
            />

            {/* Submit */}
            <button
              onClick={handleVote}
              disabled={selectedVote === null || isVoting}
              className={`w-full border-2 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${
                selectedVote === null
                  ? "cursor-not-allowed border-[var(--rule-light)] text-[var(--ink-faint)]"
                  : isVoting
                    ? "cursor-wait border-[var(--rule)] text-[var(--ink-faint)]"
                    : "border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
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
    </div>
  );
}
