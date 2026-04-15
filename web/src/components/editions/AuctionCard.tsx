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
const ZERO_CONTENT_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

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
  const [communityTitle, setCommunityTitle] = useState(`COMMUNITY EDITION #${editionNumber}`);
  const [communityHash, setCommunityHash] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [editionPosition, setEditionPosition] = useState<{ position: string; quality: number } | null>(null);
  const auctionsDeployed = POOTER_AUCTIONS_ADDRESS !== ZERO_ADDRESS;

  // Fetch editorial market position for this edition
  useEffect(() => {
    fetch(`/api/trading/deliberation/latest?symbols=BTC`)
      .then((r) => r.json())
      .then((body) => {
        const d = body?.data?.[0];
        if (d?.winningThesis) {
          setEditionPosition({
            position: `${d.winningThesis.position} ${d.symbol}`,
            quality: d.winningThesis.argumentQuality,
          });
        }
      })
      .catch(() => {});
  }, [editionNumber]);

  // Check if edition is minted
  const { data: ownerData } = useReadContract({
    address: POOTER_EDITIONS_ADDRESS,
    abi: POOTER_EDITIONS_ABI,
    functionName: "ownerOf",
    args: [BigInt(editionNumber)],
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: POOTER_EDITIONS_ADDRESS !== ZERO_ADDRESS },
  });

  const { data: editionData } = useReadContract({
    address: POOTER_EDITIONS_ADDRESS,
    abi: POOTER_EDITIONS_ABI,
    functionName: "getEdition",
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
  const edition = editionData as [string, bigint, string] | undefined;
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
  const auctionContentHash = hasAuction ? auction[4] : ZERO_CONTENT_HASH;
  const auctionTitle = hasAuction ? auction[5].trim() : "";
  const mintedContentHash = edition ? edition[0] : ZERO_CONTENT_HASH;
  const mintedTitle = edition?.[2]?.trim() || "";
  const detailTitle = isMinted ? mintedTitle : auctionTitle;
  const detailHash = isMinted ? mintedContentHash : auctionContentHash;
  const hasDetailHash = !/^0x0{64}$/i.test(detailHash);
  const normalizedCommunityTitle = communityTitle.trim();
  const normalizedCommunityHash = communityHash.trim();
  const isCommunityHashValid =
    !normalizedCommunityHash || /^0x[a-fA-F0-9]{64}$/.test(normalizedCommunityHash);
  const submittedCommunityHash = (normalizedCommunityHash ||
    ZERO_CONTENT_HASH) as `0x${string}`;

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
    if (!bidAmount || !normalizedCommunityTitle || !isCommunityHashValid) return;
    reset();
    writeContract({
      address: POOTER_AUCTIONS_ADDRESS,
      abi: POOTER_AUCTIONS_ABI,
      functionName: "createAuction",
      args: [BigInt(editionNumber), submittedCommunityHash, normalizedCommunityTitle],
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
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="font-mono text-[8px] uppercase tracking-wider text-[var(--accent-red)] transition-colors hover:text-[var(--ink)]"
          >
            {showPreview ? "Hide" : "Preview"}
          </button>
        </div>
        <span className={`font-mono text-[8px] font-bold uppercase tracking-wider ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Conviction badge — editorial market position */}
      {editionPosition && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-mono text-[7px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            Editorial Position:
          </span>
          <span
            className="font-mono text-[8px] font-bold uppercase"
            style={{
              color: editionPosition.position.startsWith("LONG") ? "var(--accent-green)" : editionPosition.position.startsWith("SHORT") ? "var(--accent-red)" : "var(--ink-faint)",
            }}
          >
            {editionPosition.position}
          </span>
          <span className="font-mono text-[7px] text-[var(--ink-faint)]">
            {Math.round(editionPosition.quality * 100)}% conviction
          </span>
        </div>
      )}

      {/* Edition preview — illustration + newspaper SVG */}
      {showPreview && (
        <div className="mt-2 space-y-2">
          {/* DALL-E illustration (if available) */}
          {!hasAuction && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/edition/${editionNumber}/illustration`}
                alt={`Edition #${editionNumber} illustration`}
                className="h-auto w-full border border-[var(--rule)] bg-[#FAF8F3]"
                loading="lazy"
                onError={(e) => {
                  // Hide if no illustration exists (404)
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                Reference article art
              </p>
            </>
          )}
          {/* Newspaper SVG */}
          <div className="overflow-hidden border border-[var(--rule)] bg-[#FAF8F3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/edition/${editionNumber}/image`}
              alt={`Edition #${editionNumber} preview`}
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
          {hasAuction && (
            <p className="font-mono text-[8px] leading-relaxed text-[var(--ink-light)]">
              This preview reflects the community-claimed edition, not an official newsroom issue.
            </p>
          )}
        </div>
      )}

      {(detailTitle || hasAuction) && (
        <div className="mt-2 space-y-1 border-t border-[var(--rule-light)] pt-2">
          <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            {hasAuction ? "Community title" : "Onchain title"}
          </p>
          <p className="font-mono text-[10px] text-[var(--ink)]">
            {detailTitle || `COMMUNITY EDITION #${editionNumber}`}
          </p>
          <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            Content hash
          </p>
          <p className="break-all font-mono text-[9px] text-[var(--ink-light)]">
            {hasDetailHash ? detailHash : "None committed"}
          </p>
          {hasAuction && (
            <p className="font-mono text-[8px] leading-relaxed text-[var(--ink-light)]">
              User-generated metadata becomes the NFT record when this auction settles.
            </p>
          )}
        </div>
      )}

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
        <div className="mt-2 space-y-1.5">
          <input
            type="text"
            value={communityTitle}
            onChange={(e) => setCommunityTitle(e.target.value)}
            placeholder={`COMMUNITY EDITION #${editionNumber}`}
            maxLength={72}
            className="w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] uppercase text-[var(--ink)] outline-none"
          />
          <input
            type="text"
            value={communityHash}
            onChange={(e) => setCommunityHash(e.target.value)}
            placeholder="Optional 0x... content hash"
            className="w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] text-[var(--ink)] outline-none"
          />
          <div className="flex gap-1.5">
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
              disabled={!bidAmount || !normalizedCommunityTitle || !isCommunityHashValid || isBusy}
              className="border border-[var(--ink)] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
            >
              {isBusy ? "..." : "Start Auction"}
            </button>
          </div>
          {!isCommunityHashValid && (
            <p className="font-mono text-[8px] text-[var(--accent-red)]">
              Content hash must be 0x followed by 64 hex characters.
            </p>
          )}
          <p className="font-mono text-[8px] leading-relaxed text-[var(--ink-light)]">
            Community-created title/hash become the onchain metadata for this historical claim once the
            auction settles.
          </p>
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
