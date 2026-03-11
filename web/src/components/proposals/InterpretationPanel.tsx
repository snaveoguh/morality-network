"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  COMMENTS_ABI,
  CONTRACTS,
  CONTRACTS_CHAIN_ID,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<"idle" | "posting" | "done">("idle");

  const proposalId = Number.isFinite(proposal.proposalNumber)
    ? String(proposal.proposalNumber)
    : proposal.id;
  const daoKey = getDaoPredictionKey(proposal.dao);

  const entityIdentifier = useMemo(
    () => getPrimaryProposalEntityIdentifier(daoKey, proposalId),
    [daoKey, proposalId]
  );
  const entityHash = useMemo(
    () => computeEntityHash(entityIdentifier),
    [entityIdentifier]
  );
  const evidencePreview = useMemo(() => parseEvidenceInput(evidence), [evidence]);

  const {
    data: interpretationTxHash,
    writeContract: writeInterpretation,
    isPending: isSigningInterpretation,
    error: interpretationWriteError,
  } = useWriteContract();

  const {
    isLoading: isInterpretationConfirming,
    isSuccess: isInterpretationConfirmed,
  } = useWaitForTransactionReceipt({
    hash: interpretationTxHash,
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: !!interpretationTxHash },
  });

  useEffect(() => {
    if (isInterpretationConfirmed && flowStep === "posting") {
      setFlowStep("done");
      setClaim("");
      setEvidence("");
      setSelectedSide(null);
      setErrorMessage(null);
    }
  }, [isInterpretationConfirmed, flowStep]);

  useEffect(() => {
    if (flowStep === "posting" && interpretationWriteError) {
      setFlowStep("idle");
      setErrorMessage(
        (interpretationWriteError as { shortMessage?: string }).shortMessage ||
          interpretationWriteError.message
      );
    }
  }, [flowStep, interpretationWriteError]);

  useEffect(() => {
    if (flowStep !== "done") return;
    if (claim || evidence || selectedSide) {
      setFlowStep("idle");
    }
  }, [flowStep, claim, evidence, selectedSide]);

  const isBusy = flowStep === "posting" || isSigningInterpretation || isInterpretationConfirming;

  const canSubmit =
    isConnected &&
    !isBusy &&
    claim.trim().length > 20 &&
    evidencePreview.isValidUrl &&
    selectedSide !== null;

  function handleSubmit() {
    if (!canSubmit || selectedSide === null) return;
    setErrorMessage(null);
    setFlowStep("posting");

    const evidenceHash = evidencePreview.evidenceHash;
    const argumentType = selectedSide === "for" ? 1 : 2;
    const commentContent = `${claim.trim()}\n\nEvidence: ${evidencePreview.normalized}`;

    writeInterpretation({
      chainId: CONTRACTS_CHAIN_ID,
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "commentStructured",
      args: [entityHash, commentContent, BigInt(0), argumentType, BigInt(0), evidenceHash],
    });
  }

  return (
    <div className="border-t border-[var(--rule)] pt-4">
      <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
        Post Interpretation
      </h3>
      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        Claim + evidence
      </p>

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
                {side === "for" ? "supports proposal" : "opposes proposal"}
              </button>
            </span>
          ))}
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
            : flowStep === "done"
              ? "Interpretation posted"
              : "Post interpretation"}
        </button>

        <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Interpretations post onchain directly. Prediction stakes happen separately below.
        </p>

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
