"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_ABI,
} from "@/lib/contracts";
import type { Proposal } from "@/lib/governance";

interface PredictionMarketProps {
  proposal: Proposal;
}

export function PredictionMarket({ proposal }: PredictionMarketProps) {
  const { address, isConnected } = useAccount();
  const [stakeAmount, setStakeAmount] = useState("0.01");
  const [selectedSide, setSelectedSide] = useState<"for" | "against" | null>(null);

  const hasNumericProposalId = Number.isFinite(proposal.proposalNumber);
  const isOnchainProposal = proposal.source === "onchain";
  const isCandidate = proposal.status === "candidate";

  const daoKey =
    proposal.dao === "Lil Nouns"
      ? "lil-nouns"
      : proposal.dao === "Nouns DAO"
        ? "nouns"
        : proposal.dao.toLowerCase().replace(/\s+/g, "-");
  const proposalId = hasNumericProposalId ? String(proposal.proposalNumber) : "0";
  const isStructurallyEligible =
    isOnchainProposal && !isCandidate && hasNumericProposalId;

  // Check whether this DAO is configured for deterministic onchain resolution.
  const { data: daoResolvableData, isLoading: isDaoResolvableLoading } =
    useReadContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "isDaoResolvable",
      args: [daoKey],
      query: { enabled: isStructurallyEligible },
    });

  const isDaoResolvable = daoResolvableData === true;
  const isEligible = isStructurallyEligible && isDaoResolvable;

  // Read market data
  const { data: marketData, refetch: refetchMarket } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: [daoKey, proposalId],
    query: { enabled: isEligible },
  });

  // Read user position
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getPosition",
    args: [daoKey, proposalId, address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address && isEligible },
  });

  // Stake transaction
  const { data: stakeTxHash, writeContract: writeStake, isPending: isStaking } =
    useWriteContract();
  const { isLoading: isStakeConfirming, isSuccess: stakeSuccess } =
    useWaitForTransactionReceipt({ hash: stakeTxHash });

  // Claim transaction
  const { data: claimTxHash, writeContract: writeClaim, isPending: isClaiming } =
    useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimTxHash });

  useEffect(() => {
    if (stakeSuccess || claimSuccess) {
      refetchMarket();
      refetchPosition();
    }
  }, [stakeSuccess, claimSuccess, refetchMarket, refetchPosition]);

  // Parse market data
  const forPool = marketData ? Number(formatEther((marketData as any)[0] || BigInt(0))) : 0;
  const againstPool = marketData ? Number(formatEther((marketData as any)[1] || BigInt(0))) : 0;
  const forStakers = marketData ? Number((marketData as any)[2] || 0) : 0;
  const againstStakers = marketData ? Number((marketData as any)[3] || 0) : 0;
  const forOddsBps = marketData ? Number((marketData as any)[4] || 5000) : 5000;
  const againstOddsBps = marketData ? Number((marketData as any)[5] || 5000) : 5000;
  const outcome = marketData ? Number((marketData as any)[6] || 0) : 0;

  const totalPool = forPool + againstPool;
  const forPct = forOddsBps / 100;
  const againstPct = againstOddsBps / 100;
  const isResolved = outcome > 0;

  // User position
  const userForStake = positionData ? Number(formatEther((positionData as any)[0] || BigInt(0))) : 0;
  const userAgainstStake = positionData ? Number(formatEther((positionData as any)[1] || BigInt(0))) : 0;
  const userClaimed = positionData ? (positionData as any)[2] === true : false;
  const hasPosition = userForStake > 0 || userAgainstStake > 0;

  const stakeNum = parseFloat(stakeAmount) || 0;
  const potentialPayoutFor = stakeNum > 0 && forPool + stakeNum > 0
    ? (stakeNum / (forPool + stakeNum)) * (totalPool + stakeNum)
    : 0;
  const potentialPayoutAgainst = stakeNum > 0 && againstPool + stakeNum > 0
    ? (stakeNum / (againstPool + stakeNum)) * (totalPool + stakeNum)
    : 0;

  const handleStake = () => {
    if (!isEligible || !selectedSide || stakeNum <= 0) return;
    writeStake({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "stake",
      args: [daoKey, proposalId, selectedSide === "for"],
      value: parseEther(stakeAmount),
    });
  };

  const handleClaim = () => {
    if (!isEligible) return;
    writeClaim({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [daoKey, proposalId],
    });
  };

  const isBusy = isStaking || isStakeConfirming || isClaiming || isClaimConfirming;

  return (
    <div className="border-t border-[var(--rule)] pt-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Prediction Market
        </h3>
        {isResolved && (
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)]">
            {outcome === 1 ? "Resolved: FOR" : outcome === 2 ? "Resolved: AGAINST" : "Voided"}
          </span>
        )}
      </div>

      {!isEligible && (
        <p className="mb-3 border border-[var(--rule-light)] px-2 py-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {!isOnchainProposal
            ? "Only available for onchain proposals."
            : isCandidate
              ? "Candidates are not final-state resolvable onchain."
              : !hasNumericProposalId
                ? "Missing numeric onchain proposal ID."
                : isDaoResolvableLoading
                  ? "Checking onchain resolver..."
                  : "DAO resolver not configured on this chain."}
        </p>
      )}

      {/* Odds display */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between font-mono text-[10px]">
          <span className="font-bold text-[var(--ink)]">
            FOR {forPct.toFixed(1)}%
          </span>
          <span className="text-[var(--ink-faint)]">
            {againstPct.toFixed(1)}% AGAINST
          </span>
        </div>

        {/* Monochrome odds bar */}
        <div className="flex h-1.5 overflow-hidden bg-[var(--paper-dark)]">
          <div
            className="bg-[var(--ink)] transition-all duration-500"
            style={{ width: `${forPct}%` }}
          />
        </div>

        {/* Stats */}
        <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span>{forPool.toFixed(3)} Ξ &middot; {forStakers} staker{forStakers !== 1 ? "s" : ""}</span>
          <span>Pool: {totalPool.toFixed(4)} ETH</span>
          <span>{againstPool.toFixed(3)} Ξ &middot; {againstStakers}</span>
        </div>
      </div>

      {/* User position */}
      {hasPosition && (
        <div className="mb-3 border border-[var(--rule-light)] px-2 py-1.5">
          <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">Your Position</p>
          <div className="mt-0.5 flex gap-3 font-mono text-[10px]">
            {userForStake > 0 && (
              <span className="font-bold text-[var(--ink)]">
                FOR: {userForStake.toFixed(4)} Ξ
              </span>
            )}
            {userAgainstStake > 0 && (
              <span className="text-[var(--ink-light)]">
                AGAINST: {userAgainstStake.toFixed(4)} Ξ
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isConnected ? (
        <p className="py-3 text-center font-mono text-[10px] text-[var(--ink-faint)]">
          Connect wallet to predict
        </p>
      ) : isResolved ? (
        hasPosition && !userClaimed ? (
          <button
            onClick={handleClaim}
            disabled={isBusy}
            className="w-full border-2 border-[var(--ink)] py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--ink)] transition-all hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-wait disabled:opacity-50"
          >
            {isBusy ? "Claiming..." : "Claim Winnings"}
          </button>
        ) : userClaimed ? (
          <p className="py-3 text-center font-mono text-[10px] font-bold text-[var(--ink)]">
            Winnings claimed
          </p>
        ) : (
          <p className="py-3 text-center font-mono text-[10px] text-[var(--ink-faint)]">
            Market resolved — no position
          </p>
        )
      ) : (
        <>
          {/* Side selection — pipe style */}
          <div className="mb-2 flex gap-0 font-mono text-[10px] uppercase tracking-wider">
            {(["for", "against"] as const).map((side, i) => (
              <span key={side} className="flex items-center">
                {i > 0 && <span className="mx-2 text-[var(--rule-light)]">|</span>}
                <button
                  onClick={() => setSelectedSide(side)}
                  className={`transition-colors ${
                    selectedSide === side
                      ? "font-bold text-[var(--ink)] underline underline-offset-4"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  {side}
                  {selectedSide === side && stakeNum > 0 && (
                    <span className="ml-1 text-[8px] no-underline opacity-60">
                      → {(side === "for" ? potentialPayoutFor : potentialPayoutAgainst).toFixed(4)}Ξ
                    </span>
                  )}
                </button>
              </span>
            ))}
          </div>

          {/* Amount input */}
          <div className="mb-2 flex items-center border border-[var(--rule-light)] bg-[var(--paper)]">
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="w-full bg-transparent px-2 py-1.5 font-mono text-xs text-[var(--ink)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="0.01"
            />
            <span className="shrink-0 pr-2 font-mono text-[10px] text-[var(--ink-faint)]">ETH</span>
          </div>

          {/* Quick amounts */}
          <div className="mb-3 flex gap-0 font-mono text-[9px] uppercase tracking-wider">
            {["0.005", "0.01", "0.05", "0.1"].map((amt, i) => (
              <span key={amt} className="flex items-center">
                {i > 0 && <span className="mx-1 text-[var(--rule-light)]">·</span>}
                <button
                  onClick={() => setStakeAmount(amt)}
                  className={`transition-colors ${
                    stakeAmount === amt
                      ? "font-bold text-[var(--ink)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  {amt}Ξ
                </button>
              </span>
            ))}
          </div>

          {/* Stake button */}
          <button
            onClick={handleStake}
            disabled={!isEligible || !selectedSide || stakeNum <= 0 || isBusy}
            className={`w-full border-2 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${
              !isEligible || !selectedSide || stakeNum <= 0
                ? "cursor-not-allowed border-[var(--rule-light)] text-[var(--ink-faint)]"
                : isBusy
                  ? "cursor-wait border-[var(--rule)] text-[var(--ink-faint)]"
                  : "border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            }`}
          >
            {isBusy
              ? "Staking..."
              : !selectedSide
                ? "Choose a side"
                : !isEligible
                  ? "Market unavailable"
                  : `Stake ${stakeAmount} ETH on ${selectedSide.toUpperCase()}`}
          </button>

          <p className="mt-2 text-center font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
            2% fee on profit &middot; Oracle: onchain governor state &middot; Winners take the pot
          </p>
        </>
      )}
    </div>
  );
}
