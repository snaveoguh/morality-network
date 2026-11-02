import Link from "next/link";
import { notFound } from "next/navigation";
import { withBrand } from "@/lib/brand";
import { fcaSearchUrl, getArea } from "@/lib/coops/economy";
import { formatPounds, readCoop } from "@/lib/coops/service";
import { MODEL_LABEL, STAGES, STAGE_LABEL } from "@/lib/coops/types";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const found = await readCoop((await params).slug);
  if (!found) return {};
  return { title: withBrand(found.coop.name), description: found.coop.summary || `${found.coop.name} on the co-op tracker.` };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function CoopPage({ params }: { params: Promise<{ slug: string }> }) {
  const found = await readCoop((await params).slug);
  if (!found) notFound();
  const { coop, events } = found;
  const area = getArea(coop.area);
  const path = STAGES.filter((s) => s !== "closed");
  const reached = path.indexOf(coop.stage as (typeof path)[number]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm text-[var(--ink-faint)]">
        <Link href={`/coops/${coop.area}`} className="hover:underline">{area?.name ?? coop.area} co-op tracker</Link>
      </p>
      <h1 className="mt-2 font-headline text-4xl text-[var(--ink)]">{coop.name}</h1>
      <p className="mt-2 text-[15px] text-[var(--ink-light)]">
        {MODEL_LABEL[coop.model]} · {coop.sector}
        {coop.district ? ` · ${coop.district}` : ""}
      </p>
      {coop.summary && <p className="mt-4 text-[17px] leading-relaxed text-[var(--ink)]">{coop.summary}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 text-sm">
        {coop.website && (
          <a href={coop.website} className="underline" target="_blank" rel="noopener noreferrer">Website</a>
        )}
        {coop.fcaRegNo && (
          <a href={fcaSearchUrl(coop.name)} className="underline" target="_blank" rel="noopener noreferrer">
            FCA register no. {coop.fcaRegNo}
          </a>
        )}
      </p>

      {coop.stage === "closed" ? (
        <p className="mt-8 text-[15px] text-[var(--ink)]">This co-op has closed.</p>
      ) : (
        <ol className="mt-8 grid grid-cols-5 gap-px bg-[var(--rule-light)] text-center text-xs sm:text-sm">
          {path.map((stage, i) => (
            <li
              key={stage}
              className={i <= reached ? "bg-[var(--ink)] py-2 text-[var(--paper)]" : "bg-[var(--paper)] py-2 text-[var(--ink-faint)]"}
            >
              {STAGE_LABEL[stage]}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-8 grid grid-cols-3 gap-4">
        {[
          [coop.members.toLocaleString("en-GB"), "Members"],
          [coop.jobsFte.toLocaleString("en-GB"), "Jobs (FTE)"],
          [formatPounds(coop.supportPence), "Support received"],
        ].map(([value, label]) => (
          <div key={label} className="border-t border-[var(--rule-light)] pt-3">
            <p className="font-headline text-3xl tabular-nums text-[var(--ink)]">{value}</p>
            <p className="mt-1 text-sm text-[var(--ink-light)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mt-10 border-t-4 border-double border-[var(--ink)] pt-5">
        <h2 className="font-headline text-2xl font-semibold text-[var(--ink)]">History</h2>
        <ul className="mt-3 divide-y divide-[var(--rule-light)]">
          {events.map((e) => (
            <li key={e.at} className="py-3 text-[15px]">
              <p className="text-sm text-[var(--ink-faint)]">{formatDate(e.at)}</p>
              <p className="text-[var(--ink)]">
                {STAGE_LABEL[e.stage]} · {e.members} members · {e.jobsFte} jobs · {formatPounds(e.supportPence)} support
              </p>
              {e.note && <p className="text-[var(--ink-light)]">{e.note}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--ink-faint)]">
          Figures are reported by the co-op and checked before publishing. Last updated {formatDate(coop.updatedAt)}.
        </p>
      </section>
    </div>
  );
}
