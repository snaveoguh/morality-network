import Link from "next/link";

import { EnrolForm } from "@/components/review/EnrolForm";
import { ReviewQueue } from "@/components/review/ReviewQueue";
import { formatMo, getBalanceMo } from "@/lib/accounts";
import { withBrand } from "@/lib/brand";
import { DEFAULT_STAKE_MO, getReviewerProfile } from "@/lib/ledger/review-staking";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: withBrand("Review queue"),
  description: "Sign off on Claim Ledger verdicts. Staked, blind, and paid in MO.",
};

export default async function ReviewPage() {
  const session = await getSession();

  if (!session.accountId) {
    return (
      <Shell>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--ink-light)]">
          The Ledger publishes no negative verdict without a human signing off. Reviewers
          stake MO, read the evidence, and vote — blind, so nobody anchors on anyone else.
        </p>
        <Link
          href="/account"
          className="mt-5 inline-block bg-[var(--ink)] px-6 py-3 text-xs uppercase tracking-[0.16em] text-[var(--paper)] transition-opacity hover:opacity-80"
        >
          Sign in to review
        </Link>
      </Shell>
    );
  }

  const [profile, balanceMo] = await Promise.all([
    getReviewerProfile(session.accountId),
    getBalanceMo(session.accountId),
  ]);

  return (
    <Shell>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-[var(--ink-light)]">{session.accountEmail}</p>
        <p className="text-sm text-[var(--ink-faint)]">{formatMo(balanceMo)} MO</p>
      </div>

      {profile ? (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-y border-[var(--rule-light)] py-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                Reviews
              </dt>
              <dd className="font-mono">{profile.reviewsTotal}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                With the majority
              </dt>
              <dd className="font-mono">{profile.reviewsAgreed}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                Overturned
              </dt>
              <dd className="font-mono">{profile.overturned}</dd>
            </div>
          </dl>
          <ReviewQueue />
        </>
      ) : (
        <>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--ink-light)]">
            1,780 claims are sitting unresolved, and no negative verdict can publish until a
            human signs it off. That&apos;s the job.
          </p>
          <EnrolForm balanceMo={balanceMo} minStakeMo={DEFAULT_STAKE_MO} />
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="border-b-4 border-[var(--ink)] pb-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent-red)]">
          The Claim Ledger
        </p>
        <h1 className="font-masthead mt-2 text-4xl leading-[0.95] sm:text-5xl">Review queue</h1>
      </header>
      {children}
      <footer className="mt-14 border-t border-[var(--rule-light)] pt-5">
        <Link
          href="/ledger"
          className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] underline underline-offset-4 transition-colors hover:text-[var(--accent-red)]"
        >
          Back to the Ledger
        </Link>
      </footer>
    </main>
  );
}
