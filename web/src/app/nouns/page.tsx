import { NounsMarketplace } from "@/components/nouns/NounsMarketplace";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Nouns Marketplace"),
  description:
    "Buy and sell Nouns NFTs with 0% marketplace fees via Seaport 1.6. Direct peer-to-peer trading on Ethereum.",
};

export const revalidate = 3600; // 1 hour ISR

export default function NounsPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <NounsMarketplace />
    </main>
  );
}
