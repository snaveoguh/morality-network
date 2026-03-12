"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseEther, type Address } from "viem";
import { CONTRACTS, CONTRACTS_CHAIN_ID, TIPPING_ABI } from "@/lib/contracts";

const TIP_AMOUNTS = [
  { label: "0.001", value: "0.001" },
  { label: "0.005", value: "0.005" },
  { label: "0.01", value: "0.01" },
  { label: "0.1", value: "0.1" },
];

const POPOVER_W = 220;
const POPOVER_H = 180; // taller now with explainer text

interface TipButtonProps {
  entityHash?: `0x${string}`;
  commentId?: bigint;
  recipientAddress?: Address;
}

export function TipButton({ entityHash, commentId, recipientAddress }: TipButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const {
    sendTransactionAsync,
    isPending: isSendPending,
  } = useSendTransaction();
  const {
    writeContractAsync,
    isPending: isWritePending,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });
  const isPending = isSendPending || isWritePending;

  // SSR guard
  useEffect(() => setMounted(true), []);

  // Compute position — flip above if near bottom of viewport
  const computePos = useCallback(() => {
    if (!btnRef.current) return null;
    const rect = btnRef.current.getBoundingClientRect();
    const vh = window.innerHeight;

    let top = rect.bottom + 6;
    let left = Math.max(8, Math.min(rect.right - POPOVER_W, window.innerWidth - POPOVER_W - 8));

    if (rect.bottom + POPOVER_H + 16 > vh) {
      top = rect.top - POPOVER_H - 6;
    }

    return { top, left };
  }, []);

  const handleToggle = useCallback(() => {
    if (!open) {
      const p = computePos();
      if (p) setPos(p);
    }
    setOpen((o) => !o);
  }, [open, computePos]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const p = computePos();
      if (p) setPos(p);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, computePos]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  async function handleTip(amount: string) {
    const value = parseEther(amount);

    try {
      if (recipientAddress && commentId === undefined) {
        const hash = await sendTransactionAsync({
          chainId: CONTRACTS_CHAIN_ID,
          to: recipientAddress,
          value,
        });
        setTxHash(hash);
      } else if (commentId !== undefined) {
        const hash = await writeContractAsync({
          chainId: CONTRACTS_CHAIN_ID,
          address: CONTRACTS.tipping,
          abi: TIPPING_ABI,
          functionName: "tipComment",
          args: [commentId],
          value,
        });
        setTxHash(hash);
      } else if (entityHash) {
        const hash = await writeContractAsync({
          chainId: CONTRACTS_CHAIN_ID,
          address: CONTRACTS.tipping,
          abi: TIPPING_ABI,
          functionName: "tipEntity",
          args: [entityHash],
          value,
        });
        setTxHash(hash);
      } else {
        return;
      }

      setOpen(false);
    } catch {
      // Wallet rejection or simulation failure is surfaced in the wallet UI.
    }
  }

  const isComment = commentId !== undefined;
  const isDirectRecipient = !!recipientAddress && !isComment;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        disabled={isPending || isConfirming}
        className="flex items-center gap-1 border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:border-[var(--rule)] hover:text-[var(--ink)] disabled:opacity-50"
      >
        {isPending || isConfirming ? (
          <span className="h-2 w-2 animate-spin border border-[var(--ink)] border-t-transparent" />
        ) : (
          <span>$</span>
        )}
        {isSuccess
          ? "Tipped"
          : isPending
            ? "Sign\u2026"
            : isConfirming
              ? "Conf\u2026"
              : "Tip"}
      </button>

      {mounted && open && pos && createPortal(
        <>
          {/* Invisible backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99998 }}
            onClick={() => setOpen(false)}
          />
          {/* Popover */}
          <div
            ref={popRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 99999,
              width: POPOVER_W,
              backgroundColor: "#F5F0E8",
              border: "2px solid #2A2A2A",
              padding: "10px",
              boxShadow: "4px 4px 0 rgba(26,26,26,0.15)",
            }}
          >
            {/* ── Explainer ── */}
            <div style={{ marginBottom: "8px", borderBottom: "1px solid #C8C0B0", paddingBottom: "8px" }}>
              <p style={{
                margin: 0,
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontSize: "11px",
                lineHeight: "1.5",
                color: "#4A4A4A",
              }}>
                {isDirectRecipient
                  ? "Send ETH directly to this address on Base."
                  : isComment
                    ? "Tip this commenter onchain. Funds are credited in the tipping contract until they withdraw."
                    : "Tip this content onchain. If the source has verified ownership, the funds are credited to them. Otherwise they stay in escrow until claimed."}
              </p>
              <p style={{
                margin: "4px 0 0 0",
                fontFamily: "monospace",
                fontSize: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#8A8A8A",
              }}>
                Base L2 &bull; gas costs ~$0.01
              </p>
            </div>

            {/* ── Amount grid ── */}
            <p
              style={{
                margin: "0 0 5px 0",
                fontFamily: "monospace",
                fontSize: "8px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#8A8A8A",
              }}
            >
              Select amount (ETH)
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
              {TIP_AMOUNTS.map((tip) => (
                <button
                  key={tip.value}
                  onClick={() => void handleTip(tip.value)}
                  style={{
                    border: "1px solid #C8C0B0",
                    background: "#F5F0E8",
                    padding: "6px 8px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: "#1A1A1A",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#1A1A1A";
                    e.currentTarget.style.color = "#F5F0E8";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#F5F0E8";
                    e.currentTarget.style.color = "#1A1A1A";
                  }}
                >
                  {tip.label}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
