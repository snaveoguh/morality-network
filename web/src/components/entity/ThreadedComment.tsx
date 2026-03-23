"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { CONTRACTS, CONTRACTS_CHAIN_ID, COMMENTS_ABI } from "@/lib/contracts";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "./TipButton";
import { ArgumentBadge } from "./ArgumentBadge";
import { StructuredCommentForm } from "./StructuredCommentForm";
import { timeAgo, formatEth } from "@/lib/entity";
import {
  deriveArgumentTypeFromContent,
  normalizeArgumentMeta,
  stripArgumentPrefix,
  parseLegacyEvidenceLines,
} from "@/lib/comment-arguments";

interface ThreadedCommentProps {
  commentId: bigint;
  entityHash: `0x${string}`;
  depth?: number;
  childMap: Map<string, bigint[]>;
  onRefetch: () => void;
  supportsStructuredComments: boolean;
}

const MAX_DEPTH = 4;

export function ThreadedComment({
  commentId,
  entityHash,
  depth = 0,
  childMap,
  onRefetch,
  supportsStructuredComments,
}: ThreadedCommentProps) {
  const { isConnected } = useAccount();
  const [showReplyForm, setShowReplyForm] = useState(false);

  const { data: comment } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getComment",
    args: [commentId],
    chainId: CONTRACTS_CHAIN_ID,
  });

  const { data: argMeta } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getArgumentMeta",
    args: [commentId],
    chainId: CONTRACTS_CHAIN_ID,
    query: { enabled: supportsStructuredComments, retry: false },
  });

  const { writeContract: voteOnComment } = useWriteContract();

  if (!comment || !comment.exists) return null;

  const children = childMap.get(commentId.toString()) || [];
  const score = Number(comment.score);
  const normalizedMeta = normalizeArgumentMeta(argMeta);
  const fallbackArgumentType = deriveArgumentTypeFromContent(comment.content);
  const argumentType = normalizedMeta.exists
    ? normalizedMeta.argumentType
    : fallbackArgumentType;
  const strippedContent = normalizedMeta.exists
    ? comment.content
    : stripArgumentPrefix(comment.content);

  // Parse legacy "Evidence: <url>" / "Reference: #<id>" lines from content
  const legacy = parseLegacyEvidenceLines(strippedContent);
  const renderedContent = legacy.cleanContent || strippedContent;
  const evidenceUrl = legacy.evidenceUrl;
  const refCommentId = normalizedMeta.exists && normalizedMeta.referenceCommentId > BigInt(0)
    ? normalizedMeta.referenceCommentId.toString()
    : legacy.referenceId;

  function handleVote(v: 1 | -1) {
    voteOnComment({
      chainId: CONTRACTS_CHAIN_ID,
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "vote",
      args: [commentId, v],
    });
  }

  return (
    <div
      className="border-b border-[var(--rule-light)] pb-2"
      style={{ marginLeft: depth > 0 ? `${Math.min(depth, MAX_DEPTH) * 16}px` : 0 }}
    >
      {/* Depth indicator */}
      {depth > 0 && (
        <div
          className="mb-1 h-px"
          style={{
            width: `${Math.min(depth * 8, 32)}px`,
            backgroundColor: "var(--rule-light)",
          }}
        />
      )}

      {/* Header: author + argument badge + time */}
      <div className="mb-1 flex items-center gap-2">
        <AddressDisplay
          address={comment.author}
          className="font-mono text-[10px] font-bold text-[var(--ink-light)]"
        />
        <ArgumentBadge argumentType={argumentType} />
        <span className="ml-auto font-mono text-[8px] text-[var(--ink-faint)]">
          #{commentId.toString()} &bull; {timeAgo(Number(comment.timestamp))}
        </span>
      </div>

      {/* Content */}
      <p className="mb-2 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
        <LinkifyText text={renderedContent} />
      </p>

      {/* Evidence / Reference metadata */}
      {(evidenceUrl || refCommentId) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-[var(--rule)] pl-2 font-mono text-[9px] text-[var(--ink-faint)]">
          {evidenceUrl && (
            <a
              href={evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[var(--ink-light)] underline underline-offset-2 transition-colors hover:text-[var(--ink)]"
            >
              <span className="text-[8px] uppercase tracking-wider">Evidence</span>
              <span className="max-w-[200px] truncate">{evidenceUrl.replace(/^https?:\/\//, "")}</span>
              <span>↗</span>
            </a>
          )}
          {refCommentId && (
            <span className="text-[var(--ink-faint)]">
              Re: <span className="font-bold">#{refCommentId}</span>
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 font-mono text-[9px] text-[var(--ink-faint)]">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => isConnected && handleVote(1)}
            className="px-0.5 transition-colors hover:text-[var(--ink)] disabled:opacity-40"
            disabled={!isConnected}
          >
            &#9650;
          </button>
          <span
            className={`min-w-[2ch] text-center font-bold ${
              score > 0
                ? "text-[var(--ink)]"
                : score < 0
                  ? "text-[var(--accent-red)]"
                  : ""
            }`}
          >
            {score}
          </span>
          <button
            onClick={() => isConnected && handleVote(-1)}
            className="px-0.5 transition-colors hover:text-[var(--accent-red)] disabled:opacity-40"
            disabled={!isConnected}
          >
            &#9660;
          </button>
        </div>

        <span className="text-[var(--rule-light)]">|</span>

        {depth < MAX_DEPTH && (
          <button
            onClick={() => setShowReplyForm(!showReplyForm)}
            className="uppercase tracking-wider transition-colors hover:text-[var(--ink)]"
            disabled={!isConnected}
          >
            {showReplyForm ? "Cancel" : "Reply"}
          </button>
        )}

        {comment.tipTotal > BigInt(0) && (
          <>
            <span className="text-[var(--rule-light)]">|</span>
            <span className="font-bold text-[var(--ink)]">
              {formatEth(comment.tipTotal)} tipped
            </span>
          </>
        )}

        {isConnected && (
          <>
            <span className="text-[var(--rule-light)]">|</span>
            <TipButton entityHash={entityHash} commentId={commentId} />
          </>
        )}
      </div>

      {/* Reply form */}
      {showReplyForm && (
        <div className="mt-2">
          <StructuredCommentForm
            entityHash={entityHash}
            parentId={commentId}
            onCancel={() => setShowReplyForm(false)}
            onSuccess={() => {
              setShowReplyForm(false);
              onRefetch();
            }}
            compact
            supportsStructuredComments={supportsStructuredComments}
          />
        </div>
      )}

      {/* Children */}
      {children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map((childId) => (
            <ThreadedComment
              key={childId.toString()}
              commentId={childId}
              entityHash={entityHash}
              depth={depth + 1}
              childMap={childMap}
              onRefetch={onRefetch}
              supportsStructuredComments={supportsStructuredComments}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Linkify URLs in comment text ──

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function LinkifyText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--ink)] underline underline-offset-2 transition-colors hover:text-[var(--accent-red)]"
      >
        {url.replace(/^https?:\/\//, "").slice(0, 60)}{url.replace(/^https?:\/\//, "").length > 60 ? "…" : ""}
      </a>,
    );
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
