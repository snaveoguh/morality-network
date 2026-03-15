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
  POOTER_EDITIONS_ADDRESS,
  POOTER_EDITIONS_ABI,
  POOTER_AUCTIONS_ADDRESS,
  POOTER_AUCTIONS_ABI,
  CONTRACTS_CHAIN_ID,
  ZERO_ADDRESS,
} from "@/lib/contracts";
import { shortenAddress } from "@/lib/entity";

// ============================================================================
// AUCTION CARD — Per-edition row in the EditionsPanel
//
// States: available | auctioning | settling | minted
// ============================================================================

interface AuctionCardProps {
  editionNumber: number;
}

const EPOCH = 1741651200;
const SECONDS_PER_DAY = 86400;

function formatEditionDate(editionNumber: number): string {
  const ts = (EPOCH + (editionNumber - 1) * SECONDS_PER_DAY) * 1000;
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).toUpperCase();
}

function useCountdown(endTime: number): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      if (diff <= 0) {
        setLabel("Ended");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setLabel(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return label;
}

type EditionStatus = "minted" | "auctioning" | "settling" | "available";

export function AuctionCard({ editionNumber }: AuctionCardProps) {
  const { isConnected } = useAccount();
  const [bidAmount, setBidAmount] = useState("");
  const auctionsDeployed = POOTER_AUCTIONS_ADDRESS !== ZERO_ADDRESS;

  // Check if edition is minted
  const { data: ownerData } = useReadContract({
    address: POOTER_EDITIONS_ADDRESS,
    abi: POOTER_EDITIONS_ABI,
    functionName: "ownerOf",
    args: [BigInt(editionNumber)],
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: POOTER_EDITIONS_ADDRESS !== ZERO_ADDRESS },
  });

  // Check auction state
  const { data: auctionData, refetch: refetchAuction } = useReadContract({
    address: POOTER_AUCTIONS_ADDRESS,
    abi: POOTER_AUCTIONS_ABI,
    functionName: "auctions",
    args: [BigInt(editionNumber)],
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: auctionsDeployed },
  });

  // Determine status
  const isMinted = ownerData !== undefined && ownerData !== null;
  const auction = auctionData as
    | [bigint, bigint, string, bigint, string, string, boolean]
    | undefined;
  const hasAuction = auction && Number(auction[0]) > 0;
  const isSettled = hasAuction && auction[6];
  const auctionEndTime = hasAuction ? Number(auction[1]) : 0;
  const now = Math.floor(Date.now() / 1000);
  const isEnded = hasAuction && now >= auctionEndTime;

  let status: EditionStatus = "available";
  if (isMinted || isSettled) status = "minted";
  else if (hasAuction && isEnded) status = "settling";
  else if (hasAuction && !isEnded) status = "auctioning";

  const highestBid = hasAuction ? auction[3] : BigInt(0);
  const highestBidder = hasAuction ? auction[2] : "";

  const countdown = useCountdown(auctionEndTime);

  // Write hooks
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Refetch auction data on successful tx
  useEffect(() => {
    if (isSuccess) {
      refetchAuction();
    }
  }, [isSuccess, refetchAuction]);

  const isBusy = isPending || isConfirming;
  const dateStr = formatEditionDate(editionNumber);

  // Min bid calculation
  const MIN_BID_WEI = BigInt("1000000000000000"); // 0.001 ETH
  const minBidWei = hasAuction
    ? highestBid + (highestBid * BigInt(1000) / BigInt(10000)) // +10%
    : MIN_BID_WEI;
  const minBidEth = formatEther(minBidWei > MIN_BID_WEI ? minBidWei : MIN_BID_WEI);

  const handleCreateAuction = () => {
    if (!bidAmount) return;
    reset();
    // Use a default contentHash and title — the edition metadata API handles the rest
    const contentHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    writeContract({
      address: POOTER_AUCTIONS_ADDRESS,
      abi: POOTER_AUCTIONS_ABI,
      functionName: "createAuction",
      args: [BigInt(editionNumber), contentHash, `EDITION ${editionNumber}`],
      value: parseEther(bidAmount),
      chainId: CONTRACTS_CHAIN_ID,
    });
  };

  const handleBid = () => {
    if (!bidAmount) return;
    reset();
    writeContract({
      address: POOTER_AUCTIONS_ADDRESS,
      abi: POOTER_AUCTIONS_ABI,
      functionName: "bid",
      args: [BigInt(editionNumber)],
      value: parseEther(bidAmount),
      chainId: CONTRACTS_CHAIN_ID,
    });
  };

  const handleSettle = () => {
    reset();
    writeContract({
      address: POOTER_AUCTIONS_ADDRESS,
      abi: POOTER_AUCTIONS_ABI,
      functionName: "settle",
      args: [BigInt(editionNumber)],
      chainId: CONTRACTS_CHAIN_ID,
    });
  };

  const statusLabel = {
    minted: "MINTED",
    auctioning: "LIVE",
    settling: "ENDED",
    available: "AVAILABLE",
  }[status];

  const statusColor = {
    minted: "text-[var(--ink-faint)]",
    auctioning: "text-[var(--accent-red)]",
    settling: "text-[var(--ink)]",
    available: "text-[var(--ink-light)]",
  }[status];

  return (
    <div className="border-b border-[var(--rule-light)] px-4 py-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
            #{editionNumber}
          </span>
          <span className="font-mono text-[9px] text-[var(--ink-faint)]">
            {dateStr}
          </span>
        </div>
        <span className={`font-mono text-[8px] font-bold uppercase tracking-wider ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Minted state */}
      {status === "minted" && isMinted && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-mono text-[9px] text-[var(--ink-faint)]">
            Owner: {shortenAddress(ownerData as string)}
          </span>
          <a
            href={`https://basescan.org/token/${POOTER_EDITIONS_ADDRESS}?a=${editionNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[9px] text-[var(--accent-red)] underline underline-offset-2"
          >
            View &rsaquo;
          </a>
        </div>
      )}

      {/* Active auction state */}
      {status === "auctioning" && hasAuction && (
        <div className="mt-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                Current bid
              </p>
              <p className="font-mono text-[13px] font-bold text-[var(--ink)]">
                {Number(formatEther(highestBid)).toFixed(4)} ETH
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                {countdown}
              </p>
              <p className="font-mono text-[9px] text-[var(--ink-light)]">
                {shortenAddress(highestBidder)}
              </p>
            </div>
          </div>

          {isConnected && auctionsDeployed && (
            <div className="mt-2 flex gap-1.5">
              <input
                type="number"
                step="0.001"
                min="0"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={Number(minBidEth).toFixed(4)}
                className="flex-1 border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                onClick={handleBid}
                disabled={!bidAmount || isBusy}
                className="border border-[var(--ink)] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
              >
                {isBusy ? "..." : "Bid"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Settling state */}
      {status === "settling" && hasAuction && (
        <div className="mt-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                Winning bid
              </p>
              <p className="font-mono text-[13px] font-bold text-[var(--ink)]">
                {Number(formatEther(highestBid)).toFixed(4)} ETH
              </p>
            </div>
            <p className="font-mono text-[9px] text-[var(--ink-light)]">
              {shortenAddress(highestBidder)}
            </p>
          </div>

          {isConnected && auctionsDeployed && (
            <button
              onClick={handleSettle}
              disabled={isBusy}
              className="mt-2 w-full border border-[var(--ink)] px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
            >
              {isBusy ? "Settling..." : "Settle Auction"}
            </button>
          )}
        </div>
      )}

      {/* Available state */}
      {status === "available" && isConnected && auctionsDeployed && (
        <div className="mt-2 flex gap-1.5">
          <input
            type="number"
            step="0.001"
            min="0"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder="0.001"
            className="flex-1 border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={handleCreateAuction}
            disabled={!bidAmount || isBusy}
            className="border border-[var(--ink)] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
          >
            {isBusy ? "..." : "Start Auction"}
          </button>
        </div>
      )}

      {/* Error display */}
      {writeError && (
        <p className="mt-1 font-mono text-[9px] text-[var(--accent-red)]">
          {writeError.message.slice(0, 80)}
        </p>
      )}

      {/* Success display */}
      {isSuccess && txHash && (
        <p className="mt-1 font-mono text-[9px] text-[var(--ink)]">
          Confirmed{" "}
          <a
            href={`https://basescan.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-red)] underline underline-offset-2"
          >
            View tx &rsaquo;
          </a>
        </p>
      )}
    </div>
  );
}
