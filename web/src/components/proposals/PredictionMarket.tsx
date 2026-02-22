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

  const daoKey =
    proposal.dao === "Lil Nouns"
      ? "lil-nouns"
      : proposal.dao === "Nouns DAO"
        ? "nouns"
        : proposal.dao.toLowerCase().replace(/\s+/g, "-");
  const rawProposalId = proposal.id;

  // Read market data
  const { data: marketData, refetch: refetchMarket } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getMarket",
    args: [daoKey, rawProposalId],
  });

  // Read user position
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getPosition",
    args: [daoKey, rawProposalId, address || "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
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

  // Refetch on successful tx
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
  const marketExists = marketData ? (marketData as any)[7] === true : false;

  const totalPool = forPool + againstPool;
  const forPct = forOddsBps / 100;
  const againstPct = againstOddsBps / 100;
  const isResolved = outcome > 0;

  // Parse user position
  const userForStake = positionData ? Number(formatEther((positionData as any)[0] || BigInt(0))) : 0;
  const userAgainstStake = positionData ? Number(formatEther((positionData as any)[1] || BigInt(0))) : 0;
  const userClaimed = positionData ? (positionData as any)[2] === true : false;
  const hasPosition = userForStake > 0 || userAgainstStake > 0;

  // Calculate potential payout
  const stakeNum = parseFloat(stakeAmount) || 0;
  const potentialPayoutFor = stakeNum > 0 && forPool + stakeNum > 0
    ? (stakeNum / (forPool + stakeNum)) * (totalPool + stakeNum)
    : 0;
  const potentialPayoutAgainst = stakeNum > 0 && againstPool + stakeNum > 0
    ? (stakeNum / (againstPool + stakeNum)) * (totalPool + stakeNum)
    : 0;

  const handleStake = () => {
    if (!selectedSide || stakeNum <= 0) return;
    writeStake({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "stake",
      args: [daoKey, rawProposalId, selectedSide === "for"],
      value: parseEther(stakeAmount),
    });
  };

  const handleClaim = () => {
    writeClaim({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claim",
      args: [daoKey, rawProposalId],
    });
  };

  const isBusy = isStaking || isStakeConfirming || isClaiming || isClaimConfirming;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Prediction Market
        </h3>
        {isResolved && (
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
            outcome === 1 ? "bg-[#31F387]/10 text-[#31F387]" :
            outcome === 2 ? "bg-[#D0021B]/10 text-[#D0021B]" :
            "bg-zinc-700 text-zinc-400"
          }`}>
            {outcome === 1 ? "Resolved: FOR" : outcome === 2 ? "Resolved: AGAINST" : "Voided"}
          </span>
        )}
      </div>

      {/* Odds display — the key visual */}
      <div className="mb-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium text-[#31F387]">
            FOR {forPct.toFixed(1)}%
          </span>
          <span className="font-medium text-[#D0021B]">
            {againstPct.toFixed(1)}% AGAINST
          </span>
        </div>

        {/* Odds bar */}
        <div className="relative flex h-8 overflow-hidden rounded-lg">
          <div
            className="flex items-center justify-center bg-[#31F387]/20 transition-all duration-500"
            style={{ width: `${forPct}%` }}
          >
            {forPct >= 20 && (
              <span className="text-xs font-bold text-[#31F387]">
                {forPool.toFixed(3)} Ξ
              </span>
            )}
          </div>
          <div
            className="flex items-center justify-center bg-[#D0021B]/20 transition-all duration-500"
            style={{ width: `${againstPct}%` }}
          >
            {againstPct >= 20 && (
              <span className="text-xs font-bold text-[#D0021B]">
                {againstPool.toFixed(3)} Ξ
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-2 flex justify-between text-[10px] text-zinc-500">
          <span>{forStakers} staker{forStakers !== 1 ? "s" : ""}</span>
          <span>Total pool: {totalPool.toFixed(4)} ETH</span>
          <span>{againstStakers} staker{againstStakers !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* User position */}
      {hasPosition && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Your Position</p>
          <div className="mt-1 flex gap-4 text-sm">
            {userForStake > 0 && (
              <span className="text-[#31F387]">
                FOR: {userForStake.toFixed(4)} Ξ
              </span>
            )}
            {userAgainstStake > 0 && (
              <span className="text-[#D0021B]">
                AGAINST: {userAgainstStake.toFixed(4)} Ξ
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {!isConnected ? (
        <div className="rounded-lg border border-zinc-800 py-4 text-center text-sm text-zinc-400">
          Connect wallet to predict
        </div>
      ) : isResolved ? (
        // Claim phase
        hasPosition && !userClaimed ? (
          <button
            onClick={handleClaim}
            disabled={isBusy}
            className="w-full rounded-lg bg-[#2F80ED] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2F80ED]/80 disabled:cursor-wait disabled:opacity-50"
          >
            {isBusy ? "Claiming..." : "Claim Winnings"}
          </button>
        ) : userClaimed ? (
          <div className="rounded-lg border border-[#31F387]/20 bg-[#31F387]/5 py-3 text-center text-sm text-[#31F387]">
            Winnings claimed
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 py-3 text-center text-sm text-zinc-500">
            Market resolved — no position
          </div>
        )
      ) : (
        // Staking phase
        <>
          {/* Side selection */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedSide("for")}
              className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                selectedSide === "for"
                  ? "border-[#31F387] bg-[#31F387]/10 text-[#31F387]"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              FOR
              {selectedSide === "for" && stakeNum > 0 && (
                <span className="ml-1 text-[10px] opacity-70">
                  → {potentialPayoutFor.toFixed(4)}Ξ
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedSide("against")}
              className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${
                selectedSide === "against"
                  ? "border-[#D0021B] bg-[#D0021B]/10 text-[#D0021B]"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              AGAINST
              {selectedSide === "against" && stakeNum > 0 && (
                <span className="ml-1 text-[10px] opacity-70">
                  → {potentialPayoutAgainst.toFixed(4)}Ξ
                </span>
              )}
            </button>
          </div>

          {/* Amount input */}
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              placeholder="0.01"
            />
            <span className="shrink-0 text-sm text-zinc-500">ETH</span>
          </div>

          {/* Quick amounts */}
          <div className="mb-3 flex gap-1.5">
            {["0.005", "0.01", "0.05", "0.1"].map((amt) => (
              <button
                key={amt}
                onClick={() => setStakeAmount(amt)}
                className={`flex-1 rounded-md py-1 text-[10px] font-medium transition-colors ${
                  stakeAmount === amt
                    ? "bg-zinc-700 text-white"
                    : "bg-zinc-800/50 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {amt}Ξ
              </button>
            ))}
          </div>

          {/* Stake button */}
          <button
            onClick={handleStake}
            disabled={!selectedSide || stakeNum <= 0 || isBusy}
            className={`w-full rounded-lg py-3 text-sm font-semibold transition-all ${
              !selectedSide || stakeNum <= 0
                ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                : isBusy
                  ? "cursor-wait bg-[#2F80ED]/50 text-white/50"
                  : selectedSide === "for"
                    ? "bg-[#31F387] text-black hover:bg-[#31F387]/80"
                    : "bg-[#D0021B] text-white hover:bg-[#D0021B]/80"
            }`}
          >
            {isBusy
              ? "Staking..."
              : !selectedSide
                ? "Choose a side"
                : `Stake ${stakeAmount} ETH on ${selectedSide.toUpperCase()}`}
          </button>

          <p className="mt-2 text-center text-[10px] text-zinc-600">
            2% fee on profit &middot; Oracle: Ethereum blockchain &middot; Winners take the pot
          </p>
        </>
      )}
    </div>
  );
}
