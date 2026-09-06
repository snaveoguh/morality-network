"use client";

// Reviewer sign-in for the Claim Ledger review queue.
//
// Creates the SIWE session (`/api/auth/nonce` → sign → `/api/auth/verify`)
// that `operator-auth.ts` checks against OPERATOR_ADDRESSES. Until this
// existed the only way to create that session was the "Hold 100k MO" button
// buried in the /markets bot terminal.

import { useCallback, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";

interface Props {
  /** Address of the current session, if any (may be signed in but not a reviewer). */
  sessionAddress?: string | null;
  /** "signin" = no session; "forbidden" = session exists but not on the reviewer list. */
  reason: "signin" | "forbidden";
  onSignedIn: () => Promise<void> | void;
}

function shortHex(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function ReviewerSignIn({ sessionAddress, reason, onSignedIn }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const noncePayload = (await nonceRes.json().catch(() => ({}))) as { nonce?: string; error?: string };
      if (!nonceRes.ok || !noncePayload.nonce) {
        throw new Error(noncePayload.error || "Could not prepare sign-in");
      }
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to the pooter world Claim Ledger as a reviewer.",
        uri: window.location.origin,
        version: "1",
        chainId: chainId || 1,
        nonce: noncePayload.nonce,
      }).prepareMessage();
      const signature = await signMessageAsync({ message });
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const verifyPayload = (await verifyRes.json().catch(() => ({}))) as { error?: string };
      if (!verifyRes.ok) {
        throw new Error(verifyPayload.error || "Sign-in failed");
      }
      await onSignedIn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setNote(/rejected|denied|User rejected/i.test(msg) ? "Signature declined in the wallet." : msg);
    } finally {
      setBusy(false);
    }
  }, [address, chainId, onSignedIn, openConnectModal, signMessageAsync]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      await onSignedIn();
    } finally {
      setBusy(false);
    }
  }, [onSignedIn]);

  return (
    <div className="border border-[var(--rule)] p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
        Reviewer access
      </p>
      <h2 className="mt-2 font-headline text-2xl text-[var(--ink)]">
        {reason === "forbidden" ? "This wallet is not on the reviewer list." : "Verdicts are approved by named reviewers."}
      </h2>
      <p className="mt-2 max-w-2xl font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
        {reason === "forbidden" ? (
          <>
            You are signed in as{" "}
            <span className="font-mono text-xs text-[var(--ink)]">{sessionAddress ? shortHex(sessionAddress) : "an unlisted address"}</span>.
            Only addresses on the reviewer allowlist can approve or reject proposed verdicts. Switch wallet and sign in again,
            or use the public <a href="/ledger/dispute" className="text-[var(--accent-red)] underline underline-offset-2">right-of-reply route</a> to challenge a claim.
          </>
        ) : (
          <>
            Nothing on the ledger is published as a negative verdict without a named human signing it off.
            If you are a reviewer, sign in with the wallet on the reviewer list. Anyone else can challenge a claim through the public{" "}
            <a href="/ledger/dispute" className="text-[var(--accent-red)] underline underline-offset-2">right-of-reply route</a>.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={busy}
          className="border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--paper)] transition-colors hover:bg-transparent hover:text-[var(--ink)] disabled:opacity-50"
        >
          {busy ? "Signing…" : isConnected ? `Sign in as ${address ? shortHex(address) : "reviewer"}` : "Connect wallet to sign in"}
        </button>
        {reason === "forbidden" && (
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={busy}
            className="border border-[var(--rule-light)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-light)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            Sign out
          </button>
        )}
        {note && (
          <span className="font-mono text-[10px] text-[var(--accent-red)]">{note}</span>
        )}
      </div>
    </div>
  );
}
