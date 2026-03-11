"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  POOTER_EDITIONS_ADDRESS,
  POOTER_EDITIONS_ABI,
  CONTRACTS_CHAIN_ID,
  ZERO_ADDRESS,
} from "@/lib/contracts";

// ============================================================================
// MINT EDITION BUTTON — 1/1 Daily Edition NFT
//
// States:
//   not connected  → hidden
//   no contract    → hidden
//   already minted → "Edition #N — Minted" (with basescan link)
//   ready          → "Mint Edition #N" button
//   signing        → "Sign in wallet..."
//   confirming     → "Confirming..."
//   minted         → "Minted!" (with basescan link)
//   error          → error message + retry
// ============================================================================

interface MintEditionButtonProps {
  editionNumber: number;
  contentHash: string; // 0x... bytes32
  dailyTitle: string;
}

export function MintEditionButton({
  editionNumber,
  contentHash,
  dailyTitle,
}: MintEditionButtonProps) {
  const { isConnected, address } = useAccount();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Check if this edition is already minted
  const { data: ownerData, isError: ownerError } = useReadContract({
    address: POOTER_EDITIONS_ADDRESS,
    abi: POOTER_EDITIONS_ABI,
    functionName: "ownerOf",
    args: [BigInt(editionNumber)],
    chainId: CONTRACTS_CHAIN_ID,
    query: {
      enabled: POOTER_EDITIONS_ADDRESS !== ZERO_ADDRESS && editionNumber > 0,
    },
  });

  const isMinted = ownerData !== undefined && !ownerError;
  const mintedOwner = isMinted ? (ownerData as string) : null;

  // Write contract
  const {
    writeContract,
    data: txHash,
    isPending: isSigning,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  // Wait for confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: txHash,
    });

  // Don't render until client-side
  if (!hasMounted) return null;

  // Hide if not connected or no contract deployed
  if (!isConnected || POOTER_EDITIONS_ADDRESS === ZERO_ADDRESS) return null;

  // Already minted state
  if (isMinted && !isConfirmed) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          Edition #{editionNumber} — Minted
        </span>
        <a
          href={`https://sepolia.basescan.org/token/${POOTER_EDITIONS_ADDRESS}?a=${editionNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent-red)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          View &rsaquo;
        </a>
      </div>
    );
  }

  // Post-mint success
  if (isConfirmed && txHash) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)]">
          &#10003; Edition #{editionNumber} Minted
        </span>
        <a
          href={`https://sepolia.basescan.org/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent-red)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          Basescan &rsaquo;
        </a>
      </div>
    );
  }

  const handleMint = () => {
    resetWrite();
    writeContract({
      address: POOTER_EDITIONS_ADDRESS,
      abi: POOTER_EDITIONS_ABI,
      functionName: "mint",
      args: [
        BigInt(editionNumber),
        contentHash as `0x${string}`,
        dailyTitle,
      ],
      chainId: CONTRACTS_CHAIN_ID,
    });
  };

  // Signing / confirming states
  if (isSigning) {
    return (
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] animate-pulse">
        Sign in wallet&hellip;
      </span>
    );
  }

  if (isConfirming) {
    return (
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] animate-pulse">
        Confirming&hellip;
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleMint}
        className="border border-[var(--ink)] px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        Mint Edition #{editionNumber}
      </button>
      {writeError && (
        <span className="font-mono text-[9px] text-[var(--accent-red)]">
          {writeError.message.slice(0, 60)}
        </span>
      )}
    </div>
  );
}
