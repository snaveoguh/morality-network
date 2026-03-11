import { fetchCandidateProposals } from "@/lib/nouns-candidates";
import { CandidateDetail } from "@/components/proposals/CandidateDetail";
import Link from "next/link";

export const revalidate = 120;

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CandidatePage({ params }: Props) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  const candidates = await fetchCandidateProposals();
  const candidate = candidates.find((c) => c.slug === decodedSlug);

  if (!candidate) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          Candidate Not Found
        </h1>
        <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
          The candidate proposal &quot;{decodedSlug}&quot; could not be located.
        </p>
        <Link
          href="/proposals"
          className="mt-4 inline-block font-mono text-xs uppercase tracking-wider text-[var(--ink-light)] hover:text-[var(--ink)]"
        >
          &larr; Return to Proposals
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/proposals"
        className="mb-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
      >
        &larr; All Proposals
      </Link>

      <CandidateDetail candidate={candidate} />
    </div>
  );
}
