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
  });

  const { data: argMeta } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getArgumentMeta",
    args: [commentId],
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
  const renderedContent = normalizedMeta.exists
    ? comment.content
    : stripArgumentPrefix(comment.content);

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
        {renderedContent}
      </p>

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
