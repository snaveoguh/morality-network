import type { Metadata } from "next";
import { VaultFlowDiagram } from "@/components/vault/VaultFlowDiagram";
import { VaultArchitectureSection } from "@/components/vault/VaultArchitectureSection";
import { withBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: withBrand("The Vault"),
  description:
    "How the multi-chain vault system works: Base deposits, Morpho reserves, Arbitrum bridge, and HyperLiquid perps strategy.",
};

export default function VaultPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Hero */}
      <header className="mb-10 border-b-2 border-[var(--rule)] pb-6">
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Infrastructure
        </div>
        <h1 className="mb-3 font-headline text-4xl tracking-tight md:text-5xl">
          The Vault
        </h1>
        <p className="max-w-2xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          A multi-chain capital management system that accepts ETH deposits on Base L2,
          earns yield on idle reserves through Morpho, bridges capital to Arbitrum, and
          deploys it to an autonomous HyperLiquid perpetual futures strategy. Share price
          updates daily via onchain NAV reporting.
        </p>
      </header>

      {/* How It Works */}
      <section className="mb-12">
        <h2 className="mb-6 border-b-2 border-[var(--rule)] pb-2 font-headline text-xl tracking-wide">
          How It Works
        </h2>
        <p className="mb-6 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          Capital flows through a pipeline of smart contracts across two chains. Each step is managed
          by a specific contract with its own access controls and accounting. The diagram below shows
          the full lifecycle from deposit to strategy deployment and back.
        </p>
        <VaultFlowDiagram />
      </section>

      {/* Methodology box */}
      <section className="mb-12 border-2 border-[var(--rule)] p-6">
        <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
          Methodology
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <div className="mb-1 font-headline text-sm">ERC-4626 Style Shares</div>
            <p className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
              Depositors receive fungible ERC-20 shares representing their claim on vault assets.
              Virtual offset (1e3) prevents first-depositor inflation attacks.
            </p>
          </div>
          <div>
            <div className="mb-1 font-headline text-sm">Daily NAV Settlement</div>
            <p className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
              A designated reporter pushes offchain strategy equity onchain daily.
              Delta-bounded by maxNavDeltaBps (10%) to limit single-report manipulation.
            </p>
          </div>
          <div>
            <div className="mb-1 font-headline text-sm">Performance Fee</div>
            <p className="font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
              Fee charged only on realized positive strategy PnL when capital is returned.
              Capped at 20% (MAX_PERFORMANCE_FEE_BPS = 2000).
            </p>
          </div>
        </div>
      </section>

      {/* Architecture details */}
      <VaultArchitectureSection />

      {/* Footer note */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--ink-faint)]">
          EVM contracts are upgradeable (UUPS proxy pattern) and pausable. Deployed on Base Sepolia and Arbitrum Sepolia (testnet).
          Solana programs built with Anchor. Source code available under <code>contracts/src/</code> and <code>solana-programs/</code>.
        </p>
      </footer>
    </main>
  );
}
