"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { CONTRACTS, TIPPING_ABI } from "@/lib/contracts";

const TIP_AMOUNTS = [
  { label: "0.001", value: "0.001" },
  { label: "0.005", value: "0.005" },
  { label: "0.01", value: "0.01" },
  { label: "0.1", value: "0.1" },
];

interface TipButtonProps {
  entityHash: `0x${string}`;
  commentId?: bigint;
}

export function TipButton({ entityHash, commentId }: TipButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  function handleTip(amount: string) {
    setSelectedAmount(amount);

    if (commentId !== undefined) {
      writeContract({
        address: CONTRACTS.tipping,
        abi: TIPPING_ABI,
        functionName: "tipComment",
        args: [commentId],
        value: parseEther(amount),
      });
    } else {
      writeContract({
        address: CONTRACTS.tipping,
        abi: TIPPING_ABI,
        functionName: "tipEntity",
        args: [entityHash],
        value: parseEther(amount),
      });
    }

    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending || isConfirming}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-[#2F80ED] hover:text-[#31F387] disabled:opacity-50"
      >
        {isPending || isConfirming ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#31F387] border-t-transparent" />
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {isSuccess ? "Tipped!" : isPending ? "Signing..." : isConfirming ? "Confirming..." : "Tip"}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl">
          <p className="mb-2 text-xs text-zinc-400">Select tip amount (ETH)</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TIP_AMOUNTS.map((tip) => (
              <button
                key={tip.value}
                onClick={() => handleTip(tip.value)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-white transition-colors hover:border-[#2F80ED] hover:bg-[#2F80ED]/10"
              >
                {tip.label} ETH
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
