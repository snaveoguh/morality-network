"use client";

import { useState } from "react";
import { useAccount, useReadContract, useSignTypedData, useWriteContract } from "wagmi";
import { mainnet } from "wagmi/chains";
import {
  NOUNS_DAO_DATA_PROXY,
  ADD_SIGNATURE_ABI,
  type CandidateProposal,
} from "@/lib/nouns-candidates";

// Nouns Token on mainnet
const NOUNS_TOKEN = "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03" as const;

const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// EIP-712 domain for NounsDAOLogicV3
const EIP712_DOMAIN = {
  name: "Nouns DAO",
  chainId: 1,
  verifyingContract: "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d" as `0x${string}`,
} as const;

// EIP-712 types for proposal candidate sponsorship
const PROPOSAL_CANDIDATE_TYPES = {
  UpdateProposalBySigs: [
    { name: "proposer", type: "address" },
    { name: "targets", type: "address[]" },
    { name: "values", type: "uint256[]" },
    { name: "signatures", type: "string[]" },
    { name: "calldatas", type: "bytes[]" },
    { name: "description", type: "string" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

interface SponsorPanelProps {
  candidate: CandidateProposal;
}

export function SponsorPanel({ candidate }: SponsorPanelProps) {
  const { address, isConnected } = useAccount();
  const [reason, setReason] = useState("");
  const [expiryDays, setExpiryDays] = useState(30);
  const [status, setStatus] = useState<"idle" | "signing" | "submitting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Check Noun balance
  const { data: nounBalance } = useReadContract({
    address: NOUNS_TOKEN,
    abi: BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: mainnet.id,
    query: { enabled: !!address },
  });

  const hasNoun = nounBalance != null && Number(nounBalance) > 0;

  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();

  const handleSponsor = async () => {
    if (!address || !hasNoun) return;

    try {
      setStatus("signing");
      setErrorMsg("");

      const expirationTimestamp = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;

      // Sign EIP-712 typed data
      const signature = await signTypedDataAsync({
        domain: EIP712_DOMAIN,
        types: PROPOSAL_CANDIDATE_TYPES,
        primaryType: "UpdateProposalBySigs",
        message: {
          proposer: candidate.proposer as `0x${string}`,
          targets: candidate.targets.map((t) => t as `0x${string}`),
          values: candidate.values.map((v) => BigInt(v)),
          signatures: candidate.signatures,
          calldatas: candidate.calldatas.map((c) => c as `0x${string}`),
          description: candidate.description,
          expiry: BigInt(expirationTimestamp),
        },
      });

      setStatus("submitting");

      // Submit signature onchain via NounsDAODataProxy
      await writeContractAsync({
        address: NOUNS_DAO_DATA_PROXY,
        abi: ADD_SIGNATURE_ABI,
        functionName: "addSignature",
        args: [
          signature as `0x${string}`,
          BigInt(expirationTimestamp),
          candidate.proposer as `0x${string}`,
          candidate.slug,
          BigInt(candidate.proposalIdToUpdate),
          candidate.encodedProposalHash as `0x${string}`,
          "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
          reason,
        ],
        chainId: mainnet.id,
      });

      setStatus("done");
    } catch (err: unknown) {
      setStatus("error");
      const e = err as Record<string, string>;
      setErrorMsg(e?.shortMessage || e?.message || "Sponsorship failed");
    }
  };

  if (!isConnected) {
    return (
      <div className="border border-[var(--rule)] p-4">
        <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Sponsor
        </h3>
        <p className="font-body-serif text-xs text-[var(--ink-faint)]">
          Connect your wallet to sponsor this candidate proposal.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule)] p-4">
      <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        Sponsor This Candidate
      </h3>

      {!hasNoun ? (
        <div>
          <p className="mb-2 font-body-serif text-xs text-[var(--ink-faint)]">
            Only Noun holders can sponsor candidate proposals.
          </p>
          <div className="border border-[var(--rule-light)] p-2 font-mono text-[9px] text-[var(--ink-faint)]">
            Your wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
            <br />
            Noun balance: 0
          </div>
        </div>
      ) : status === "done" ? (
        <div className="border border-[var(--rule)] p-3 text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
            Sponsorship submitted
          </p>
          <p className="mt-1 font-body-serif text-xs text-[var(--ink-faint)]">
            Your signature has been recorded onchain.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 border border-[var(--rule-light)] p-2 font-mono text-[9px] text-[var(--ink-faint)]">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)]" />
              <span className="font-bold text-[var(--ink)]">Noun Holder</span>
              <span className="ml-auto">
                {Number(nounBalance)} Noun
                {Number(nounBalance) !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Expiry selector */}
          <div className="mb-3">
            <label className="mb-1 block font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              Signature Expiry
            </label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 font-mono text-[10px] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          {/* Reason (optional) */}
          <div className="mb-3">
            <label className="mb-1 block font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you sponsoring?"
              className="w-full border border-[var(--rule)] bg-[var(--paper)] px-2 py-1.5 font-mono text-[10px] text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none focus:border-[var(--ink)]"
            />
          </div>

          <button
            onClick={handleSponsor}
            disabled={status === "signing" || status === "submitting"}
            className="w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "signing"
              ? "Sign in Wallet..."
              : status === "submitting"
                ? "Submitting Onchain..."
                : "Sponsor Candidate"}
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
