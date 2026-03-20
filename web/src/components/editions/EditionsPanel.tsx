"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatEther } from "viem";
import {
  POOTER_EDITIONS_ADDRESS,
  POOTER_EDITIONS_ABI,
  POOTER_AUCTIONS_ADDRESS,
  POOTER_AUCTIONS_ABI,
  CONTRACTS_CHAIN_ID,
  ZERO_ADDRESS,
} from "@/lib/contracts";
import { shortenAddress } from "@/lib/entity";
import { AuctionCard } from "./AuctionCard";

// ============================================================================
// EDITIONS PANEL — Modal showing historical community-edition auctions
//
// Triggered from Masthead dateline click on "EDITION N".
// Shows paginated list of editions newest-first with status + bid UI.
// ============================================================================

interface EditionsPanelProps {
  currentEdition: number;
  onClose: () => void;
}

const PAGE_SIZE = 10;

export function EditionsPanel({ currentEdition, onClose }: EditionsPanelProps) {
  const { address } = useAccount();
  const [page, setPage] = useState(0);
  const auctionsDeployed = POOTER_AUCTIONS_ADDRESS !== ZERO_ADDRESS;

  // Total editions = currentEdition - 1 (only past editions can be auctioned)
  const totalPastEditions = Math.max(0, currentEdition - 1);

  // Generate edition numbers for current page (newest first)
  const editionNumbers = useMemo(() => {
    const start = totalPastEditions - page * PAGE_SIZE;
    const end = Math.max(0, start - PAGE_SIZE);
    const nums: number[] = [];
    for (let i = start; i > end; i--) {
      nums.push(i);
    }
    return nums;
  }, [totalPastEditions, page]);

  const totalPages = Math.ceil(totalPastEditions / PAGE_SIZE);

  // Check pending returns for connected user
  const { data: pendingReturn } = useReadContract({
    address: POOTER_AUCTIONS_ADDRESS,
    abi: POOTER_AUCTIONS_ABI,
    functionName: "pendingReturns",
    args: address ? [address] : undefined,
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: auctionsDeployed && !!address },
  });

  const { data: treasuryAddress } = useReadContract({
    address: POOTER_AUCTIONS_ADDRESS,
    abi: POOTER_AUCTIONS_ABI,
    functionName: "treasury",
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: auctionsDeployed },
  });

  const {
    writeContract,
    data: withdrawTxHash,
    isPending: isWithdrawing,
  } = useWriteContract();

  const { isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawTxHash,
  });

  const hasPendingReturn =
    pendingReturn !== undefined && (pendingReturn as bigint) > BigInt(0);

  const handleWithdraw = () => {
    writeContract({
      address: POOTER_AUCTIONS_ADDRESS,
      abi: POOTER_AUCTIONS_ABI,
      functionName: "withdrawPendingReturn",
      chainId: CONTRACTS_CHAIN_ID,
    });
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex max-h-[75vh] w-full max-w-lg flex-col border border-[var(--rule)] bg-[var(--paper)] shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
            Community Editions
          </h2>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>

        {/* Pending returns banner */}
        {hasPendingReturn && !withdrawSuccess && (
          <div className="flex items-center justify-between border-b border-[var(--rule-light)] bg-[var(--paper)] px-4 py-2">
            <span className="font-mono text-[9px] text-[var(--ink-light)]">
              Pending refund: {Number(formatEther(pendingReturn as bigint)).toFixed(4)} ETH
            </span>
            <button
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="border border-[var(--ink)] px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:opacity-40"
            >
              {isWithdrawing ? "..." : "Withdraw"}
            </button>
          </div>
        )}

        {/* Info bar */}
        <div className="border-b border-[var(--rule-light)] px-4 py-2">
          <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            {totalPastEditions} past date{totalPastEditions !== 1 ? "s" : ""} · current: #{currentEdition} · funds go to support r&amp;d
            {treasuryAddress ? ` · treasury: ${shortenAddress(treasuryAddress as string)}` : ""}
          </p>
          <p className="mt-1 font-mono text-[8px] leading-relaxed text-[var(--ink-light)]">
            Community members can auction unminted past dates and set the onchain title/hash for those NFTs.
            These are user-generated historical claims, not official newsroom editions.
          </p>
        </div>

        {/* Edition list */}
        <div className="flex-1 overflow-y-auto">
          {editionNumbers.length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-[10px] text-[var(--ink-faint)]">
              No past editions yet.
            </div>
          ) : (
            editionNumbers.map((n) => (
              <AuctionCard key={n} editionNumber={n} />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--rule)] px-4 py-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink)] disabled:text-[var(--ink-faint)] disabled:cursor-default"
            >
              &lsaquo; Newer
            </button>
            <span className="font-mono text-[8px] text-[var(--ink-faint)]">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink)] disabled:text-[var(--ink-faint)] disabled:cursor-default"
            >
              Older &rsaquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
