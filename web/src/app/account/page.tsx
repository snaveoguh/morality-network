import Link from "next/link";

import { SignInForm } from "@/components/account/SignInForm";
import { SignOutButton } from "@/components/account/SignOutButton";
import { formatMo, getAccountSummary, getLedger } from "@/lib/accounts";
import { withBrand } from "@/lib/brand";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: withBrand("Your account"),
  description: "Your MO balance, carried over from morality.network.",
};

const REASON_LABEL: Record<string, string> = {
  legacy_migration: "Opening balance — morality.network",
  award: "Award",
  spend: "Spend",
  adjustment: "Adjustment",
};

const SOURCE_LABEL: Record<string, string> = {
  balance_sheet_2021: "audited balance sheet, February 2021",
  account_profiles_2024: "platform export, July 2024",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await getSession();
  const account = session.accountId ? await getAccountSummary(session.accountId) : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="border-b-4 border-[var(--ink)] pb-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--accent-red)]">
          pooter.world
        </p>
        <h1 className="font-masthead mt-2 text-4xl leading-[0.95] sm:text-5xl">
          Your account
        </h1>
      </header>

      {!account ? (
        <section className="mt-10">
          {error === "link_invalid" && (
            <p className="mb-6 border-l-4 border-[var(--accent-red)] bg-[var(--paper-tint)] py-3 pl-4 text-sm leading-relaxed">
              That sign-in link has expired or was already used. Request a new one below.
            </p>
          )}
          <p className="mb-6 max-w-xl text-base leading-relaxed text-[var(--ink-light)]">
            If you held MO on morality.network, your balance has carried over.
            Sign in with the email address you used there.
          </p>
          <SignInForm />
        </section>
      ) : (
        <SignedIn account={account} />
      )}

      <footer className="mt-14 border-t border-[var(--rule-light)] pt-5">
        <Link
          href="/"
          className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] underline underline-offset-4 transition-colors hover:text-[var(--accent-red)]"
        >
          Back to the front page
        </Link>
      </footer>
    </main>
  );
}

async function SignedIn({
  account,
}: {
  account: NonNullable<Awaited<ReturnType<typeof getAccountSummary>>>;
}) {
  const ledger = await getLedger(account.id);
  const mainnetMo = Number.parseFloat(account.legacyMainnetMo || "0");
  const legacyEth = Number.parseFloat(account.legacyEth || "0");

  return (
    <>
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-sm text-[var(--ink-light)]">{account.email}</p>
          <SignOutButton />
        </div>

        <div className="mt-4 border-2 border-[var(--ink)] bg-[var(--paper-tint)] p-7">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
            MO balance
          </p>
          <p className="font-masthead mt-2 text-5xl leading-none sm:text-6xl">
            {formatMo(account.balanceMo)}
          </p>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--ink-light)]">
            Held on the platform. The MO token has not been redeployed yet — when
            it is, this balance is what you will be able to claim.
          </p>
        </div>
      </section>

      {(mainnetMo > 0 || legacyEth > 0 || account.legacyAddress) && (
        <section className="mt-8">
          <h2 className="font-headline text-lg">From the old platform</h2>
          <dl className="mt-3 divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]">
            {account.legacyAddress && (
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-sm text-[var(--ink-light)]">Old custodial wallet</dt>
                <dd className="font-mono text-xs break-all text-[var(--ink-faint)]">
                  {account.legacyAddress}
                </dd>
              </div>
            )}
            {mainnetMo > 0 && (
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-sm text-[var(--ink-light)]">
                  MO you moved to Ethereum mainnet
                  <span className="mt-1 block text-xs text-[var(--ink-faint)]">
                    Already in your own custody — not counted in the balance above.
                  </span>
                </dt>
                <dd className="font-mono text-sm">{formatMo(account.legacyMainnetMo)}</dd>
              </div>
            )}
            {legacyEth > 0 && (
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="text-sm text-[var(--ink-light)]">
                  ETH left on the old wallet
                </dt>
                <dd className="font-mono text-sm">{legacyEth}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-headline text-lg">History</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-faint)]">
            No movements recorded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--rule-light)] border-y border-[var(--rule-light)]">
            {ledger.map((entry) => {
              const delta = Number.parseFloat(entry.delta);
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm">{REASON_LABEL[entry.reason] ?? entry.reason}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                      {entry.created_at.toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      {entry.ref && SOURCE_LABEL[entry.ref] ? ` · ${SOURCE_LABEL[entry.ref]}` : ""}
                    </p>
                  </div>
                  <p
                    className={`font-mono text-sm ${
                      delta < 0 ? "text-[var(--accent-red)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatMo(entry.delta)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
