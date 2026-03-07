"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { CONTRACTS, COMMENTS_ABI } from "@/lib/contracts";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "./TipButton";
import { timeAgo, formatEth } from "@/lib/entity";

interface CommentThreadProps {
  entityHash: `0x${string}`;
  /** Compact mode hides the header and uses tighter spacing (for embedding in articles) */
  compact?: boolean;
}

export function CommentThread({ entityHash, compact = false }: CommentThreadProps) {
  const { address, isConnected } = useAccount();
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<bigint | null>(null);

  const { data: commentCount, refetch: refetchCommentCount } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getEntityCommentCount",
    args: [entityHash],
  });

  const { data: commentIds, refetch: refetchCommentIds } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getEntityComments",
    args: [entityHash, BigInt(0), BigInt(50)],
  });

  const {
    writeContract: submitComment,
    data: commentTx,
    isPending: isSubmitting,
    error: submitError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: commentTx,
    query: { enabled: !!commentTx },
  });

  useEffect(() => {
    if (!isConfirmed) return;
    void refetchCommentCount();
    void refetchCommentIds();
  }, [isConfirmed, refetchCommentCount, refetchCommentIds]);

  function handleSubmit() {
    if (!newComment.trim() || !isConnected) return;

    submitComment({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "comment",
      args: [entityHash, newComment.trim(), replyTo || BigInt(0)],
    });

    setNewComment("");
    setReplyTo(null);
  }

  const count = commentCount !== undefined ? Number(commentCount) : 0;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-2 border-b border-[var(--rule)] pb-2">
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
            Discussion
          </h3>
          {count > 0 && (
            <span className="font-mono text-[10px] text-[var(--ink-faint)]">
              ({count})
            </span>
          )}
        </div>
      )}

      {/* Comment form */}
      {isConnected ? (
        <div className={compact ? "" : "border border-[var(--rule-light)] p-3"}>
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 font-mono text-[9px] text-[var(--ink-faint)]">
              Replying to #{replyTo.toString()}
              <button
                onClick={() => setReplyTo(null)}
                className="font-bold text-[var(--accent-red)] transition-colors hover:text-[var(--ink)]"
              >
                Cancel
              </button>
            </div>
          )}
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts onchain..."
            className="w-full resize-none border border-[var(--rule-light)] bg-[var(--paper)] p-2.5 font-body-serif text-sm text-[var(--ink)] placeholder-[var(--ink-faint)] focus:border-[var(--rule)] focus:outline-none"
            rows={compact ? 2 : 3}
            maxLength={2000}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="font-mono text-[8px] text-[var(--ink-faint)]">
              {newComment.length}/2000 &mdash; Stored permanently onchain
            </span>
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting || isConfirming}
              className="border border-[var(--rule)] bg-[var(--ink)] px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-[var(--paper)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)] disabled:opacity-50"
            >
              {isSubmitting ? "Signing\u2026" : isConfirming ? "Confirming\u2026" : "Post Onchain"}
            </button>
          </div>
          {submitError && (
            <p className="mt-1 font-mono text-[9px] text-[var(--accent-red)]">
              {(submitError as { shortMessage?: string }).shortMessage ||
                submitError.message}
            </p>
          )}
        </div>
      ) : (
        <p className="border border-[var(--rule-light)] p-4 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
          Connect your wallet to join the discussion.
        </p>
      )}

      {/* Comment list */}
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {commentIds?.map((commentId) => (
          <CommentItem
            key={commentId.toString()}
            commentId={commentId}
            entityHash={entityHash}
            onReply={() => setReplyTo(commentId)}
            compact={compact}
          />
        ))}

        {(!commentIds || commentIds.length === 0) && (
          <p className="py-6 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
            No comments yet. Be the first to share your take.
          </p>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  commentId,
  entityHash,
  onReply,
  compact = false,
}: {
  commentId: bigint;
  entityHash: `0x${string}`;
  onReply: () => void;
  compact?: boolean;
}) {
  const { isConnected } = useAccount();

  const { data: comment } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getComment",
    args: [commentId],
  });

  const { writeContract: voteOnComment } = useWriteContract();

  if (!comment || !comment.exists) return null;

  function handleVote(v: 1 | -1) {
    voteOnComment({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "vote",
      args: [commentId, v],
    });
  }

  const score = Number(comment.score);

  return (
    <div className={`border-b border-[var(--rule-light)] ${compact ? "pb-2" : "pb-3"}`}>
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AddressDisplay address={comment.author} className="font-mono text-[10px] font-bold text-[var(--ink-light)]" />
          {comment.parentId > BigInt(0) && (
            <span className="font-mono text-[8px] text-[var(--ink-faint)]">
              &rarr; #{comment.parentId.toString()}
            </span>
          )}
        </div>
        <span className="font-mono text-[8px] text-[var(--ink-faint)]">
          {timeAgo(Number(comment.timestamp))}
        </span>
      </div>

      {/* Content */}
      <p className="mb-2 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
        {comment.content}
      </p>

      {/* Actions — compact monospace row */}
      <div className="flex items-center gap-3 font-mono text-[9px] text-[var(--ink-faint)]">
        {/* Vote arrows + score */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => isConnected && handleVote(1)}
            className="px-0.5 transition-colors hover:text-[var(--ink)] disabled:opacity-40"
            disabled={!isConnected}
          >
            &#9650;
          </button>
          <span className={`min-w-[2ch] text-center font-bold ${score > 0 ? "text-[var(--ink)]" : score < 0 ? "text-[var(--accent-red)]" : ""}`}>
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

        <button
          onClick={onReply}
          className="uppercase tracking-wider transition-colors hover:text-[var(--ink)]"
          disabled={!isConnected}
        >
          Reply
        </button>

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
    </div>
  );
}
