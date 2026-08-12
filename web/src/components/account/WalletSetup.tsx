"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { deriveEvmAccount, generateMnemonic } from "@pooter/wallet";

/**
 * In-browser, non-custodial wallet generation (via @pooter/wallet — the shared
 * identity package; same derivation as the extension and mobile).
 *
 * The mnemonic is created here and NEVER leaves this component: it is not sent
 * to the server, not persisted, not put in localStorage, and it is dropped from
 * memory once the user confirms they've written it down. The only things that
 * reach the network are the public address and a signature.
 *
 * This is deliberately the opposite of the legacy morality.network model, where
 * the platform generated and stored every user's private key.
 *
 * Before linking, the user must retype three of the twelve words from memory
 * with the phrase hidden. That check is the only defence against someone
 * clicking through and discovering months later that they never wrote it down —
 * at which point nobody, including us, can help them.
 */

interface LinkedWallet {
  address: string;
  isPrimary: boolean;
  origin: string;
  linkedAt: string;
}

type Step = "idle" | "showing" | "confirming" | "linking" | "done";

const CONFIRM_COUNT = 3;

/** Pick n distinct indices in [0, size). Chosen once per generated phrase. */
function pickIndices(size: number, n: number): number[] {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).sort((a, b) => a - b);
}

export function WalletSetup({ existing }: { existing: LinkedWallet[] }) {
  const [step, setStep] = useState<Step>("idle");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [linked, setLinked] = useState<LinkedWallet[]>(existing);
  const [copied, setCopied] = useState(false);

  const [challenge, setChallenge] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [checkError, setCheckError] = useState("");

  // Held outside React state so it can be cleared explicitly the moment the
  // address is recorded.
  const accountRef = useRef<ReturnType<typeof deriveEvmAccount> | null>(null);

  const generate = useCallback(() => {
    setError("");
    setCheckError("");
    setCopied(false);
    const phrase = generateMnemonic();
    const words = phrase.split(" ");
    accountRef.current = deriveEvmAccount(phrase);
    setMnemonic(words);
    setAddress(accountRef.current.address);
    setChallenge(pickIndices(words.length, CONFIRM_COUNT));
    setAnswers(Array(CONFIRM_COUNT).fill(""));
    setAcknowledged(false);
    setStep("showing");
  }, []);

  const discard = useCallback(() => {
    accountRef.current = null;
    setMnemonic([]);
    setAddress("");
    setChallenge([]);
    setAnswers([]);
    setAcknowledged(false);
    setCopied(false);
    setCheckError("");
    setError("");
    setStep("idle");
  }, []);

  const copyPhrase = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mnemonic.join(" "));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    } catch {
      setError("Your browser blocked clipboard access — write the words down instead.");
    }
  }, [mnemonic]);

  const answersCorrect = useMemo(
    () =>
      challenge.length > 0 &&
      challenge.every(
        (wordIndex, i) => answers[i]?.trim().toLowerCase() === mnemonic[wordIndex],
      ),
    [challenge, answers, mnemonic],
  );

  const link = useCallback(async () => {
    const account = accountRef.current;
    if (!account) {
      setError("Wallet is no longer in memory. Generate a new one.");
      setStep("showing");
      return;
    }
    setStep("linking");
    setError("");
    try {
      const nonceRes = await fetch("/api/account/wallet/nonce", { method: "POST" });
      if (!nonceRes.ok) throw new Error("Could not start the link. Are you still signed in?");
      const { nonce, email } = await nonceRes.json();

      // Must match buildLinkMessage() on the server byte-for-byte.
      const message = [
        "pooter.world — link this wallet to your account",
        "",
        `Account: ${email}`,
        `Wallet: ${account.address}`,
        `Nonce: ${nonce}`,
        "",
        "Signing this proves you control the wallet. It costs nothing and grants",
        "pooter.world no ability to move your funds.",
      ].join("\n");

      const signature = await account.signMessage({ message });

      const res = await fetch("/api/account/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address, signature, nonce, origin: "generated" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not link the wallet");

      setLinked((prev) => [body.wallet, ...prev.map((w) => ({ ...w, isPrimary: false }))]);
      // Drop the key material now that the address is recorded.
      accountRef.current = null;
      setMnemonic([]);
      setAnswers([]);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("confirming");
    }
  }, []);

  const ordinal = (n: number) => `${n + 1}`;

  return (
    <section className="mt-8">
      <h2 className="font-headline text-lg">Your wallet</h2>

      {linked.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]">
          {linked.map((w) => (
            <li key={w.address} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <div>
                <p className="font-mono text-xs break-all">{w.address}</p>
                <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                  {w.isPrimary ? "Primary — MO will be claimable here" : "Linked"}
                  {w.origin === "generated" ? " · created in your browser" : " · existing wallet"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {step === "idle" && (
        <div className="mt-3">
          <p className="max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
            {linked.length > 0
              ? "You can create another wallet if you've lost access to the one above."
              : "Create a wallet to claim your MO when the token launches. It's generated on this device and we never see the recovery phrase — unlike the old morality.network wallets, which the platform held for you."}
          </p>
          <button
            type="button"
            onClick={generate}
            className="mt-4 bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80"
          >
            {linked.length > 0 ? "Create another wallet" : "Create my wallet"}
          </button>
        </div>
      )}

      {/* ── Step 1: show the phrase ─────────────────────────────────────── */}
      {step === "showing" && (
        <div className="mt-4 border-2 border-[var(--accent-red)] bg-[var(--paper-tint)] p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--accent-red)]">
            Write these 12 words down — now
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
            This is the only copy. It is not sent to pooter.world and it is not saved
            anywhere on this page. If you lose it, the wallet and anything in it is gone
            permanently — nobody can recover it for you, including us.
          </p>

          <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {mnemonic.map((word, i) => (
              <li key={`${i}-${word}`} className="flex gap-2 font-mono text-sm">
                <span className="w-5 shrink-0 text-right text-[var(--ink-faint)]">{i + 1}</span>
                <span>{word}</span>
              </li>
            ))}
          </ol>

          <p className="mt-5 font-mono text-xs break-all text-[var(--ink-faint)]">{address}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyPhrase}
              className="border-2 border-[var(--ink)] px-4 py-2 text-xs uppercase tracking-[0.14em] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {copied ? "Copied" : "Copy all 12 words"}
            </button>
            {copied && (
              <span className="text-xs text-[var(--ink-faint)]">
                Paste it somewhere safe, then clear your clipboard.
              </span>
            )}
          </div>

          <label className="mt-5 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-red)]"
            />
            <span className="leading-relaxed">
              I have saved all 12 words and understand that pooter.world cannot recover
              them.
            </span>
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!acknowledged}
              onClick={() => {
                setCheckError("");
                setStep("confirming");
              }}
              className="bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={discard}
              className="px-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent-red)]"
            >
              Discard
            </button>
          </div>

          {error && <p className="mt-3 text-sm text-[var(--accent-red)]">{error}</p>}
        </div>
      )}

      {/* ── Step 2: prove it was written down ───────────────────────────── */}
      {(step === "confirming" || step === "linking") && (
        <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            Check your backup
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
            The phrase is hidden now. Type these three words from your copy — this is the
            only way to be sure you really have it.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {challenge.map((wordIndex, i) => (
              <div key={wordIndex}>
                <label
                  htmlFor={`confirm-word-${wordIndex}`}
                  className="block text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]"
                >
                  Word {ordinal(wordIndex)}
                </label>
                <input
                  id={`confirm-word-${wordIndex}`}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={answers[i] ?? ""}
                  onChange={(e) => {
                    const next = [...answers];
                    next[i] = e.target.value;
                    setAnswers(next);
                    setCheckError("");
                  }}
                  className="mt-1 w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent-red)]"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={step === "linking"}
              onClick={() => {
                if (!answersCorrect) {
                  setCheckError("Those don't match. Check your copy and try again.");
                  return;
                }
                link();
              }}
              className="bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              {step === "linking" ? "Linking…" : "Confirm and link"}
            </button>
            <button
              type="button"
              disabled={step === "linking"}
              onClick={() => {
                setCheckError("");
                setStep("showing");
              }}
              className="px-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent-red)] disabled:opacity-40"
            >
              Show the words again
            </button>
          </div>

          {checkError && <p className="mt-3 text-sm text-[var(--accent-red)]">{checkError}</p>}
          {error && <p className="mt-3 text-sm text-[var(--accent-red)]">{error}</p>}
        </div>
      )}

      {step === "done" && (
        <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
          <p className="font-headline text-lg leading-tight">Wallet linked</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
            Your MO will be claimable to this address when the token launches. Keep your
            12 words somewhere safe and offline.
          </p>
        </div>
      )}
    </section>
  );
}
