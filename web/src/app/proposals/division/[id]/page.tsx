import {
  fetchCommonsDivisionById,
  fetchLordsDivisionById,
} from "@/lib/parliament";
import { DivisionDetail } from "@/components/proposals/DivisionDetail";
import Link from "next/link";

export const revalidate = 300;

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
        <h1 className="text-2xl font-bold text-white">Invalid Division ID</h1>
        <Link
          href="/proposals"
          className="mt-4 inline-block text-[#2F80ED] hover:underline"
        >
          Back to Proposals
        </Link>
      </div>
    );
  }

  const isLords = chamber === "lords";
  const division = isLords
    ? await fetchLordsDivisionById(divisionId)
    : await fetchCommonsDivisionById(divisionId);

  if (!division) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold text-white">Division not found</h1>
        <p className="mt-2 text-zinc-400">
          Division #{divisionId} could not be found in the{" "}
          {isLords ? "House of Lords" : "House of Commons"}.
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

      <DivisionDetail division={division} />
    </div>
  );
}
