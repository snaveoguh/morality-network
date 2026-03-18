"use client";

import { useState } from "react";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { mainnet } from "viem/chains";
import type { Address } from "viem";

const RESERVOIR_BASE = "https://api.reservoir.tools";
const RESERVOIR_API_KEY = process.env.NEXT_PUBLIC_RESERVOIR_API_KEY || "";

interface BuyButtonProps {
  tokenId: string;
  contract: Address;
  priceEth: string;
}

export function BuyButton({ tokenId, contract, priceEth }: BuyButtonProps) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<"idle" | "switching" | "buying" | "signing" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    if (!address || !walletClient) return;

    try {
      // Switch to mainnet if needed
      if (chainId !== mainnet.id) {
        setStatus("switching");
        await switchChainAsync({ chainId: mainnet.id });
      }

      setStatus("buying");
      setError(null);

      // Get buy path from Reservoir
      const params = new URLSearchParams({
        tokens: `${contract}:${tokenId}`,
        taker: address,
        currency: "0x0000000000000000000000000000000000000000",
      });

      const headers: Record<string, string> = { accept: "application/json" };
      if (RESERVOIR_API_KEY) headers["x-api-key"] = RESERVOIR_API_KEY;

      const res = await fetch(`${RESERVOIR_BASE}/execute/buy/v7?${params}`, {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          items: [{ token: `${contract}:${tokenId}`, quantity: 1 }],
          taker: address,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Reservoir error ${res.status}`);
      }

      const data = await res.json();
      const steps = data.steps || [];

      // Execute each step
      for (const step of steps) {
        for (const item of step.items || []) {
          if (item.status === "complete") continue;

          setStatus("signing");

          if (item.data) {
            const txHash = await walletClient.sendTransaction({
              to: item.data.to as Address,
              data: item.data.data as `0x${string}`,
              value: BigInt(item.data.value || "0"),
              chain: mainnet,
              account: address,
            });

            // Wait briefly for indexing
            if (txHash) {
              setStatus("success");
              return;
            }
          }
        }
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  if (!address) return null;

  if (status === "success") {
    return (
      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)]">
        Purchased
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <button
        onClick={handleBuy}
        disabled={status === "buying" || status === "signing" || status === "switching"}
        className="border border-[var(--ink)] bg-[var(--ink)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        {status === "switching"
          ? "Switch Chain..."
          : status === "buying"
            ? "Preparing..."
            : status === "signing"
              ? "Sign Tx..."
              : `Buy ${parseFloat(priceEth).toFixed(4)} ETH`}
      </button>
      {status === "error" && error && (
        <span className="mt-0.5 font-mono text-[7px] text-[var(--accent-red)]">
          {error.slice(0, 60)}
        </span>
      )}
    </span>
  );
}
