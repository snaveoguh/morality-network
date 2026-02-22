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
  const [status, setStatus] = useState<"idle" | "estimating" | "promoting" | "done" | "error">("idle");
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
      // Nouns client incentive format: description + "\n\n---\nClient: {clientId}"
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
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.shortMessage || err?.message || "Promotion failed");
    }
  };

  return (
    <div className="rounded-xl border border-[#31F387]/30 bg-[#31F387]/5 p-5">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#31F387]">
        Promote to Proposal
      </h3>

      {status === "done" ? (
        <div>
          <p className="mb-2 text-sm font-medium text-[#31F387]">
            Proposal created successfully!
          </p>
          {txHash && (
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#2F80ED] hover:underline"
            >
              View transaction on Etherscan &rarr;
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-400">
            This candidate has reached the required sponsor threshold. You can
            promote it to become an official Nouns DAO proposal.
          </p>

          <div className="mb-3 rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-500">
            <div className="flex justify-between">
              <span>Sponsors</span>
              <span className="text-[#31F387]">{candidate.signatureCount} / {candidate.requiredThreshold}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Client ID</span>
              <span className="font-mono text-white">{PROMOTE_CLIENT_ID}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Network</span>
              <span className="text-white">Ethereum Mainnet</span>
            </div>
          </div>

          <button
            onClick={handlePromote}
            disabled={status === "estimating" || status === "promoting"}
            className="w-full rounded-lg bg-[#31F387] px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-[#2ae076] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "estimating"
              ? "Estimating gas..."
              : status === "promoting"
              ? "Confirm in wallet..."
              : "Promote Proposal"}
          </button>

          {status === "error" && (
            <p className="mt-2 text-xs text-[#D0021B]">{errorMsg}</p>
          )}
        </>
      )}
    </div>
  );
}
