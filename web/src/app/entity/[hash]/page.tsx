import { EntityProfile } from "@/components/entity/EntityProfile";
import {
  getEntityContext,
  setEntityContext,
  entityContextToStumbleEntry,
} from "@/lib/entity-context";
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

  const entityHash = hash as `0x${string}`;

  // 1. Fast: Redis entity context registry
  const ctx = await getEntityContext(entityHash);
  if (ctx) {
    return (
      <EntityProfile
        entityHash={entityHash}
        initialContext={entityContextToStumbleEntry(ctx)}
        entityContext={ctx}
      />
    );
  }

  // 2. Fallback: expensive universal ledger rebuild
  const ledgerCtx = await findUniversalLedgerContext(entityHash);

  // 3. Backfill Redis so next visit is fast
  if (ledgerCtx) {
    setEntityContext({
      hash: ledgerCtx.hash,
      title: ledgerCtx.title,
      source: ledgerCtx.source,
      type: ledgerCtx.type,
      description: ledgerCtx.description,
    }).catch(() => {});
  }

  return (
    <EntityProfile
      entityHash={entityHash}
      initialContext={ledgerCtx}
    />
  );
}
