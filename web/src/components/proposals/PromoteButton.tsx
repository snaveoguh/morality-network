"use client";

import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import {
  NOUNS_DAO_LOGIC_V3,
  PROMOTE_CLIENT_ID,
  PROPOSE_BY_SIGS_ABI,
  type CandidateProposal,
} from "@/lib/nouns-candidates";

interface PromoteButtonProps {
  candidate: CandidateProposal;
}

export function PromoteButton({ candidate }: PromoteButtonProps) {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const [status, setStatus] = useState<
    "idle" | "estimating" | "promoting" | "done" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [txHash, setTxHash] = useState("");

  if (!isConnected || !candidate.isPromotable) return null;

  const handlePromote = async () => {
    try {
      setStatus("estimating");
      setErrorMsg("");

      // Build the proposer signatures array for proposeBySigs
      const proposerSignatures = candidate.sponsorSignatures.map((sig) => ({
        sig: sig.sig as `0x${string}`,
        signer: sig.signer as `0x${string}`,
        expirationTimestamp: BigInt(sig.expirationTimestamp),
      }));

      // Build the full description with clientId appended
      const descriptionWithClient = `${candidate.description}\n\n---\nClient: ${PROMOTE_CLIENT_ID}`;

      setStatus("promoting");

      const hash = await writeContractAsync({
        address: NOUNS_DAO_LOGIC_V3,
        abi: PROPOSE_BY_SIGS_ABI,
        functionName: "proposeBySigs",
        args: [
          proposerSignatures,
          candidate.targets.map((t) => t as `0x${string}`),
          candidate.values.map((v) => BigInt(v)),
          candidate.signatures,
          candidate.calldatas.map((c) => c as `0x${string}`),
          descriptionWithClient,
        ],
        chainId: mainnet.id,
      });

      setTxHash(hash);
      setStatus("done");
    } catch (err: unknown) {
      setStatus("error");
      const e = err as Record<string, string>;
      setErrorMsg(e?.shortMessage || e?.message || "Promotion failed");
    }
  };

  return (
    <div className="border border-[var(--rule)] p-4">
      <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        Promote to Proposal
      </h3>

      {status === "done" ? (
        <div>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
            Proposal created successfully
          </p>
          {txHash && (
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              View on Etherscan &rsaquo;
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 font-body-serif text-xs text-[var(--ink-faint)]">
            This candidate has reached the required sponsor threshold. You can
            promote it to become an official Nouns DAO proposal.
          </p>

          <div className="mb-3 border border-[var(--rule-light)] p-2 font-mono text-[9px]">
            <div className="flex justify-between text-[var(--ink-faint)]">
              <span>Sponsors</span>
              <span className="font-bold text-[var(--ink)]">
                {candidate.signatureCount} / {candidate.requiredThreshold}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-[var(--ink-faint)]">
              <span>Client ID</span>
              <span className="text-[var(--ink)]">{PROMOTE_CLIENT_ID}</span>
            </div>
            <div className="mt-1 flex justify-between text-[var(--ink-faint)]">
              <span>Network</span>
              <span className="text-[var(--ink)]">Ethereum Mainnet</span>
            </div>
          </div>

          <button
            onClick={handlePromote}
            disabled={status === "estimating" || status === "promoting"}
            className="w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "estimating"
              ? "Estimating gas..."
              : status === "promoting"
                ? "Confirm in wallet..."
                : "Promote Proposal"}
          </button>

          {status === "error" && (
            <p className="mt-2 font-mono text-[9px] text-[var(--accent-red)]">
              {errorMsg}
            </p>
          )}
        </>
      )}
    </div>
  );
}
