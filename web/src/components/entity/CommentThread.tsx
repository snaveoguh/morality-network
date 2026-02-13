"use client";

import { useState } from "react";
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
}

export function CommentThread({ entityHash }: CommentThreadProps) {
  const { address, isConnected } = useAccount();
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<bigint | null>(null);

  const { data: commentCount } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getEntityCommentCount",
    args: [entityHash],
  });

  const { data: commentIds } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getEntityComments",
    args: [entityHash, BigInt(0), BigInt(50)],
  });

  const {
    writeContract: submitComment,
    data: commentTx,
    isPending: isSubmitting,
  } = useWriteContract();

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: commentTx,
  });

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

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
        Discussion
        {commentCount !== undefined && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {Number(commentCount)}
          </span>
        )}
      </h3>

      {/* New comment form */}
      {isConnected ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              Replying to #{replyTo.toString()}
              <button
                onClick={() => setReplyTo(null)}
                className="text-red-400 hover:text-red-300"
              >
                Cancel
              </button>
            </div>
          )}
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts onchain..."
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder-zinc-500 focus:border-[#2F80ED] focus:outline-none"
            rows={3}
            maxLength={2000}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {newComment.length}/2000 — Stored permanently onchain
            </span>
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting || isConfirming}
              className="rounded-lg bg-[#2F80ED] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-[#31F387] disabled:opacity-50"
            >
              {isSubmitting
                ? "Signing..."
                : isConfirming
                  ? "Confirming..."
                  : "Post Onchain"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center text-sm text-zinc-400">
          Connect your wallet to join the discussion
        </div>
      )}

      {/* Comment list */}
      <div className="space-y-3">
        {commentIds?.map((commentId) => (
          <CommentItem
            key={commentId.toString()}
            commentId={commentId}
            entityHash={entityHash}
            onReply={() => setReplyTo(commentId)}
          />
        ))}

        {(!commentIds || commentIds.length === 0) && (
          <p className="py-8 text-center text-sm text-zinc-500">
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
}: {
  commentId: bigint;
  entityHash: `0x${string}`;
  onReply: () => void;
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

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AddressDisplay
            address={comment.author}
            className="text-zinc-300"
          />
          {comment.parentId > BigInt(0) && (
            <span className="text-xs text-zinc-500">
              replied to #{comment.parentId.toString()}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500">
          {timeAgo(Number(comment.timestamp))}
        </span>
      </div>

      {/* Content */}
      <p className="mb-3 text-sm leading-relaxed text-zinc-200">
        {comment.content}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Votes */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => isConnected && handleVote(1)}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-[#2F80ED]/10 hover:text-[#31F387]"
            disabled={!isConnected}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span
            className={`min-w-[2ch] text-center text-xs font-medium ${
              Number(comment.score) > 0
                ? "text-[#31F387]"
                : Number(comment.score) < 0
                  ? "text-red-400"
                  : "text-zinc-500"
            }`}
          >
            {Number(comment.score)}
          </span>
          <button
            onClick={() => isConnected && handleVote(-1)}
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
            disabled={!isConnected}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Reply */}
        <button
          onClick={onReply}
          className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          disabled={!isConnected}
        >
          Reply
        </button>

        {/* Tips received */}
        {comment.tipTotal > BigInt(0) && (
          <span className="text-xs text-[#31F387]">
            {formatEth(comment.tipTotal)} tipped
          </span>
        )}

        {/* Tip comment */}
        {isConnected && (
          <TipButton entityHash={entityHash} commentId={commentId} />
        )}
      </div>
    </div>
  );
}
