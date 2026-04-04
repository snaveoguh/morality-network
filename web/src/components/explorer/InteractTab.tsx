"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { AbiPanel } from "./AbiPanel";
import { RatingWidget } from "@/components/entity/RatingWidget";
import { keccak256, toHex } from "viem";

interface InteractTabProps {
  address: string;
  abi: any[];
}

export function InteractTab({ address, abi }: InteractTabProps) {
  const { isConnected } = useAccount();
  const [showRating, setShowRating] = useState(false);
  const [lastTxCount, setLastTxCount] = useState(0);

  // Derive an entity hash from the contract address for the rating widget
  const entityHash = keccak256(toHex(address.toLowerCase()));

  // Listen for successful transactions to prompt rating
  // We detect this by watching for write contract confirmations in children.
  // A simpler approach: surface a callback via context or track tx count.
  // For now, use a lightweight polling approach on the AbiPanel's parent.
  useEffect(() => {
    function onTxSuccess(e: Event) {
      setShowRating(true);
    }
    window.addEventListener("pooter:tx-confirmed", onTxSuccess);
    return () => window.removeEventListener("pooter:tx-confirmed", onTxSuccess);
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="font-headline-serif text-base text-[var(--ink)]">
          Connect wallet to interact
        </p>
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">
          Write functions require an active wallet connection.
        </p>
      </div>
    );
  }

  if (!abi || abi.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="font-headline-serif text-base text-[var(--ink)]">
          Contract source not verified
        </p>
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">
          ABI is unavailable. Verify the contract on Basescan to enable
          interactions.
        </p>
      </div>
    );
  }

  return (
    <div>
      <AbiPanel abi={abi} address={address} mode="write" />

      {/* Rating prompt after successful transaction */}
      {showRating && (
        <div className="mt-6 border-t border-[var(--rule-light)] pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-headline-serif text-sm text-[var(--ink)]">
                Rate this contract?
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--ink-faint)]">
                Help others by rating your experience with this contract.
              </p>
            </div>
            <button
              onClick={() => setShowRating(false)}
              className="font-mono text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
              aria-label="Dismiss"
            >
              dismiss
            </button>
          </div>
          <div className="mt-2">
            <RatingWidget entityHash={entityHash} />
          </div>
        </div>
      )}
    </div>
  );
}
