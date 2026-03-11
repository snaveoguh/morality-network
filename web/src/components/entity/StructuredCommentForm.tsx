"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, CONTRACTS_CHAIN_ID, COMMENTS_ABI } from "@/lib/contracts";
import { parseEvidenceInput } from "@/lib/evidence";
import { encodeLegacyStructuredComment } from "@/lib/comment-arguments";
import { ArgumentType } from "./ArgumentBadge";

interface StructuredCommentFormProps {
  entityHash: `0x${string}`;
  parentId?: bigint;
  onCancel?: () => void;
  onSuccess?: () => void;
  compact?: boolean;
  supportsStructuredComments?: boolean;
}

export function StructuredCommentForm({
  entityHash,
  parentId,
  onCancel,
  onSuccess,
  compact = false,
  supportsStructuredComments = true,
}: StructuredCommentFormProps) {
  const { isConnected } = useAccount();
  const [content, setContent] = useState("");
  const [argumentType, setArgumentType] = useState<ArgumentType>(ArgumentType.Discussion);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [referenceId, setReferenceId] = useState("");

  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  // Reset form on success — useEffect with guard to prevent infinite loop
  const hasResetRef = useRef(false);
  useEffect(() => {
    if (isSuccess && !hasResetRef.current) {
      hasResetRef.current = true;
      setContent("");
      setArgumentType(ArgumentType.Discussion);
      setEvidenceUrl("");
      setReferenceId("");
      resetWrite(); // Clear txHash so isSuccess resets for next submission
      onSuccess?.();
    }
    if (!isSuccess) {
      hasResetRef.current = false;
    }
  }, [isSuccess, onSuccess, resetWrite]);

  const parsedEvidence = evidenceUrl ? parseEvidenceInput(evidenceUrl) : null;
  const isStructured = argumentType !== ArgumentType.Discussion;

  function handleSubmit() {
    if (!content.trim() || !isConnected) return;

    const parentIdBig = parentId || BigInt(0);

    if (isStructured && supportsStructuredComments) {
      const evidenceHash = parsedEvidence?.evidenceHash || ("0x" + "0".repeat(64)) as `0x${string}`;
      const refId = referenceId ? BigInt(referenceId) : BigInt(0);

      writeContract({
        chainId: CONTRACTS_CHAIN_ID,
        address: CONTRACTS.comments,
        abi: COMMENTS_ABI,
        functionName: "commentStructured",
        args: [entityHash, content.trim(), parentIdBig, argumentType, refId, evidenceHash],
      });
    } else {
      const finalContent = isStructured
        ? encodeLegacyStructuredComment(argumentType, content, {
            referenceId: referenceId || undefined,
            evidenceUrl: parsedEvidence?.normalized || undefined,
          })
        : content.trim();

      writeContract({
        chainId: CONTRACTS_CHAIN_ID,
        address: CONTRACTS.comments,
        abi: COMMENTS_ABI,
        functionName: "comment",
        args: [entityHash, finalContent, parentIdBig],
      });
    }
  }

  if (!isConnected) {
    return (
      <p className="border border-[var(--rule-light)] p-4 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
        Connect your wallet to join the discussion.
      </p>
    );
  }

  const argTypes = [
    { value: ArgumentType.Discussion, label: "Discuss" },
    { value: ArgumentType.Claim, label: "Claim" },
    { value: ArgumentType.Counterclaim, label: "Counter" },
    { value: ArgumentType.Evidence, label: "Evidence" },
    { value: ArgumentType.Source, label: "Source" },
  ];

  return (
    <div className={compact ? "" : "border border-[var(--rule-light)] p-3"}>
      {/* Argument type selector -- pipe-separated */}
      <div className="mb-2 flex items-center gap-0 font-mono text-[9px] uppercase tracking-wider">
        {argTypes.map((at, i) => (
          <span key={at.value} className="flex items-center">
            {i > 0 && <span className="mx-1.5 text-[var(--rule-light)]">|</span>}
            <button
              onClick={() => setArgumentType(at.value)}
              className={`transition-colors ${
                argumentType === at.value
                  ? "font-bold text-[var(--ink)] underline underline-offset-2"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {at.label}
            </button>
          </span>
        ))}
      </div>
      {!supportsStructuredComments && argumentType !== ArgumentType.Discussion && (
        <p className="mb-2 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Structured metadata not live on this contract yet; posting as tagged text fallback.
        </p>
      )}

      {/* Reply indicator */}
      {parentId && (
        <div className="mb-2 flex items-center gap-2 font-mono text-[9px] text-[var(--ink-faint)]">
          Replying to #{parentId.toString()}
          {onCancel && (
            <button
              onClick={onCancel}
              className="font-bold text-[var(--accent-red)] transition-colors hover:text-[var(--ink)]"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Content textarea */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={
          isStructured
            ? `Enter your ${ArgumentType[argumentType].toLowerCase()}...`
            : "Share your thoughts onchain..."
        }
        className="w-full resize-none border border-[var(--rule-light)] bg-[var(--paper)] p-2.5 font-body-serif text-sm text-[var(--ink)] placeholder-[var(--ink-faint)] focus:border-[var(--rule)] focus:outline-none"
        rows={compact ? 2 : 3}
        maxLength={2000}
      />

      {/* Evidence URL input (for Evidence/Source types) */}
      {(argumentType === ArgumentType.Evidence || argumentType === ArgumentType.Source) && (
        <div className="mt-2">
          <input
            type="url"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="Paste evidence URL (https://...)"
            className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink)] placeholder-[var(--ink-faint)] focus:border-[var(--rule)] focus:outline-none"
          />
          {parsedEvidence && (
            <div className="mt-1 flex items-center gap-2 font-mono text-[8px]">
              <span
                className={`uppercase tracking-wider ${
                  parsedEvidence.qualityTier === "high"
                    ? "text-green-700"
                    : parsedEvidence.qualityTier === "medium"
                      ? "text-yellow-700"
                      : "text-[var(--accent-red)]"
                }`}
              >
                {parsedEvidence.sourceType}
              </span>
              <span className="text-[var(--ink-faint)]">
                Quality: {parsedEvidence.qualityTier}
              </span>
              {parsedEvidence.warnings.map((w, i) => (
                <span key={i} className="text-[var(--accent-red)]">{w}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reference comment ID (for Counterclaim/Evidence) */}
      {(argumentType === ArgumentType.Counterclaim || argumentType === ArgumentType.Evidence) && (
        <div className="mt-2">
          <input
            type="text"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value.replace(/\D/g, ""))}
            placeholder="Reference comment # (optional)"
            className="w-full border border-[var(--rule-light)] bg-[var(--paper)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink)] placeholder-[var(--ink-faint)] focus:border-[var(--rule)] focus:outline-none"
          />
        </div>
      )}

      {/* Submit row */}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[8px] text-[var(--ink-faint)]">
          {content.length}/2000 &mdash; Stored permanently onchain
          {isStructured && " (structured)"}
        </span>
        <button
          onClick={handleSubmit}
          disabled={!content.trim() || isPending || isConfirming}
          className="border border-[var(--rule)] bg-[var(--ink)] px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {isPending ? "Signing\u2026" : isConfirming ? "Confirming\u2026" : "Post Onchain"}
        </button>
      </div>

      {writeError && (
        <p className="mt-1 font-mono text-[9px] text-[var(--accent-red)]">
          {(writeError as { shortMessage?: string }).shortMessage || writeError.message}
        </p>
      )}
    </div>
  );
}
