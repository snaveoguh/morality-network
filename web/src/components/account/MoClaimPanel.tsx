"use client";

import { useEffect, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// ============================================================================
// MO CLAIM PANEL — /account
//
// Shows the signed-in holder their Merkle claim for the latest epoch and lets
// them submit it from the linked wallet. The proof only pays the address they
// signature-proved at link time, so the tx can be sent from any connected
// wallet — but we nudge toward the linked one for gas/ownership clarity.
// Hidden entirely until claiming opens (distributor env set + leaf exists).
// ============================================================================

const DISTRIBUTOR_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "index", type: "uint256" },
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
] as const;

interface ClaimData {
  epoch: number;
  index: number;
  address: string;
  amountWei: string;
  proof: string[];
  root: string;
  claimedTx: string | null;
  claimedAt: string | null;
}

const WEI_PER_MO = BigInt("1000000000000000000");
const WEI_PER_TEN_THOUSANDTH = BigInt("100000000000000");

function formatMoFromWei(wei: string): string {
  const v = BigInt(wei);
  const whole = v / WEI_PER_MO;
  const frac = ((v % WEI_PER_MO) / WEI_PER_TEN_THOUSANDTH)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  return `${whole.toLocaleString()}${frac ? `.${frac}` : ""}`;
}

export function MoClaimPanel() {
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [distributor, setDistributor] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const { address: connected } = useAccount();

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    fetch("/api/account/claim-proof")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setClaim(data.claim);
        setDistributor(data.distributor);
      })
      .catch(() => {});
  }, []);

  // After onchain confirmation, record the ledger debit server-side.
  useEffect(() => {
    if (!confirmed || !txHash || recorded) return;
    fetch("/api/account/claim-confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    })
      .then(() => setRecorded(true))
      .catch(() => {});
  }, [confirmed, txHash, recorded]);

  // Nothing to show until claiming is open AND this account has a leaf.
  if (!claim || !distributor) return null;

  const alreadyClaimed = Boolean(claim.claimedTx) || confirmed;
  const wrongWallet = connected && connected.toLowerCase() !== claim.address.toLowerCase();

  return (
    <section className="mt-8">
      <h2 className="font-headline text-lg">Claim your MO onchain</h2>
      <div className="mt-3 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Claimable — epoch {claim.epoch}
        </p>
        <p className="font-masthead mt-2 text-4xl leading-none">
          {formatMoFromWei(claim.amountWei)} MO
        </p>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--ink-light)]">
          Pays out to your linked wallet{" "}
          <span className="font-mono text-xs">{claim.address}</span> on Base. The
          claim is verified against a published Merkle root — nobody, including
          us, can redirect it to another address.
        </p>

        {alreadyClaimed ? (
          <p className="mt-4 border-l-4 border-[var(--ink)] pl-3 text-sm">
            Claimed onchain{claim.claimedTx || txHash ? (
              <>
                {" — "}
                <a
                  className="underline underline-offset-4"
                  href={`https://basescan.org/tx/${claim.claimedTx ?? txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  view transaction
                </a>
              </>
            ) : null}
            .
          </p>
        ) : !connected ? (
          <div className="mt-4">
            <ConnectButton label="Connect wallet to claim" />
          </div>
        ) : (
          <div className="mt-4">
            {wrongWallet && (
              <p className="mb-3 text-sm text-[var(--accent-red)]">
                You&apos;re connected as {connected.slice(0, 6)}…{connected.slice(-4)}. Any
                wallet can submit the claim (it still pays your linked wallet),
                but connecting the linked wallet is simplest.
              </p>
            )}
            <button
              onClick={() =>
                writeContract({
                  address: distributor as `0x${string}`,
                  abi: DISTRIBUTOR_ABI,
                  functionName: "claim",
                  args: [
                    BigInt(claim.epoch),
                    BigInt(claim.index),
                    claim.address as `0x${string}`,
                    BigInt(claim.amountWei),
                    claim.proof as `0x${string}`[],
                  ],
                })
              }
              disabled={isPending || confirming}
              className="border-2 border-[var(--ink)] bg-[var(--ink)] px-5 py-2 text-[12px] uppercase tracking-[0.18em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {isPending ? "Confirm in wallet…" : confirming ? "Confirming onchain…" : "Claim MO"}
            </button>
            {writeError && (
              <p className="mt-2 text-sm text-[var(--accent-red)]">
                {writeError.message.split("\n")[0]}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
