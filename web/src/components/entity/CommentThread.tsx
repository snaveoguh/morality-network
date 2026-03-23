"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { CONTRACTS, CONTRACTS_CHAIN_ID, COMMENTS_ABI } from "@/lib/contracts";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { TipButton } from "./TipButton";
import { ArgumentBadge } from "./ArgumentBadge";
import { StructuredCommentForm } from "./StructuredCommentForm";
import { ThreadedComment } from "./ThreadedComment";
import { timeAgo, formatEth } from "@/lib/entity";
import {
  deriveArgumentTypeFromContent,
  normalizeArgumentMeta,
  stripArgumentPrefix,
  parseLegacyEvidenceLines,
} from "@/lib/comment-arguments";

interface CommentThreadProps {
  entityHash: `0x${string}`;
  compact?: boolean;
}

type ViewMode = "flat" | "threaded";
const COMMENT_PAGE_SIZE = 100;

export function CommentThread({ entityHash, compact = false }: CommentThreadProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("threaded");

  const { data: commentCount, refetch: refetchCommentCount } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getEntityCommentCount",
    args: [entityHash],
    chainId: CONTRACTS_CHAIN_ID,
  });

  const count = commentCount !== undefined ? Number(commentCount) : 0;
  const commentsOffset =
    count > COMMENT_PAGE_SIZE ? BigInt(count - COMMENT_PAGE_SIZE) : BigInt(0);

  const { data: commentIds, refetch: refetchCommentIds } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getEntityComments",
    args: [entityHash, commentsOffset, BigInt(COMMENT_PAGE_SIZE)],
    chainId: CONTRACTS_CHAIN_ID,
  });

  const {
    error: structuredSupportError,
    isSuccess: structuredSupportConfirmed,
  } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getArgumentMeta",
    args: [BigInt(1)],
    chainId: CONTRACTS_CHAIN_ID,
    query: { retry: false },
  });

  const supportsStructuredComments =
    structuredSupportConfirmed && !structuredSupportError;

  function handleRefetch() {
    void refetchCommentCount();
    void refetchCommentIds();
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {/* Header with view toggle */}
      {!compact && (
        <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
              Discussion
            </h3>
            {count > 0 && (
              <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                ({count})
              </span>
            )}
          </div>
          {/* View mode toggle */}
          <div className="flex items-center gap-0 font-mono text-[9px] uppercase tracking-wider">
            <button
              onClick={() => setViewMode("flat")}
              className={`transition-colors ${
                viewMode === "flat"
                  ? "font-bold text-[var(--ink)] underline underline-offset-2"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              Flat
            </button>
            <span className="mx-1.5 text-[var(--rule-light)]">|</span>
            <button
              onClick={() => setViewMode("threaded")}
              className={`transition-colors ${
                viewMode === "threaded"
                  ? "font-bold text-[var(--ink)] underline underline-offset-2"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              Threaded
            </button>
          </div>
        </div>
      )}

      {/* Comment form -- now structured */}
      <StructuredCommentForm
        entityHash={entityHash}
        onSuccess={handleRefetch}
        compact={compact}
        supportsStructuredComments={supportsStructuredComments}
      />

      {/* Comment list */}
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {viewMode === "threaded" ? (
          <ThreadedView
            commentIds={commentIds || []}
            entityHash={entityHash}
            onRefetch={handleRefetch}
            supportsStructuredComments={supportsStructuredComments}
          />
        ) : (
          <FlatView
            commentIds={commentIds || []}
            entityHash={entityHash}
            onRefetch={handleRefetch}
            compact={compact}
            supportsStructuredComments={supportsStructuredComments}
          />
        )}

        {(!commentIds || commentIds.length === 0) && (
          <p className="py-6 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
            No comments yet. Be the first to share your take.
          </p>
        )}
      </div>
    </div>
  );
}

// --- Threaded View -----------------------------------------------------------

function ThreadedView({
  commentIds,
  entityHash,
  onRefetch,
  supportsStructuredComments,
}: {
  commentIds: readonly bigint[];
  entityHash: `0x${string}`;
  onRefetch: () => void;
  supportsStructuredComments: boolean;
}) {
  // We need to read parentId for each comment to build the tree
  // For now, render all as ThreadedComment and let them self-organize
  // Build a child map by reading each comment's parentId
  return (
    <ThreadedViewInner
      commentIds={commentIds}
      entityHash={entityHash}
      onRefetch={onRefetch}
      supportsStructuredComments={supportsStructuredComments}
    />
  );
}

function ThreadedViewInner({
  commentIds,
  entityHash,
  onRefetch,
  supportsStructuredComments,
}: {
  commentIds: readonly bigint[];
  entityHash: `0x${string}`;
  onRefetch: () => void;
  supportsStructuredComments: boolean;
}) {
  // Track parent IDs for each comment to build the thread tree.
  // Use a ref + state pair to avoid the infinite re-render loop:
  // - ref holds the actual data (mutated without triggering renders)
  // - state counter triggers a single re-render when new data arrives
  const commentDataRef = useRef<Map<string, { parentId: bigint }>>(new Map());
  const [, setDataVersion] = useState(0);

  // Stable callback that doesn't change between renders
  const reportParentId = useCallback((commentId: bigint, parentId: bigint) => {
    const key = commentId.toString();
    const existing = commentDataRef.current.get(key);
    // Only update if the data actually changed
    if (existing && existing.parentId === parentId) return;
    commentDataRef.current.set(key, { parentId });
    setDataVersion((v) => v + 1);
  }, []);

  // Build child map from comment data
  const childMap = new Map<string, bigint[]>();
  const rootIds: bigint[] = [];
  const loadedIds = new Set(commentIds.map((id) => id.toString()));

  for (const id of commentIds) {
    const data = commentDataRef.current.get(id.toString());
    const parentId = data?.parentId || BigInt(0);
    const parentKey = parentId.toString();
    const parentLoaded = parentId > BigInt(0) && loadedIds.has(parentKey);

    // Treat replies whose parent is outside the loaded window as roots so they stay visible.
    if (parentId === BigInt(0) || !parentLoaded) {
      rootIds.push(id);
    } else {
      const key = parentKey;
      if (!childMap.has(key)) childMap.set(key, []);
      childMap.get(key)!.push(id);
    }
  }

  return (
    <>
      {/* Hidden readers to fetch parent IDs */}
      {commentIds.map((id) => (
        <CommentParentReader
          key={`reader-${id.toString()}`}
          commentId={id}
          reportParentId={reportParentId}
        />
      ))}

      {/* Render root comments */}
      {rootIds.map((id) => (
        <ThreadedComment
          key={id.toString()}
          commentId={id}
          entityHash={entityHash}
          childMap={childMap}
          onRefetch={onRefetch}
          supportsStructuredComments={supportsStructuredComments}
        />
      ))}
    </>
  );
}

/**
 * Hidden component that reads a single comment from the contract
 * and reports its parentId to the parent via a stable callback.
 */
function CommentParentReader({
  commentId,
  reportParentId,
}: {
  commentId: bigint;
  reportParentId: (commentId: bigint, parentId: bigint) => void;
}) {
  const { data: comment } = useReadContract({
    address: CONTRACTS.comments,
    abi: COMMENTS_ABI,
    functionName: "getComment",
    args: [commentId],
    chainId: CONTRACTS_CHAIN_ID,
  });

  // Use a ref to hold the callback so the effect deps stay stable
  const callbackRef = useRef(reportParentId);
  callbackRef.current = reportParentId;

  useEffect(() => {
    if (comment?.exists) {
      callbackRef.current(commentId, comment.parentId);
    }
    // commentId is a bigint prop (stable identity per key), comment changes when data loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment, commentId]);

  return null;
}

// --- Flat View ---------------------------------------------------------------

function FlatView({
  commentIds,
  entityHash,
  onRefetch,
  compact,
  supportsStructuredComments,
}: {
  commentIds: readonly bigint[];
  entityHash: `0x${string}`;
  onRefetch: () => void;
  compact: boolean;
  supportsStructuredComments: boolean;
}) {
  const [replyTo, setReplyTo] = useState<bigint | null>(null);

  return (
    <>
      {commentIds.map((commentId) => (
        <FlatCommentItem
          key={commentId.toString()}
          commentId={commentId}
          entityHash={entityHash}
          onReply={() => setReplyTo(commentId)}
          compact={compact}
          supportsStructuredComments={supportsStructuredComments}
        />
      ))}

      {replyTo && (
        <div className="mt-2 border-l-2 border-[var(--rule)] pl-3">
          <StructuredCommentForm
            entityHash={entityHash}
            parentId={replyTo}
            onCancel={() => setReplyTo(null)}
            onSuccess={() => {
              setReplyTo(null);
              onRefetch();
            }}
            compact
            supportsStructuredComments={supportsStructuredComments}
          />
        </div>
      )}
    </>
  );
}

function FlatCommentItem({
  commentId,
  entityHash,
  onReply,
  compact = false,
  supportsStructuredComments,
}: {
  commentId: bigint;
  entityHash: `0x${string}`;
  onReply: () => void;
  compact?: boolean;
  supportsStructuredComments: boolean;
}) {
  const { isConnected } = useAccount();

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

  const score = Number(comment.score);
  const normalizedMeta = normalizeArgumentMeta(argMeta);
  const fallbackArgumentType = deriveArgumentTypeFromContent(comment.content);
  const argumentType = normalizedMeta.exists
    ? normalizedMeta.argumentType
    : fallbackArgumentType;
  const strippedContent = normalizedMeta.exists
    ? comment.content
    : stripArgumentPrefix(comment.content);

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
    <div className={`border-b border-[var(--rule-light)] ${compact ? "pb-2" : "pb-3"}`}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AddressDisplay
            address={comment.author}
            className="font-mono text-[10px] font-bold text-[var(--ink-light)]"
          />
          <ArgumentBadge argumentType={argumentType} />
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
