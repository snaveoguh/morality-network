"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  NOUNS_CONTRACTS,
  AUCTION_HOUSE_ABI,
  PROBE_CLIENT_ID,
  type NounsAuction,
} from "@/lib/nouns";
import { shortenAddress } from "@/lib/entity";

interface NounAuctionProps {
  auction: NounsAuction | null;
}

export function NounAuction({ auction }: NounAuctionProps) {
  const { address, isConnected } = useAccount();
  const [bidAmount, setBidAmount] = useState("");
  const [timeLeft, setTimeLeft] = useState("");

  // Countdown timer
  useEffect(() => {
    if (!auction) return;
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = auction.endTime - now;
      if (diff <= 0) {
        setTimeLeft("Auction ended");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setTimeLeft(
        h > 0
          ? `${h}h ${m}m ${s}s`
          : m > 0
            ? `${m}m ${s}s`
            : `${s}s`
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [auction]);

  // Bid transaction — uses clientId 9 (probe.wtf)
  const { data: txHash, writeContract, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const handleBid = () => {
    if (!auction || !bidAmount) return;
    writeContract({
      address: NOUNS_CONTRACTS.auctionHouse,
      abi: AUCTION_HOUSE_ABI,
      functionName: "createBid",
      args: [BigInt(auction.nounId), PROBE_CLIENT_ID],
      value: parseEther(bidAmount),
      chainId: 1,
    });
  };

  const isBusy = isPending || isConfirming;

  if (!auction) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-40 rounded-lg bg-zinc-800" />
          <div className="h-4 w-1/2 rounded bg-zinc-800" />
        </div>
      </div>
    );
  }

  const currentBidEth = formatEther(auction.amount);
  const isEnded = auction.endTime <= Math.floor(Date.now() / 1000);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      {/* Noun image */}
      <div className="relative">
        <img
          src={auction.imageUrl}
          alt={`Noun ${auction.nounId}`}
          className="w-full"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Live badge */}
        {!isEnded && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#D0021B]" />
            <span className="text-xs font-medium text-white">LIVE</span>
          </div>
        )}
        {/* Timer */}
        <div className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1.5 font-mono text-sm font-bold text-white backdrop-blur-sm">
          {timeLeft}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xl font-bold text-white">
            Noun {auction.nounId}
          </h3>
          <a
            href={`https://noun.wtf/noun/${auction.nounId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#2F80ED] hover:underline"
          >
            noun.wtf &rarr;
          </a>
        </div>

        {/* Current bid */}
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {isEnded ? "Winning bid" : "Current bid"}
            </p>
            <p className="text-2xl font-bold text-white">
              Ξ {Number(currentBidEth).toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              {isEnded ? "Winner" : "Top bidder"}
            </p>
            <p className="text-sm font-medium text-zinc-300">
              {auction.bidder === "0x0000000000000000000000000000000000000000"
                ? "No bids"
                : shortenAddress(auction.bidder)}
            </p>
          </div>
        </div>

        {/* Bid input */}
        {!isEnded && (
          <div className="mt-4">
            {!isConnected ? (
              <div className="rounded-lg border border-zinc-800 py-3 text-center text-sm text-zinc-500">
                Connect wallet to bid
              </div>
            ) : isSuccess ? (
              <div className="rounded-lg border border-[#31F387]/20 bg-[#31F387]/5 py-3 text-center text-sm font-medium text-[#31F387]">
                Bid placed!
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3">
                    <span className="text-sm text-zinc-500">Ξ</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder={Number(currentBidEth) > 0
                        ? (Number(currentBidEth) * 1.02).toFixed(2)
                        : "0.01"}
                      className="w-full bg-transparent py-2.5 pl-2 text-sm text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  <button
                    onClick={handleBid}
                    disabled={!bidAmount || isBusy}
                    className="shrink-0 rounded-lg bg-[#2F80ED] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2F80ED]/80 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy ? "..." : "Bid"}
                  </button>
                </div>
                <p className="mt-2 text-center text-[10px] text-zinc-600">
                  Bids go to clientId {PROBE_CLIENT_ID} (probe.wtf) &middot;{" "}
                  <a
                    href="https://probe.wtf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2F80ED]"
                  >
                    probe.wtf
                  </a>
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
