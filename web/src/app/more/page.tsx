import Link from "next/link";
import type { Metadata } from "next";
import { MoreAccount } from "@/components/layout/MoreAccount";
import { MarqueeBanner } from "@/components/layout/MarqueeBanner";
import { withBrand } from "@/lib/brand";

// ============================================================================
// MORE — everything that isn't the feed, one tap away (pooter-brand rule:
// "Keep it simple: a feed first"). The More tab on phone, "Menu" on desktop.
// Every route the old header and logo menu linked to is listed here.
// ============================================================================

export const metadata: Metadata = {
  title: withBrand("More"),
  description: "Every section of pooter world: reading, markets, agents, governance, the ledger and your account.",
};

const READ = [
  { href: "/originals", label: "Originals" },
  { href: "/archive", label: "Archive" },
  { href: "/daily", label: "Editions" },
  { href: "/sentiment", label: "Index" },
  { href: "/pipe", label: "Pipe" },
  { href: "/discuss", label: "Discuss" },
  { href: "/stumble", label: "Stumble" },
  { href: "/music", label: "Music" },
];

const ACT = [
  { href: "/markets", label: "Markets" },
  { href: "/bots", label: "Agents" },
  { href: "/proposals", label: "Governance" },
  { href: "/coop", label: "Co-op" },
  { href: "/predictions", label: "Predictions" },
  { href: "/predictions/arb", label: "Arb scanner" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/registry", label: "Registry" },
  { href: "/vault", label: "Vault" },
  { href: "/nouns", label: "Nouns" },
  { href: "/pepe", label: "Pepe" },
  { href: "/write", label: "Write" },
];

const ABOUT = [
  { href: "/subscribe", label: "The Daily Pooter", desc: "Morning brief by email" },
  { href: "/architecture", label: "Architecture", desc: "How the system is built" },
  { href: "/appendix", label: "Appendix", desc: "Contracts and API reference" },
  { href: "/style-guide", label: "Style guide", desc: "Brand and design system" },
  { href: "/typography", label: "Typography lab", desc: "Type candidates" },
  { href: "/zk-recovery", label: "ZK recovery", desc: "Passwordless wallet recovery" },
  { href: "/privacy", label: "Privacy", desc: "What we collect and why" },
  { href: "/terms", label: "Terms and risk", desc: "Experimental, unaudited, not advice" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="news-label pb-2 text-xl text-[var(--ink)]">{children}</h2>;
}

function TileGrid({ items }: { items: { href: string; label: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="flex h-16 items-center justify-center border border-[var(--rule-light)] bg-[var(--paper-dark)] px-1 text-center text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--rule)]"
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function BigRow({ href, title, note }: { href: string; title: string; note: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center justify-between gap-3 border border-[var(--rule-light)] bg-[var(--paper-dark)] px-4 py-3 transition-colors hover:border-[var(--rule)]"
    >
      <span className="news-head text-lg text-[var(--ink)]">{title}</span>
      <span className="text-right text-[13px] text-[var(--ink-faint)]">{note} ›</span>
    </Link>
  );
}

export default function MorePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-7 pb-8 pt-3">
      <h1 className="news-label text-[28px] leading-tight text-[var(--ink)]">More</h1>

      <section className="flex flex-col gap-2" aria-label="Ledger and signals">
        <SectionLabel>Ledger and signals</SectionLabel>
        <BigRow href="/ledger" title="The Claim Ledger" note="Claims from PMQs" />
        <BigRow href="/signals" title="Bearometer" note="Buy, hold or sell" />
      </section>

      <section aria-label="Read">
        <SectionLabel>Read</SectionLabel>
        <TileGrid items={READ} />
      </section>

      <section aria-label="Act">
        <SectionLabel>Act</SectionLabel>
        <TileGrid items={ACT} />
      </section>

      <section aria-label="Prices">
        <SectionLabel>Prices</SectionLabel>
        <MarqueeBanner variant="row" />
      </section>

      <section aria-label="Account">
        <SectionLabel>Account</SectionLabel>
        <MoreAccount />
      </section>

      <section aria-label="About">
        <SectionLabel>About</SectionLabel>
        <div className="flex flex-col">
          {ABOUT.map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--rule-light)] py-2 text-[15px] text-[var(--ink)]"
            >
              <span>{label}</span>
              <span className="text-right text-[13px] text-[var(--ink-faint)]">{desc} ›</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
