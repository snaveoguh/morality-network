"use client";

import { useState } from "react";
import { useAccount, useWalletClient, useReadContract, useSwitchChain } from "wagmi";
import { mainnet } from "viem/chains";
import { parseEther, type Address } from "viem";
import { EMBLEM_VAULT_ABI } from "@/lib/contracts";

const RESERVOIR_BASE = "https://api.reservoir.tools";
const RESERVOIR_API_KEY = process.env.NEXT_PUBLIC_RESERVOIR_API_KEY || "";

// Seaport 1.6 conduit
const SEAPORT_CONDUIT = "0x1E0049783F008A0085193E00003D00cd54003c71" as Address;

interface ListButtonProps {
  tokenId: string;
  contract: Address;
}

export function ListButton({ tokenId, contract }: ListButtonProps) {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<"idle" | "input" | "approving" | "listing" | "success" | "error">("idle");
  const [priceInput, setPriceInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: isApproved } = useReadContract({
    address: contract,
    abi: EMBLEM_VAULT_ABI,
    functionName: "isApprovedForAll",
    args: address ? [address, SEAPORT_CONDUIT] : undefined,
    chainId: mainnet.id,
  });

  const handleList = async () => {
    if (!address || !walletClient || !priceInput) return;

    const priceWei = parseEther(priceInput);
    if (priceWei <= BigInt(0)) return;

    try {
      // Switch to mainnet if needed
      if (chainId !== mainnet.id) {
        await switchChainAsync({ chainId: mainnet.id });
      }

      // Approve Seaport conduit if needed
      if (!isApproved) {
        setStatus("approving");
        await walletClient.writeContract({
          address: contract,
          abi: EMBLEM_VAULT_ABI,
          functionName: "setApprovalForAll",
          args: [SEAPORT_CONDUIT, true],
          chain: mainnet,
          account: address,
        });
      }

      setStatus("listing");
      setError(null);

      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
      };
      if (RESERVOIR_API_KEY) headers["x-api-key"] = RESERVOIR_API_KEY;

      const res = await fetch(`${RESERVOIR_BASE}/execute/list/v5`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          maker: address,
          source: "morality.network",
          params: [
            {
              token: `${contract}:${tokenId}`,
              weiPrice: priceWei.toString(),
              orderKind: "seaport-v1.6",
              orderbook: "reservoir",
              expirationTime: String(Math.floor(Date.now() / 1000) + 30 * 24 * 3600), // 30 days
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Reservoir error ${res.status}`);
      }

      const data = await res.json();
      const steps = data.steps || [];

      for (const step of steps) {
        for (const item of step.items || []) {
          if (item.status === "complete") continue;

          if (step.kind === "signature" && item.data) {
            // Sign the Seaport order
            const signature = await walletClient.signTypedData(item.data);
            if (signature) {
              // Post signature back
              if (item.post) {
                await fetch(item.post.endpoint, {
                  method: "POST",
                  headers: { "content-type": "application/json", ...headers },
                  body: JSON.stringify({
                    ...item.post.body,
                    signature,
                  }),
                });
              }
            }
          } else if (item.data) {
            await walletClient.sendTransaction({
              to: item.data.to as Address,
              data: item.data.data as `0x${string}`,
              value: BigInt(item.data.value || "0"),
              chain: mainnet,
              account: address,
            });
          }
        }
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Listing failed");
    }
  };

  if (!address) return null;

  if (status === "success") {
    return (
      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--ink)]">
        Listed for {priceInput} ETH
      </span>
    );
  }

  if (status === "idle") {
    return (
      <button
        onClick={() => setStatus("input")}
        className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        List for Sale
      </button>
    );
  }

  if (status === "input") {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          step="0.001"
          min="0"
          placeholder="ETH"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          className="w-20 border border-[var(--rule)] bg-[var(--paper)] px-1 py-0.5 font-mono text-[9px] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
        />
        <button
          onClick={handleList}
          disabled={!priceInput || parseFloat(priceInput) <= 0}
          className="border border-[var(--ink)] bg-[var(--ink)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          List
        </button>
        <button
          onClick={() => setStatus("idle")}
          className="font-mono text-[8px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        >
          &times;
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        {status === "approving" ? "Approving..." : "Creating listing..."}
      </span>
      {status === "error" && error && (
        <span className="mt-0.5 font-mono text-[7px] text-[var(--accent-red)]">
          {error.slice(0, 60)}
        </span>
      )}
    </span>
  );
}
