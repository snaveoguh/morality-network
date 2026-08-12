import { BRAND_DOMAIN, BRAND_NAME, withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Privacy"),
  description: `What ${BRAND_NAME} collects, why, and what is published permanently on-chain.`,
};

/*
  DRAFT — NOT LEGAL ADVICE.
  This policy was written in plain language by the operators and has NOT yet
  been reviewed by a solicitor. Before relying on it for UK GDPR compliance
  (or citing it in an app-store submission), have it reviewed and the lawful
  bases confirmed. TODO: solicitor review.
*/

interface Section {
  id: string;
  title: string;
  body: React.ReactNode;
}

const LAST_UPDATED = "12 August 2026";

const SECTIONS: Section[] = [
  {
    id: "what-we-collect",
    title: "I. What we collect",
    body: (
      <>
        <p>We collect very little, and most of what we hold you gave us on purpose:</p>
        <ul>
          <li>
            <strong>Email address.</strong> Used to sign you in (we email you a
            magic link) and for anything you explicitly subscribe to. Emails are
            sent through Resend, our email provider.
          </li>
          <li>
            <strong>Wallet addresses.</strong> Any address you link to your
            account. Wallet addresses are public by nature; linking one tells us
            it is yours.
          </li>
          <li>
            <strong>Review votes and ratings.</strong> Votes, ratings, and
            verdicts you submit to the ledger are published — on-chain and in
            the public ledger — by design. That is the point of the product.
          </li>
          <li>
            <strong>Server logs.</strong> Standard request logs (IP address,
            user agent, timestamps) kept for security and debugging, on our
            hosting provider (Railway), and rotated on their schedule.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "what-we-dont",
    title: "II. What we don't do",
    body: (
      <>
        <ul>
          <li>No advertising trackers.</li>
          <li>No third-party analytics cookies.</li>
          <li>
            The only cookie we set is the session cookie
            (<code>morality-session</code>) that keeps you signed in. It is not
            used to profile you.
          </li>
          <li>We do not sell or rent your data to anyone.</li>
        </ul>
      </>
    ),
  },
  {
    id: "on-chain",
    title: "III. On-chain activity is public and permanent",
    body: (
      <>
        <p>
          Anything written to a public blockchain — votes, ratings, tips,
          transactions from a wallet you linked — is publicly visible and
          cannot be deleted by us or by anyone else. Do not put anything
          on-chain you may later want removed; we have no ability to remove it.
        </p>
      </>
    ),
  },
  {
    id: "lawful-basis",
    title: "IV. Why we process it (lawful basis)",
    body: (
      <>
        <p>
          For UK GDPR purposes: we process your email and account data because
          we need it to provide the service you asked for
          (<em>performance of a contract</em>), and we keep server logs and
          basic security records because running the site safely requires it
          (<em>legitimate interest</em>). This page describes our practice
          plainly; it is not legal advice.
        </p>
      </>
    ),
  },
  {
    id: "public-figures",
    title: "V. Claims about public figures — right of reply",
    body: (
      <>
        <p>
          The claim ledger publishes verdicts on statements made by public
          figures in public office. If a claim concerns you and you believe the
          record is wrong, there is a right-of-reply route: see{" "}
          <a href="/ledger/dispute">the dispute page</a>. Replies are attached
          to the record, not buried.
        </p>
      </>
    ),
  },
  {
    id: "deletion",
    title: "VI. Deletion and contact",
    body: (
      <>
        <p>
          To delete your account data (email, linked-wallet associations,
          anything held off-chain), or to ask what we hold about you, email{" "}
          <a href="mailto:accounts@pooter.world">accounts@pooter.world</a>. We
          will action it. We cannot delete on-chain records — see section III.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Masthead */}
      <div className="mb-10 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-masthead text-4xl text-[var(--ink)] sm:text-5xl">
          Privacy
        </h1>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          What {BRAND_NAME} collects, why, and what is published permanently.
          Written plainly, because you should not need a lawyer to read it.
        </p>
        <div className="mt-3 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          Last updated {LAST_UPDATED}
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="mb-10 scroll-mt-16">
          <div className="mb-4 border-b-2 border-[var(--rule)] pb-2">
            <h2 className="font-headline text-xl text-[var(--ink)]">
              {section.title}
            </h2>
          </div>
          <div className="privacy-body font-body-serif text-sm leading-relaxed text-[var(--ink-light)] [&_a]:text-[var(--accent-red)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-[var(--ink)] [&_li]:mb-2 [&_p]:mb-3 [&_strong]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:pl-5">
            {section.body}
          </div>
        </section>
      ))}

      {/* Colophon */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <div className="mb-1 h-px bg-[var(--rule)]" />
        <div className="mb-3 h-[2px] bg-[var(--rule)]" />
        <p className="font-mono text-[7px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_DOMAIN} &bull; no trackers &bull; one session cookie &bull;
          on-chain is forever
        </p>
      </footer>
    </div>
  );
}
