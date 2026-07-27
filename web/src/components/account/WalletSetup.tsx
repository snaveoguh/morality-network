"use client";

import { useCallback, useRef, useState } from "react";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";

/**
 * In-browser, non-custodial wallet generation.
 *
 * The mnemonic is created here and NEVER leaves this component: it is not sent
 * to the server, not persisted, not put in localStorage, and it is dropped from
 * memory once the user confirms they've written it down. The only things that
 * reach the network are the public address and a signature.
 *
 * This is deliberately the opposite of the legacy morality.network model, where
 * the platform generated and stored every user's private key.
 */

interface LinkedWallet {
  address: string;
  isPrimary: boolean;
  origin: string;
  linkedAt: string;
}

type Step = "idle" | "showing" | "confirming" | "linking" | "done" | "error";

export function WalletSetup({ existing }: { existing: LinkedWallet[] }) {
  const [step, setStep] = useState<Step>("idle");
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [linked, setLinked] = useState<LinkedWallet[]>(existing);

  // Held outside React state so it is not retained in any devtools snapshot
  // longer than necessary, and can be cleared explicitly.
  const accountRef = useRef<ReturnType<typeof mnemonicToAccount> | null>(null);

  const generate = useCallback(() => {
    setError("");
    const phrase = generateMnemonic(english);
    const account = mnemonicToAccount(phrase);
    accountRef.current = account;
    setMnemonic(phrase.split(" "));
    setAddress(account.address);
    setStep("showing");
  }, []);

  const discard = useCallback(() => {
    accountRef.current = null;
    setMnemonic([]);
    setAddress("");
    setAcknowledged(false);
    setStep("idle");
  }, []);

  const link = useCallback(async () => {
    const account = accountRef.current;
    if (!account) {
      setError("Wallet is no longer in memory. Generate a new one.");
      setStep("error");
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
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }, []);

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
              : "Create a wallet to claim your MO when the token redeploys. It's generated on this device and we never see the recovery phrase — unlike the old morality.network wallets, which the platform held for you."}
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

      {(step === "showing" || step === "confirming" || step === "linking" || step === "error") &&
        mnemonic.length > 0 && (
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

            <label className="mt-5 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-red)]"
              />
              <span className="leading-relaxed">
                I have written down all 12 words and understand that pooter.world cannot
                recover them.
              </span>
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={!acknowledged || step === "linking"}
                onClick={link}
                className="bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {step === "linking" ? "Linking…" : "Link this wallet"}
              </button>
              <button
                type="button"
                onClick={discard}
                disabled={step === "linking"}
                className="px-2 text-xs uppercase tracking-[0.16em] text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--accent-red)] disabled:opacity-40"
              >
                Discard
              </button>
            </div>

            {error && <p className="mt-3 text-sm text-[var(--accent-red)]">{error}</p>}
          </div>
        )}

      {step === "done" && (
        <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
          <p className="font-headline text-lg leading-tight">Wallet linked</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-light)]">
            Your MO will be claimable to this address when the token redeploys. Keep your
            12 words somewhere safe and offline.
          </p>
        </div>
      )}
    </section>
  );
}
