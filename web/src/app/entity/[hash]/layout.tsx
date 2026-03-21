import { withBrand } from "@/lib/brand";
import { findUniversalLedgerContext } from "@/lib/universal-ledger";

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const initialContext = hash.startsWith("0x")
    ? await findUniversalLedgerContext(hash as `0x${string}`)
    : null;

  return {
    title: withBrand(initialContext?.title || `Entity ${hash.slice(0, 10)}...`),
    description:
      initialContext?.description || `Entity profile for ${hash} on pooter world.`,
  };
}

export default function EntityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
