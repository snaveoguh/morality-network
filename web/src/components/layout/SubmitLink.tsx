"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONTRACTS, REGISTRY_ABI, CONTRACTS_CHAIN_ID } from "@/lib/contracts";

export function SubmitLink() {
  const { isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => setMounted(true), []);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleSubmit = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed || !isConnected) return;

    // Normalize URL
    let normalized = trimmed;
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }

    // Register as URL entity — contract takes (identifier, entityType)
    // entityType 0 = URL in our Registry enum
    writeContract({
      chainId: CONTRACTS_CHAIN_ID,
      address: CONTRACTS.registry,
      abi: REGISTRY_ABI,
      functionName: "registerEntity",
      args: [normalized, 0],
    });
  }, [url, isConnected, writeContract]);

  // Reset on success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => {
        setUrl("");
        setOpen(false);
      }, 1500);
    }
  }, [isSuccess]);

  if (!isConnected) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--rule)] hover:text-[var(--ink)]"
      >
        + Post
      </button>

      {mounted && open && createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99998,
              backgroundColor: "rgba(26,26,26,0.3)",
            }}
            onClick={() => setOpen(false)}
          />
          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 99999,
              width: 400,
              maxWidth: "calc(100vw - 32px)",
              backgroundColor: "#F5F0E8",
              border: "2px solid #2A2A2A",
              padding: "16px",
              boxShadow: "6px 6px 0 rgba(26,26,26,0.15)",
            }}
          >
            {/* Header */}
            <div style={{ borderBottom: "1px solid #2A2A2A", paddingBottom: "8px", marginBottom: "12px" }}>
              <p style={{
                margin: 0,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "16px",
                fontWeight: 900,
                color: "#1A1A1A",
              }}>
                Submit a Link
              </p>
              <p style={{
                margin: "4px 0 0 0",
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: "11px",
                color: "#4A4A4A",
                lineHeight: "1.5",
              }}>
                Post any URL to the feed. It gets registered onchain as an entity that anyone can rate, discuss, and tip.
              </p>
            </div>

            {/* URL input */}
            <input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="https://example.com/article"
              style={{
                width: "100%",
                border: "1px solid #C8C0B0",
                background: "#F5F0E8",
                padding: "8px 10px",
                fontFamily: "monospace",
                fontSize: "12px",
                color: "#1A1A1A",
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#2A2A2A"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#C8C0B0"; }}
            />

            {/* Explainer */}
            <p style={{
              margin: "8px 0 12px 0",
              fontFamily: "monospace",
              fontSize: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#8A8A8A",
              lineHeight: "1.6",
            }}>
              Registered on Base L2 &bull; Gas ~$0.01 &bull; Permanent &amp; permissionless
            </p>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid #C8C0B0",
                  background: "transparent",
                  padding: "6px 14px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#8A8A8A",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!url.trim() || isPending || isConfirming}
                style={{
                  border: "1px solid #2A2A2A",
                  background: isSuccess ? "#2A2A2A" : "#1A1A1A",
                  padding: "6px 14px",
                  fontFamily: "monospace",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "#F5F0E8",
                  cursor: isPending || isConfirming ? "wait" : "pointer",
                  opacity: !url.trim() || isPending || isConfirming ? 0.5 : 1,
                }}
              >
                {isSuccess
                  ? "\u2713 Posted"
                  : isPending
                    ? "Signing\u2026"
                    : isConfirming
                      ? "Confirming\u2026"
                      : "Post Onchain"}
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
