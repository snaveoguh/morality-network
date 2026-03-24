import { NounDetailView } from "@/components/nouns/NounDetailView";
import { withBrand, BRAND_NAME } from "@/lib/brand";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ nounId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { nounId } = await params;
  const imageUrl = `https://noun.pics/${nounId}`;
  const title = `Noun ${nounId}`;
  const description = `View and trade Noun #${nounId} — 0% marketplace fees via Seaport 1.6.`;
  return {
    title: withBrand(title),
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 320, height: 320, alt: title }],
      type: "website",
      siteName: BRAND_NAME,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [imageUrl],
    },
  };
}

export default async function NounDetailPage({ params }: Props) {
  const { nounId } = await params;
  const id = Number(nounId);

  if (!Number.isFinite(id) || id < 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-6">
        <p className="py-24 text-center font-body-serif text-sm text-[var(--ink-faint)]">
          Invalid Noun ID.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <NounDetailView nounId={id} />
    </main>
  );
}
