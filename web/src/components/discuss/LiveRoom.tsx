"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { AddressDisplay } from "@/components/shared/AddressDisplay";
import { StructuredCommentForm } from "@/components/entity/StructuredCommentForm";
import { CONTRACTS } from "@/lib/contracts";
import { timeAgo } from "@/lib/entity";

interface LiveComment {
  id: string;
  entityHash: string;
  author: string;
  content: string;
  parentId: string;
  score: string;
  tipTotal: string;
  timestamp: string;
}

interface LiveRoomProps {
  entityHash: string;
  entityName?: string;
}

export function LiveRoom({ entityHash, entityName }: LiveRoomProps) {
  const { isConnected } = useAccount();
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<LiveComment | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const url = `/api/discuss/stream?entityHash=${encodeURIComponent(entityHash)}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") {
          setConnected(true);
          setError(null);
        } else if (data.type === "comment") {
          setComments((prev) => {
            if (prev.some((c) => c.id === data.id)) return prev;
            return [...prev, data as LiveComment].slice(-200);
          });
          setTimeout(scrollToBottom, 50);
        } else if (data.type === "error") {
          setError(data.message);
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError("Connection lost. Reconnecting...");
    };

    return () => es.close();
  }, [entityHash, scrollToBottom]);

  /** Find the content preview for a parent comment by ID */
  function parentPreview(parentId: string): string | null {
    const parent = comments.find((c) => c.id === parentId);
    if (!parent) return null;
    return parent.content.length > 60
      ? parent.content.slice(0, 57) + "..."
      : parent.content;
  }

  return (
    <div className="flex h-full flex-col border-2 border-[var(--rule)] bg-[var(--paper)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="font-headline text-sm font-bold text-[var(--ink)]">
            {entityName || `Room ${entityHash.slice(0, 10)}...`}
          </h2>
          <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                connected ? "bg-green-500" : "bg-[var(--accent-red)]"
              }`}
            />
            {connected ? "Live" : "Offline"}
          </span>
        </div>
        <span className="font-mono text-[8px] text-[var(--ink-faint)]">
          {comments.length} messages
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ maxHeight: "60vh" }}
      >
        {comments.length === 0 && (
          <p className="py-8 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
            {connected
              ? "No messages yet. Be the first to speak."
              : "Connecting to live stream..."}
          </p>
        )}
        <div className="space-y-2">
          {comments.map((c) => (
            <div
              key={c.id}
              className="border-b border-[var(--rule-light)] pb-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AddressDisplay
                    address={c.author}
                    className="font-mono text-[10px] font-bold text-[var(--ink-light)]"
                  />
                  <span className="font-mono text-[8px] text-[var(--ink-faint)]">
                    #{c.id}
                  </span>
                </div>
                <span className="font-mono text-[8px] text-[var(--ink-faint)]">
                  {timeAgo(Number(c.timestamp))}
                </span>
              </div>

              {/* Parent reference */}
              {c.parentId !== "0" && (
                <div className="mt-0.5 font-mono text-[8px] text-[var(--ink-faint)]">
                  <span className="text-[var(--ink-light)]">↩ #{c.parentId}</span>
                  {parentPreview(c.parentId) && (
                    <span className="ml-1 italic">
                      &ldquo;{parentPreview(c.parentId)}&rdquo;
                    </span>
                  )}
                </div>
              )}

              <p className="mt-0.5 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
                {c.content}
              </p>

              {/* Reply button */}
              {isConnected && (
                <button
                  onClick={() => setReplyingTo(c)}
                  className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                >
                  Reply
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border-t border-[var(--accent-red)] bg-red-50 px-4 py-1 font-mono text-[9px] text-[var(--accent-red)]">
          {error}
        </div>
      )}

      {/* Input — full StructuredCommentForm with claims/evidence/sources */}
      {isConnected ? (
        <div className="border-t border-[var(--rule)] px-4 py-2">
          <StructuredCommentForm
            entityHash={entityHash as `0x${string}`}
            parentId={replyingTo ? BigInt(replyingTo.id) : undefined}
            onCancel={replyingTo ? () => setReplyingTo(null) : undefined}
            onSuccess={() => setReplyingTo(null)}
            compact
          />
        </div>
      ) : (
        <div className="border-t border-[var(--rule)] px-4 py-3 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
          Connect wallet to post.
        </div>
      )}
    </div>
  );
}
