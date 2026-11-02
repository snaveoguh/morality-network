import Link from "next/link";
import { notFound } from "next/navigation";
import { withBrand } from "@/lib/brand";
import { economyStats, getArea, getSnapshot, listAreas } from "@/lib/coops/economy";
import { formatPounds, readPipeline } from "@/lib/coops/service";
import { MODEL_LABEL, STAGES, STAGE_LABEL, STAGE_MEANING, type PipelineCoop } from "@/lib/coops/types";
import { BarPanel } from "@/components/coops/BarPanel";
import { DotMap } from "@/components/coops/DotMap";
import { SocietyDirectory } from "@/components/coops/SocietyDirectory";

export const revalidate = 300;
export const dynamicParams = false; // areas come from areas.json; anything else is a real 404

export function generateStaticParams() {
  return listAreas().map((a) => ({ area: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ area: string }> }) {
  const area = getArea((await params).area);
  if (!area) return {};
  return {
    title: withBrand(`${area.name} co-op tracker`),
    description: `Every co-operative and community benefit society registered in ${area.name}, and how each new co-op is doing.`,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-[var(--rule-light)] pt-3">
      <p className="font-headline text-3xl text-[var(--ink)] tabular-nums sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-[var(--ink-light)]">{label}</p>
    </div>
  );
}

function SectionHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mb-5 border-t-4 border-double border-[var(--ink)] pt-5">
      <h2 className="font-headline text-2xl font-semibold text-[var(--ink)]">{title}</h2>
      {intro && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-light)]">{intro}</p>}
    </div>
  );
}

function Pipeline({ coops, available, areaName }: { coops: PipelineCoop[]; available: boolean; areaName: string }) {
  const stages = STAGES.filter((s) => s !== "closed");
  const live = coops.filter((c) => c.stage !== "closed");
  const totals = {
    members: live.reduce((n, c) => n + c.members, 0),
    jobs: live.reduce((n, c) => n + c.jobsFte, 0),
    support: coops.reduce((n, c) => n + c.supportPence, 0),
  };

  return (
    <section className="mb-12">
      <SectionHead
        title="New co-ops"
        intro={`Co-ops starting in ${areaName} that have joined the tracker. Each one moves through the same stages, and its figures are updated as it goes.`}
      />

      <ol className="grid grid-cols-2 gap-px bg-[var(--rule-light)] sm:grid-cols-5">
        {stages.map((stage) => (
          <li key={stage} className="bg-[var(--paper)] p-3">
            <p className="font-headline text-2xl tabular-nums text-[var(--ink)]">
              {coops.filter((c) => c.stage === stage).length}
            </p>
            <p className="text-sm font-medium text-[var(--ink)]">{STAGE_LABEL[stage]}</p>
            <p className="mt-1 text-xs leading-snug text-[var(--ink-faint)]">{STAGE_MEANING[stage]}</p>
          </li>
        ))}
      </ol>

      {!available ? (
        <p className="mt-5 text-[15px] text-[var(--ink-light)]">
          The new co-op tracker is not connected on this server yet. The register figures below are unaffected.
        </p>
      ) : coops.length === 0 ? (
        <p className="mt-5 text-[15px] text-[var(--ink-light)]">
          No new co-ops have joined the tracker yet.{" "}
          <Link href="/coops/start" className="text-[var(--ink)] underline">
            Starting one? Begin here.
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <Figure value={totals.members.toLocaleString("en-GB")} label="Members" />
            <Figure value={totals.jobs.toLocaleString("en-GB")} label="Jobs (full-time equivalent)" />
            <Figure value={formatPounds(totals.support)} label="Programme support received" />
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--rule)] text-[var(--ink-faint)]">
                <tr>
                  <th className="py-2 pr-4 font-medium">Co-op</th>
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
                  <th className="py-2 pr-4 text-right font-medium">Members</th>
                  <th className="py-2 pr-4 text-right font-medium">Jobs</th>
                  <th className="py-2 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-light)]">
                {coops.map((c) => (
                  <tr key={c.slug}>
                    <td className="py-3 pr-4">
                      <Link href={`/coops/c/${c.slug}`} className="font-headline text-base text-[var(--ink)] hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-[var(--ink-faint)]">
                        {c.sector}
                        {c.district ? ` · ${c.district}` : ""}
                      </p>
                    </td>
                    <td className="py-3 pr-4 text-[var(--ink-light)]">{MODEL_LABEL[c.model]}</td>
                    <td className="py-3 pr-4 text-[var(--ink)]">{STAGE_LABEL[c.stage]}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.members}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.jobsFte}</td>
                    <td className="py-3 text-right text-[var(--ink-faint)]">{formatDate(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default async function AreaTrackerPage({ params }: { params: Promise<{ area: string }> }) {
  const { area: slug } = await params;
  const area = getArea(slug);
  const snapshot = getSnapshot(slug);
  if (!area || !snapshot) notFound();

  const stats = economyStats(snapshot, area);
  const pipeline = await readPipeline(slug);
  const fetched = formatDate(snapshot.fetchedAt);
  const source = `Source: FCA Mutuals Public Register, registered offices, fetched ${fetched}.`;
  const topDistrict = stats.byDistrict[0];
  const topSector = stats.bySector[0];
  const topType = stats.byType[0];
  const districtsWithCoops = stats.byDistrict.filter((d) => d.count > 0).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
      <header className="mb-10">
        <p className="text-sm text-[var(--ink-faint)]">
          <Link href="/coops" className="hover:underline">Co-op tracker</Link>
        </p>
        <h1 className="mt-2 font-headline text-4xl text-[var(--ink)] sm:text-5xl">{area.name} co-operatives</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-light)]">
          Every co-operative, community benefit society and credit union registered in {area.name}, and how each new
          co-op is doing. {area.authorityNote}
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            href="/coops/start"
            className="bg-[var(--ink)] px-4 py-2 font-medium text-[var(--paper)] hover:opacity-90"
          >
            Start a co-op
          </Link>
          <a
            href={`/api/coops/${slug}?format=csv`}
            className="border border-[var(--rule)] px-4 py-2 text-[var(--ink)] hover:bg-[var(--paper-dark)]"
          >
            Download the data (CSV)
          </a>
        </div>
      </header>

      <section className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure value={String(stats.active.length)} label="Societies on the register" />
        <Figure value={String(stats.sinceYear.count)} label={`Registered since ${stats.sinceYear.year}`} />
        <Figure value={`${districtsWithCoops} of ${area.districts.length}`} label="Districts with a society" />
        <Figure
          value={pipeline.available ? String(pipeline.coops.length) : "—"}
          label="New co-ops on the tracker"
        />
      </section>

      <Pipeline coops={pipeline.coops} available={pipeline.available} areaName={area.name} />

      <section className="mb-12">
        <SectionHead
          title="The co-op economy today"
          intro={`What is already registered in ${area.name}. New co-ops are measured against this starting point.`}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <DotMap
            societies={stats.active}
            title={`Where the ${stats.active.length} societies are registered`}
            source={source}
            className="lg:col-span-2"
          />
          <BarPanel
            title={`${topDistrict.label} has the most, with ${topDistrict.count}`}
            rows={stats.byDistrict}
            source={source}
          />
          <BarPanel
            title={`${topSector.label} is the largest sector, with ${topSector.count} societies`}
            rows={stats.bySector}
            source={`${source} Sector is the FCA's reporting classification.`}
            limit={10}
          />
          <BarPanel
            title={`${Math.round((topType.count / stats.active.length) * 100)}% are ${topType.label.toLowerCase()} societies`}
            rows={stats.byType}
            source={source}
          />
          <BarPanel
            title={`${stats.sinceYear.count} of today's societies registered since ${stats.sinceYear.year}`}
            rows={stats.byDecade}
            source={`${source} Only societies still on the register are counted, so older decades look smaller than they were.`}
          />
          {stats.closing.length > 0 && (
            <BarPanel
              title={`${stats.closing.length} more are on the register but closing, dissolving or transferring`}
              rows={Object.entries(
                stats.closing.reduce<Record<string, number>>((acc, s) => {
                  const label = s.status.replace(/^Registered - /, "");
                  acc[label] = (acc[label] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([label, count]) => ({ label, count }))}
              source={`${source} Not counted in the totals above.`}
            />
          )}
        </div>
      </section>

      <section className="mb-12">
        <SectionHead title="Directory" intro="Every society counted above. Names link to the FCA register." />
        <SocietyDirectory societies={stats.active} districts={area.districts.map((d) => d.name).sort()} />
      </section>

      <section className="mb-4">
        <SectionHead title="How this is counted" />
        <div className="max-w-2xl space-y-3 text-[15px] leading-relaxed text-[var(--ink-light)]">
          <p>
            The register figures come from the{" "}
            <a href={snapshot.source.url} className="text-[var(--ink)] underline" target="_blank" rel="noopener noreferrer">
              FCA Mutuals Public Register
            </a>
            . We keep societies the FCA classes as co-operative or community benefit, plus credit unions, and place
            each one by the postcode of its registered office using postcodes.io. A society that trades in{" "}
            {area.name} but has its registered office elsewhere is not counted, and the reverse.
          </p>
          <p>
            The register does not record members, turnover or jobs, so those figures appear only for new co-ops on the
            tracker, which report them themselves. The register also stops classifying a society once it is
            deregistered, so we do not publish a survival rate.
          </p>
          <p>
            New co-ops join the tracker through{" "}
            <Link href="/coops/start" className="text-[var(--ink)] underline">
              Start a co-op
            </Link>{" "}
            and appear here once checked. Their stage and figures are updated as they report, and every change is kept.
          </p>
          <p>
            Data: <a href={`/api/coops/${slug}`} className="text-[var(--ink)] underline">JSON</a> ·{" "}
            <a href={`/api/coops/${slug}?format=csv`} className="text-[var(--ink)] underline">CSV</a>. Register snapshot
            fetched {fetched}.
          </p>
        </div>
      </section>
    </div>
  );
}
