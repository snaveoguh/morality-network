import {
  fetchCommonsDivisionById,
  fetchLordsDivisionById,
} from "@/lib/parliament";
import { DivisionDetail } from "@/components/proposals/DivisionDetail";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

/** Race a promise against a timeout — returns fallback on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chamber?: string }>;
}

export default async function DivisionPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { chamber } = await searchParams;
  const divisionId = parseInt(id, 10);

  if (isNaN(divisionId)) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Invalid Division ID
        </h1>
        <Link
          href="/proposals"
          className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          Back to Proposals &rsaquo;
        </Link>
      </div>
    );
  }

  const isLords = chamber === "lords";
  const division = isLords
    ? await withTimeout(fetchLordsDivisionById(divisionId), 15000, null)
    : await withTimeout(fetchCommonsDivisionById(divisionId), 15000, null);

  if (!division) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Division not found
        </h1>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-faint)]">
          Division #{divisionId} could not be found in the{" "}
          {isLords ? "House of Lords" : "House of Commons"}.
        </p>
        <Link
          href="/proposals"
          className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
        >
          Back to Proposals &rsaquo;
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/proposals"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        <span>&larr;</span> All Proposals
      </Link>

      <DivisionDetail division={division} />
    </div>
  );
}
