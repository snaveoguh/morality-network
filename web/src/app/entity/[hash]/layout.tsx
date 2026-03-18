import { withBrand } from "@/lib/brand";

export async function generateMetadata({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  return {
    title: withBrand(`Entity ${hash.slice(0, 10)}...`),
    description: `Entity profile for ${hash} on pooter world.`,
  };
}

export default function EntityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
