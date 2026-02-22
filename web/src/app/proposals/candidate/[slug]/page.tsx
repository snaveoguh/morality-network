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
        <h1 className="text-2xl font-bold text-white">Candidate not found</h1>
        <p className="mt-2 text-zinc-400">
          The candidate proposal &quot;{decodedSlug}&quot; could not be found.
        </p>
        <Link
          href="/proposals"
          className="mt-4 inline-block text-[#2F80ED] hover:underline"
        >
          Back to Proposals
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/proposals"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <span>&larr;</span> All Proposals
      </Link>

      <CandidateDetail candidate={candidate} />
    </div>
  );
}
