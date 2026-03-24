import { PepeDetailView } from "@/components/pepe/PepeDetailView";
import { withBrand, SITE_URL } from "@/lib/brand";

export async function generateMetadata({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const imageUrl = `${SITE_URL}/api/pepe/img/${asset}`;
  return {
    title: withBrand(asset),
    description: `Rare Pepe card: ${asset}. View details, holders, and Emblem Vault listings.`,
    openGraph: {
      title: asset,
      description: `Rare Pepe card: ${asset}. View details, holders, and Emblem Vault listings.`,
      images: [{ url: imageUrl, width: 800, height: 800, alt: asset }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: asset,
      images: [imageUrl],
    },
  };
}

export const revalidate = 3600; // 1 hour ISR

export default async function PepeDetailPage({
  params,
}: {
  params: Promise<{ asset: string }>;
}) {
  const { asset } = await params;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <PepeDetailView asset={asset.toUpperCase()} />
    </main>
  );
}
