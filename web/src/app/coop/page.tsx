import Link from "next/link";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Co-op"),
  description: "Morality Co-operative Ltd — an experimental lab building open infrastructure and public goods.",
};

const PROJECTS = [
  { href: "/signals", label: "Signals", desc: "Real-time trading signals aggregated from 70+ news sources, AI sentiment, and technical analysis.", tag: "Trading" },
  { href: "/predictions", label: "Predictions", desc: "Binary outcome markets on DAO proposals and geopolitical events. Parimutuel pools with 2% protocol fee.", tag: "Markets" },
  { href: "/nouns", label: "Nouns Marketplace", desc: "Zero-fee Nouns NFT marketplace built on Seaport 1.6. Peer-to-peer trading on Ethereum mainnet.", tag: "NFT" },
  { href: "/pepe", label: "Rare Pepe Exchange", desc: "Emblem Vault integration for the 1,774-card Counterparty Rare Pepe collection.", tag: "NFT" },
  { href: "/music", label: "The Underground", desc: "Taste-aware music discovery powered by Last.fm. Gets smarter the more you listen.", tag: "Discovery" },
  { href: "/discuss", label: "Discuss", desc: "Onchain threaded discussion stored permanently on Base L2. Comments, voting, and tipping.", tag: "Social" },
  { href: "/registry", label: "Registry", desc: "Score any URL, contract, domain, or address for morality, bias, and factuality.", tag: "Scoring" },
  { href: "/vault", label: "Vault", desc: "Multi-chain capital management: Base deposit, Morpho yield, Arbitrum bridge, HyperLiquid perps.", tag: "DeFi" },
  { href: "/terminal", label: "Terminal", desc: "Holder-gated AI trading chat with real-time risk assessment and position execution.", tag: "Trading" },
  { href: "/stumble", label: "Stumble", desc: "Random article discovery with infinite scroll. Find something you weren't looking for.", tag: "Discovery" },
  { href: "/pipe", label: "Pipe", desc: "Real-time trading engine powered by multi-agent deliberation. Agents argue about what the data means before anyone trades.", tag: "Trading" },
  { href: "/", label: "Daily Edition", desc: "AI-generated daily broadsheet. The editorial takes a market stance and tracks whether it was right.", tag: "Media" },
];

const EXTERNAL = [
  { href: "https://mutuals.fca.org.uk/Search/Society/30459", label: "FCA Register", desc: "Morality Co-operative Ltd — registered mutual society" },
  { href: "https://github.com/snaveoguh/morality-network", label: "Source Code", desc: "Full open-source codebase on GitHub" },
];

export default function CoopPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 border-b-2 border-[var(--rule)] pb-6">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Morality Co-operative
        </h1>
        <p className="mt-3 max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          An experimental lab building open infrastructure and public goods.
          Everything here is permissionless, onchain, and open source.
          We believe markets work better when information flows freely —
          so we build tools that make that happen and give them away.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {EXTERNAL.map(({ href, label, desc }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 border border-[var(--rule)] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {label} {"\u2197"}
              <span className="font-mono text-[7px] normal-case tracking-normal text-[var(--ink-faint)]">
                {desc}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Project Grid */}
      <div className="mb-4">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Playground
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3">
        {PROJECTS.map(({ href, label, desc, tag }) => (
          <Link
            key={href}
            href={href}
            className="group border border-[var(--rule-light)] p-5 transition-colors hover:bg-[var(--paper-dark)]"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink)] group-hover:underline">
                {label}
              </span>
              <span className="bg-[var(--paper-dark)] px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                {tag}
              </span>
            </div>
            <p className="mt-2 font-mono text-[8px] leading-relaxed text-[var(--ink-faint)]">
              {desc}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
