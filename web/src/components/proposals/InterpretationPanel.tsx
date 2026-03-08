"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther } from "viem";
import {
  COMMENTS_ABI,
  CONTRACTS,
  PREDICTION_MARKET_ABI,
  PREDICTION_MARKET_ADDRESS,
} from "@/lib/contracts";
import { computeEntityHash } from "@/lib/entity";
import { getDaoPredictionKey, getPrimaryProposalEntityIdentifier } from "@/lib/proposal-entity";
import { parseEvidenceInput } from "@/lib/evidence";
import type { Proposal } from "@/lib/governance";

interface InterpretationPanelProps {
  proposal: Proposal;
}

export function InterpretationPanel({ proposal }: InterpretationPanelProps) {
  const { isConnected } = useAccount();
  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState("");
  const [selectedSide, setSelectedSide] = useState<"for" | "against" | null>(null);
  const [stakeAmount, setStakeAmount] = useState("0.01");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<"idle" | "posting" | "staking" | "done">("idle");

  const hasNumericProposalId = Number.isFinite(proposal.proposalNumber);
  const proposalId = hasNumericProposalId ? String(proposal.proposalNumber) : "0";
  const daoKey = getDaoPredictionKey(proposal.dao);
  const isStructurallyEligible =
    proposal.source === "onchain" && proposal.status !== "candidate" && hasNumericProposalId;

  const entityIdentifier = useMemo(
    () => getPrimaryProposalEntityIdentifier(daoKey, proposalId),
    [daoKey, proposalId]
  );
  const entityHash = useMemo(
    () => computeEntityHash(entityIdentifier),
    [entityIdentifier]
  );
  const evidencePreview = useMemo(() => parseEvidenceInput(evidence), [evidence]);

  const { data: daoResolvableData, isLoading: isDaoResolvableLoading } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "isDaoResolvable",
    args: [daoKey],
    query: { enabled: isStructurallyEligible },
  });

  const isDaoResolvable = daoResolvableData === true;
  const isEligible = isStructurallyEligible && isDaoResolvable;

  const {
    data: interpretationTxHash,
    writeContract: writeInterpretation,
    isPending: isSigningInterpretation,
    error: interpretationWriteError,
  } = useWriteContract();

  const {
    isLoading: isInterpretationConfirming,
    isSuccess: isInterpretationConfirmed,
  } = useWaitForTransactionReceipt({ hash: interpretationTxHash });

  const {
    data: stakeTxHash,
    writeContract: writeStake,
    isPending: isSigningStake,
    error: stakeWriteError,
  } = useWriteContract();

  const { isLoading: isStakeConfirming, isSuccess: isStakeConfirmed } =
    useWaitForTransactionReceipt({ hash: stakeTxHash });

  useEffect(() => {
    if (flowStep === "posting" && isInterpretationConfirmed) {
      try {
        const amount = parseEther(stakeAmount);
        writeStake({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: "stake",
          args: [daoKey, proposalId, selectedSide === "for"],
          value: amount,
        });
        setFlowStep("staking");
      } catch (error) {
        setFlowStep("idle");
        setErrorMessage((error as Error).message || "Invalid stake amount.");
      }
    }
  }, [
    flowStep,
    isInterpretationConfirmed,
    daoKey,
    proposalId,
    selectedSide,
    stakeAmount,
    writeStake,
  ]);

  useEffect(() => {
    if (isStakeConfirmed && flowStep === "staking") {
      setFlowStep("done");
      setClaim("");
      setEvidence("");
      setSelectedSide(null);
      setErrorMessage(null);
    }
  }, [isStakeConfirmed, flowStep]);

  useEffect(() => {
    if (flowStep === "posting" && interpretationWriteError) {
      setFlowStep("idle");
      setErrorMessage(
        (interpretationWriteError as { shortMessage?: string }).shortMessage ||
          interpretationWriteError.message
      );
    } else if (flowStep === "staking" && stakeWriteError) {
      setFlowStep("idle");
      setErrorMessage(
        (stakeWriteError as { shortMessage?: string }).shortMessage || stakeWriteError.message
      );
    }
  }, [flowStep, interpretationWriteError, stakeWriteError]);

  useEffect(() => {
    if (flowStep !== "done") return;
    if (claim || evidence || selectedSide || stakeAmount !== "0.01") {
      setFlowStep("idle");
    }
  }, [flowStep, claim, evidence, selectedSide, stakeAmount]);

  const stakeValue = Number(stakeAmount);
  const isBusy =
    flowStep === "posting" ||
    flowStep === "staking" ||
    isSigningInterpretation ||
    isInterpretationConfirming ||
    isSigningStake ||
    isStakeConfirming;

  const canSubmit =
    isConnected &&
    isEligible &&
    !isBusy &&
    claim.trim().length > 20 &&
    evidencePreview.isValidUrl &&
    selectedSide !== null &&
    Number.isFinite(stakeValue) &&
    stakeValue > 0;

  function handleSubmit() {
    if (!canSubmit || selectedSide === null) return;
    setErrorMessage(null);

    const evidenceHash = evidencePreview.evidenceHash;
    const argumentType = selectedSide === "for" ? 1 : 2;
    const commentContent = `${claim.trim()}\n\nEvidence: ${evidencePreview.normalized}`;

    writeInterpretation({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "commentStructured",
      args: [entityHash, commentContent, BigInt(0), argumentType, BigInt(0), evidenceHash],
    });

    setFlowStep("posting");
  }

  return (
    <div className="border-t border-[var(--rule)] pt-4">
      <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        Post Interpretation
      </h3>
      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        Claim + evidence + prediction stake
      </p>

      {!isEligible && (
        <p className="mt-3 border border-[var(--rule-light)] px-2 py-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {!isStructurallyEligible
            ? "Requires an onchain proposal with numeric proposal ID."
            : isDaoResolvableLoading
              ? "Checking resolver support..."
              : "DAO resolver not configured for interpretation markets on this chain."}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <textarea
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          rows={3}
          placeholder="Claim: This proposal will fail due to whale voting alignment..."
          className="w-full resize-none border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1.5 font-body-serif text-xs text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--rule)]"
          maxLength={600}
          disabled={isBusy}
        />

        <input
          type="text"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="https://example.com/source"
          className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2 py-1.5 font-mono text-[10px] text-[var(--ink)] placeholder-[var(--ink-faint)] outline-none transition-colors focus:border-[var(--rule)]"
          disabled={isBusy}
        />
        {evidence.trim().length > 0 && (
          <div className="border border-[var(--rule-light)] p-2">
            {evidencePreview.isValidUrl ? (
              <>
                <div className="mb-1 flex items-center gap-2 font-mono text-[8px] uppercase tracking-wider">
                  <span className="font-bold text-[var(--ink)]">{evidencePreview.sourceType}</span>
                  <span className="text-[var(--rule-light)]">|</span>
                  <span className="text-[var(--ink-faint)]">{evidencePreview.qualityTier} confidence</span>
                </div>
                <p className="font-mono text-[9px] text-[var(--ink-faint)]">
                  {evidencePreview.host}
                </p>
                <p className="mt-1 line-clamp-2 font-mono text-[9px] text-[var(--ink-light)]">
                  {evidencePreview.normalized}
                </p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
                  hash: {evidencePreview.evidenceHash.slice(0, 10)}...
                  {evidencePreview.evidenceHash.slice(-6)}
                </p>
                {evidencePreview.warnings.map((warning) => (
                  <p key={warning} className="mt-1 font-mono text-[8px] text-[var(--ink-faint)]">
                    {warning}
                  </p>
                ))}
              </>
            ) : (
              <p className="font-mono text-[9px] text-[var(--accent-red)]">
                {evidencePreview.warnings[0]}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
          {["for", "against"].map((side, i) => (
            <span key={side} className="flex items-center">
              {i > 0 && <span className="mx-2 text-[var(--rule-light)]">|</span>}
              <button
                onClick={() => setSelectedSide(side as "for" | "against")}
                className={`transition-colors ${
                  selectedSide === side
                    ? "font-bold text-[var(--ink)] underline underline-offset-4"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
                disabled={isBusy}
              >
                predict {side}
              </button>
            </span>
          ))}
        </div>

        <div className="flex items-center border border-[var(--rule-light)] bg-[var(--paper)]">
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            className="w-full bg-transparent px-2 py-1.5 font-mono text-xs text-[var(--ink)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder="0.01"
            disabled={isBusy}
          />
          <span className="shrink-0 pr-2 font-mono text-[10px] text-[var(--ink-faint)]">ETH</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full border-2 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${
            !canSubmit
              ? "cursor-not-allowed border-[var(--rule-light)] text-[var(--ink-faint)]"
              : "border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          }`}
        >
          {flowStep === "posting" || isInterpretationConfirming
            ? "Confirming interpretation..."
            : flowStep === "staking" || isStakeConfirming
              ? "Confirming prediction stake..."
              : flowStep === "done"
                ? "Interpretation posted"
                : "Post interpretation"}
        </button>

        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          ID: {entityIdentifier}
        </p>

        {errorMessage && (
          <p className="font-mono text-[9px] text-[var(--accent-red)]">{errorMessage}</p>
        )}
        {!evidencePreview.isValidUrl && evidence.trim().length > 0 && (
          <p className="font-mono text-[8px] text-[var(--ink-faint)]">
            Use a full URL so this interpretation can be scored reliably.
          </p>
        )}
      </div>
    </div>
  );
}
