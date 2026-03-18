import { PepeMarketplace } from "@/components/pepe/PepeMarketplace";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Rare Pepe Exchange"),
  description:
    "Browse, buy, and list Rare Pepe NFTs via Emblem Vault on Ethereum. 1,774 certified cards from the original Counterparty collection.",
};

export const revalidate = 60; // 1 min ISR

export default function PepePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <PepeMarketplace />
    </main>
  );
}
