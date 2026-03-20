import { NounDetailView } from "@/components/nouns/NounDetailView";
import { withBrand } from "@/lib/brand";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ nounId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { nounId } = await params;
  return {
    title: withBrand(`Noun ${nounId}`),
    description: `View and trade Noun #${nounId} — 0% marketplace fees via Seaport 1.6.`,
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
