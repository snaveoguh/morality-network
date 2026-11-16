"use client";

import Link from "next/link";
import { useState } from "react";

type Action = "confirm" | "unsubscribe";
type State = "idle" | "working" | "done" | "error";

const COPY: Record<
  Action,
  {
    endpoint: string;
    title: string;
    intro: string;
    button: string;
    working: string;
    doneTitle: string;
    doneBody: string;
    missing: string;
  }
> = {
  confirm: {
    endpoint: "/api/newsletter/confirm",
    title: "Confirm your subscription",
    intro: "One more step. Confirm below and the morning brief will arrive from tomorrow.",
    button: "Confirm subscription",
    working: "Confirming…",
    doneTitle: "You're subscribed.",
    doneBody:
      "The next edition arrives tomorrow morning. Every edition has an unsubscribe link at the bottom.",
    missing: "This confirmation link is incomplete. Open the link in the email again.",
  },
  unsubscribe: {
    endpoint: "/api/newsletter/unsubscribe",
    title: "Unsubscribe from The Daily Pooter",
    intro: "Confirm below and we will stop sending the morning brief to this address.",
    button: "Unsubscribe",
    working: "Unsubscribing…",
    doneTitle: "You're unsubscribed.",
    doneBody: "We won't send the morning brief to this address again.",
    missing: "This unsubscribe link is incomplete. Open the link at the bottom of the email again.",
  },
};

/**
 * Landing page body for the two links The Daily Pooter emails out. The link
 * only opens this page; the change happens when the reader presses the
 * button, so a mail scanner fetching the link cannot confirm or unsubscribe
 * anyone.
 */
export function NewsletterLinkAction({
  action,
  token: rawToken,
}: {
  action: Action;
  /** The page's `token` search parameter, as Next.js hands it over. */
  token?: string | string[];
}) {
  const copy = COPY[action];
  const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken) ?? "";
  const [state, setState] = useState<State>(token ? "idle" : "error");
  const [message, setMessage] = useState(token ? "" : copy.missing);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  async function onConfirm() {
    if (state === "working") return;
    setState("working");
    setMessage("");

    try {
      const res = await fetch(`${copy.endpoint}?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState("error");
        setMessage(body?.error ?? "Something went wrong. Try again.");
        return;
      }
      setAlreadySubscribed(body?.status === "already_subscribed");
      setState("done");
    } catch {
      setState("error");
      setMessage("Could not reach the server. Try again.");
    }
  }

  return (
    <>
      <header className="border-b-4 border-double border-[var(--ink)] pb-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
          The Daily Pooter
        </p>
        <h1 className="font-headline mt-2 text-3xl leading-tight sm:text-4xl">{copy.title}</h1>
      </header>

      {state === "done" ? (
        <div className="mt-8 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-6">
          <p className="font-headline text-xl leading-tight">
            {alreadySubscribed ? "You're already subscribed." : copy.doneTitle}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-light)]">
            {alreadySubscribed ? "Nothing more to do." : copy.doneBody}
          </p>
          <Link
            href={action === "unsubscribe" ? "/subscribe" : "/"}
            className="mt-4 inline-block text-xs uppercase tracking-[0.14em] text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            {action === "unsubscribe" ? "Subscribe again" : "Back to pooter.world"}
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          {token && (
            <>
              <p className="max-w-md text-base leading-relaxed text-[var(--ink-light)]">
                {copy.intro}
              </p>
              <button
                type="button"
                onClick={onConfirm}
                disabled={state === "working"}
                className="mt-6 w-full bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80 disabled:opacity-50 sm:w-auto"
              >
                {state === "working" ? copy.working : copy.button}
              </button>
            </>
          )}
          {state === "error" && (
            <div role="alert" className="mt-6 border-l-4 border-[var(--ink)] py-1 pl-4">
              <p className="text-sm leading-relaxed text-[var(--ink)]">{message}</p>
              {action === "confirm" && (
                <Link
                  href="/subscribe"
                  className="mt-2 inline-block text-xs uppercase tracking-[0.14em] text-[var(--ink-faint)] underline underline-offset-4 hover:text-[var(--ink)]"
                >
                  Sign up again
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
