import { EntityProfile } from "@/components/entity/EntityProfile";
import { findUniversalLedgerContext } from "@/lib/universal-ledger";

interface EntityPageProps {
  params: Promise<{ hash: string }>;
}

export default async function EntityPage({ params }: EntityPageProps) {
  const { hash } = await params;

  if (!hash || !hash.startsWith("0x")) {
    return (
      <div className="py-12 text-center text-zinc-400">
        Invalid entity hash.
      </div>
    );
  }

  const initialContext = await findUniversalLedgerContext(hash as `0x${string}`);

  return (
    <EntityProfile
      entityHash={hash as `0x${string}`}
      initialContext={initialContext}
    />
  );
}
