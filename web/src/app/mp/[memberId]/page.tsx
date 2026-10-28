import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CiteThis } from "@/components/mp/CiteThis";
import { LegalReviewBanner } from "@/components/mp/LegalReviewBanner";
import { BRAND_NAME, withBrand } from "@/lib/brand";
import { mpLaunchGate } from "@/lib/mp-record/launch-gate";
import { formatGbp, parseMoneyToPence } from "@/lib/mp-record/parse-utils";
import { loadMpRecord, MP_RECORD_LICENCES, MP_RECORD_NOTICE, parseMemberId, type MpRecord } from "@/lib/mp-record/record";
import { REGISTER_TOP_LEVEL_CATEGORIES, topLevelCategory } from "@/lib/mp-record/sources/interests";
import { formatLongDate } from "@/lib/mp-record/stats";
import type { MemberPeriodKind, StoredVersion } from "@/lib/mp-record/types";
import type { MpTie } from "@/lib/db/mp-record";

// MP Record page (docs/MP_RECORD_SPEC.md). Sober by rule: register facts in
// the registers' own words, each linked to its source; deterministic stats
// with methodology and "cite this"; no scores, labels, crypto or AI copy.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ memberId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const memberId = parseMemberId((await params).memberId);
  const gate = mpLaunchGate();
  return {
    title: withBrand(`MP Record ${memberId ?? ""}`.trim()),
    description: "Register facts for a UK Member of Parliament: identity, claims, registered interests, donations and ties, each linked to its official source.",
    robots: gate.signedOff ? undefined : { index: false, follow: false },
  };
}

const KIND_LABEL: Record<MemberPeriodKind, string> = {
  party: "Party",
  constituency: "Constituency",
  house: "House",
  government_post: "Government posts",
  opposition_post: "Opposition posts",
  other_post: "Other posts",
  committee: "Committees",
};

const linkClass = "text-[var(--accent-red)] underline decoration-1 underline-offset-2";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]";

function d(iso: string | null | undefined): string {
  return iso ? formatLongDate(iso) : "not stated";
}

function gbp(value: string | null): string | null {
  const pence = parseMoneyToPence(value);
  return pence === null ? null : formatGbp(pence);
}

function Section({ id, title, source, children }: { id: string; title: string; source?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t-2 border-[var(--rule)] pt-6 pb-10">
      <h2 className="font-headline text-2xl text-[var(--ink)]">{title}</h2>
      {source && <p className={`mt-1 ${labelClass}`}>{source}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-body-serif text-sm text-[var(--ink-light)]">{children}</p>;
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

function lastCheck(record: MpRecord, source: string): string | null {
  return record.checks.find((c) => c.source === source && c.scopeKey === `member:${record.memberId}`)?.checkedAt ?? null;
}

function Profile({ record }: { record: MpRecord }) {
  const m = record.member!.data;
  const byKind = new Map<MemberPeriodKind, StoredVersion<"mp_member_periods">[]>();
  for (const p of record.periods) {
    const list = byKind.get(p.data.kind) ?? [];
    list.push(p);
    byKind.set(p.data.kind, list);
  }
  const rows: Array<[string, string | null]> = [
    ["Full title", m.nameFullTitle],
    ["Party", m.latestPartyName],
    ["Constituency", m.constituencyName],
    ["House", m.house],
    ["Member since", m.membershipStartDate ? d(m.membershipStartDate) : null],
    ["Status", m.statusDescription],
  ];
  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className={labelClass}>{k}</dt>
            <dd className="font-body-serif text-base text-[var(--ink)]">{v ?? "not stated"}</dd>
          </div>
        ))}
      </dl>
      {(["party", "constituency", "government_post", "opposition_post", "other_post", "committee"] as MemberPeriodKind[]).map((kind) => {
        const list = byKind.get(kind);
        if (!list?.length) return null;
        return (
          <div key={kind} className="mt-6">
            <h3 className={labelClass}>{KIND_LABEL[kind]}</h3>
            <ul className="mt-2 divide-y divide-[var(--rule-light)]">
              {list.map((p) => (
                <li key={p.sourceRecordId} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="font-body-serif text-sm text-[var(--ink)]">
                    {p.data.name}
                    {p.data.additionalInfo && kind !== "constituency" ? ` — ${p.data.additionalInfo}` : ""}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--ink-light)]">
                    {d(p.data.startDate)} – {p.data.endDate ? d(p.data.endDate) : "present"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

function Stats({ record }: { record: MpRecord }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {record.stats.map((s) => (
        <div key={s.id} id={`stat-${s.id}`} className="border border-[var(--rule-light)] p-4">
          <p className={labelClass}>{s.label}</p>
          <p className="mt-1 font-headline text-3xl text-[var(--ink)]">{s.available ? s.headline : "—"}</p>
          <p className="mt-1 font-body-serif text-xs text-[var(--ink-light)]">
            {s.available
              ? `Data as of ${d(s.dataAsOf)}. Source: ${s.source}.`
              : `Not available: ${s.unavailableReason}.`}
          </p>
          {s.notes.length > 0 && (
            <ul className="mt-2 list-disc pl-4 font-body-serif text-xs text-[var(--ink-light)]">
              {s.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-baseline gap-4">
            <Link href={`/mp/${record.memberId}/stats/${s.id}?asOf=${s.asOf}`} className={`font-mono text-[10px] uppercase tracking-[0.2em] ${linkClass}`}>
              Methodology &amp; entries
            </Link>
          </div>
          <CiteThis citation={s.citation} permalink={s.permalink} />
        </div>
      ))}
    </div>
  );
}

function Claims({ record }: { record: MpRecord }) {
  if (record.claims.length === 0) {
    return <Empty>No statements by this Member are on the Claim Ledger yet. The ledger currently covers Prime Minister&rsquo;s Questions and Budget statements.</Empty>;
  }
  const shown = record.claims.slice(0, 20);
  return (
    <>
      <ul className="divide-y divide-[var(--rule-light)]">
        {shown.map((c) => (
          <li key={c.id} className="py-4">
            <blockquote className="border-l-2 border-[var(--rule)] pl-3 font-body-serif text-base leading-relaxed text-[var(--ink)]">
              &ldquo;{c.verbatimQuote}&rdquo;
            </blockquote>
            <p className="mt-2 pl-3 font-mono text-[11px] text-[var(--ink-light)]">
              {c.context === "budget" ? "Budget" : "PMQs"} · {d(c.utteredAt)} · <SourceLink href={c.sourceUrl}>Hansard</SourceLink>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-body-serif text-sm">
        <Link href={`/ledger/member/${record.memberId}`} className={linkClass}>
          Full Claim Ledger record ({record.claims.length} {record.claims.length === 1 ? "claim" : "claims"})
        </Link>
      </p>
    </>
  );
}

function InterestEntry({ entry, children }: { entry: StoredVersion<"mp_interests">; children?: React.ReactNode }) {
  const i = entry.data;
  const value = gbp(i.valueGbp);
  const regularity = i.isRegularPayment ? i.fields.find((f) => f.name === "RegularityOfPayment")?.value : null;
  return (
    <li className="py-3">
      <p className="font-body-serif text-sm text-[var(--ink)]">{i.summary ?? "(no summary in the register)"}</p>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--ink-light)]">
        {i.payerOrDonorName && !i.payerFromParent ? <>{i.payerOrDonorName} · </> : null}
        {value ? <>{value}{i.isRegularPayment ? `, regularity of payment: ${typeof regularity === "string" ? regularity : "not stated"}` : ""} · </> : null}
        {i.valueAmount && i.valueCurrency !== "GBP" ? <>{i.valueCurrency} {i.valueAmount} · </> : null}
        Registered {d(i.registrationDate)}
        {i.updatedDates.length > 0 ? ` · updated ${i.updatedDates.map((u) => d(u)).join(", ")}` : ""}
        {i.rectified ? " · rectified" : ""}
        {" · "}
        <SourceLink href={entry.sourceApiUrl}>Register entry {i.interestId}</SourceLink>
      </p>
      {i.rectifiedDetails && <p className="mt-1 font-body-serif text-xs text-[var(--ink-light)]">Rectification: {i.rectifiedDetails}</p>}
      {children}
    </li>
  );
}

function Interests({ record }: { record: MpRecord }) {
  const parents = record.interests.filter((i) => i.data.parentInterestId === null);
  const children = new Map<number, StoredVersion<"mp_interests">[]>();
  for (const i of record.interests) {
    if (i.data.parentInterestId === null) continue;
    const list = children.get(i.data.parentInterestId) ?? [];
    list.push(i);
    children.set(i.data.parentInterestId, list);
  }
  const groups = new Map<string, StoredVersion<"mp_interests">[]>();
  for (const p of parents) {
    const top = topLevelCategory(p.data.categoryNumber) ?? "?";
    const list = groups.get(top) ?? [];
    list.push(p);
    groups.set(top, list);
  }
  if (parents.length === 0) return <Empty>The register lists no interests for this Member.</Empty>;
  return (
    <>
      {[...groups.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([top, entries]) => (
          <div key={top} className="mb-6">
            <h3 className={labelClass}>
              {top}. {REGISTER_TOP_LEVEL_CATEGORIES[top] ?? "Category"}
            </h3>
            <ul className="divide-y divide-[var(--rule-light)]">
              {entries.map((p) => (
                <InterestEntry key={p.sourceRecordId} entry={p}>
                  {(children.get(p.data.interestId) ?? []).length > 0 && (
                    <ul className="mt-2 border-l border-[var(--rule-light)] pl-3">
                      {(children.get(p.data.interestId) ?? []).map((c) => (
                        <InterestEntry key={c.sourceRecordId} entry={c} />
                      ))}
                    </ul>
                  )}
                </InterestEntry>
              ))}
            </ul>
          </div>
        ))}
      {record.removedInterests.length > 0 && (
        <div className="mt-6">
          <h3 className={labelClass}>No longer in the register</h3>
          <ul className="divide-y divide-[var(--rule-light)]">
            {record.removedInterests.map((r) => (
              <li key={r.sourceRecordId} className="py-3 font-body-serif text-sm text-[var(--ink-light)]">
                {r.data.summary} — no longer in the register as of {d(r.retrievedAt)} ·{" "}
                <SourceLink href={r.sourceApiUrl}>Register entry {r.data.interestId}</SourceLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Donations({ record }: { record: MpRecord }) {
  if (record.donations.length === 0) {
    return (
      <Empty>
        {record.pendingLinkCount > 0
          ? `${record.pendingLinkCount} Electoral Commission ${record.pendingLinkCount === 1 ? "record awaits" : "records await"} confirmation that ${record.pendingLinkCount === 1 ? "it refers" : "they refer"} to this Member, and ${record.pendingLinkCount === 1 ? "is" : "are"} not shown until a reviewer confirms.`
          : "No Electoral Commission donation records are linked to this Member."}
      </Empty>
    );
  }
  return (
    <ul className="divide-y divide-[var(--rule-light)]">
      {record.donations.map((v) => {
        const x = v.data;
        return (
          <li key={v.sourceRecordId} className="py-3">
            <p className="font-body-serif text-sm text-[var(--ink)]">
              {x.donorName ?? "(donor not stated)"}
              {x.donorStatus ? <span className="text-[var(--ink-light)]"> · {x.donorStatus}</span> : null}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--ink-light)]">
              {gbp(x.valueGbp) ?? "value not stated"} · {x.donationType ?? "type not stated"} · accepted {d(x.acceptedDate)}
              {x.reportingPeriodName ? ` · reported ${x.reportingPeriodName}` : ""} · <SourceLink href={v.sourceUrl}>{x.ecRef}</SourceLink>
            </p>
            {(x.natureOfDonation || x.purposeOfVisit) && (
              <p className="mt-1 font-body-serif text-xs text-[var(--ink-light)]">{x.natureOfDonation ?? x.purposeOfVisit}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function tieLabel(tieType: string): string {
  if (tieType.startsWith("interest:")) {
    const top = topLevelCategory(tieType.slice("interest:".length)) ?? "?";
    return `Register of Interests, category ${tieType.slice("interest:".length)}${REGISTER_TOP_LEVEL_CATEGORIES[top] ? ` (${REGISTER_TOP_LEVEL_CATEGORIES[top]})` : ""}`;
  }
  if (tieType === "ec_donation") return "Electoral Commission donation";
  if (tieType === "directorship") return "Companies House appointment";
  if (tieType === "appg_officer") return "APPG officer";
  return tieType;
}

function Ties({ ties, memberId }: { ties: MpTie[]; memberId: number }) {
  if (ties.length === 0) return <Empty>No register entries name a counterparty for this Member.</Empty>;
  return (
    <>
      <ul className="divide-y divide-[var(--rule-light)]">
        {ties.map((t) => (
          <li key={`${t.sourceTable}:${t.sourceRecordId}`} className="py-3">
            <p className="font-body-serif text-sm text-[var(--ink)]">{t.counterpartyName}</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--ink-light)]">
              {tieLabel(t.tieType)}
              {gbp(t.valueGbp) ? ` · ${gbp(t.valueGbp)}` : ""}
              {t.periodStart ? ` · ${d(t.periodStart)}${t.periodEnd ? ` – ${d(t.periodEnd)}` : ""}` : ""} · <SourceLink href={t.sourceUrl}>Source</SourceLink>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-body-serif text-xs text-[var(--ink-light)]">
        Each line is one register entry that names a counterparty. Companies House and APPG registers are not yet included.
        Machine-readable: <a href={`/api/mp/${memberId}/ties`} className={linkClass}>/api/mp/{memberId}/ties</a>
      </p>
    </>
  );
}

export default async function MpRecordPage({ params }: Params) {
  const gate = mpLaunchGate();
  if (!gate.visible) notFound();
  const memberId = parseMemberId((await params).memberId);
  if (memberId === null) notFound();

  const record = await loadMpRecord(memberId);
  if (!record) notFound();
  const { getMpTies } = await import("@/lib/db/mp-record");
  const ties = await getMpTies(memberId);
  const m = record.member!;
  const memberCheck = lastCheck(record, "members");
  const interestsCheck = lastCheck(record, "interests");

  return (
    <article className="mx-auto max-w-3xl py-6">
      <LegalReviewBanner />
      <header className="pb-6">
        <p className={labelClass}>{BRAND_NAME} MP Record</p>
        <h1 className="mt-2 font-headline text-4xl text-[var(--ink)] md:text-5xl">{record.name}</h1>
        <p className="mt-2 font-body-serif text-base text-[var(--ink-light)]">
          {[m.data.latestPartyName, m.data.constituencyName].filter(Boolean).join(" · ")}
        </p>
        <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.15em]" aria-label="Sections">
          {[["profile", "Profile"], ["figures", "Figures"], ["claims", "Claims"], ["interests", "Interests"], ["donations", "Donations"], ["ties", "Ties"], ["reply", "Reply & corrections"]].map(([id, label]) => (
            <a key={id} href={`#${id}`} className={linkClass}>{label}</a>
          ))}
        </nav>
      </header>

      <Section
        id="profile"
        title="Profile"
        source={<>Source: <SourceLink href={m.sourceUrl}>UK Parliament Members API</SourceLink>{memberCheck ? `, checked ${d(memberCheck)}` : ""}</>}
      >
        <Profile record={record} />
      </Section>

      <Section id="figures" title="Figures" source="Deterministic sums and counts of register entries. Each has a permalink, an as-of date and a methodology.">
        <Stats record={record} />
      </Section>

      <Section id="claims" title="Claims" source="Source: Hansard, via the pooter world Claim Ledger">
        <Claims record={record} />
      </Section>

      <Section
        id="interests"
        title="Registered interests"
        source={<>Source: <SourceLink href={`https://members.parliament.uk/member/${memberId}/registeredinterests`}>Register of Members&rsquo; Financial Interests</SourceLink>{interestsCheck ? `, checked ${d(interestsCheck)}` : ""}. Entries in the register&rsquo;s own words.</>}
      >
        <Interests record={record} />
      </Section>

      <Section id="donations" title="Donations" source={<>Source: <SourceLink href="https://search.electoralcommission.org.uk/">Electoral Commission register</SourceLink>, Member as regulated donee</>}>
        <Donations record={record} />
      </Section>

      <Section id="ties" title="Ties" source="Organisations and people named in this Member's register entries">
        <Ties ties={ties} memberId={memberId} />
      </Section>

      <Section id="reply" title="Right of reply and corrections">
        <p className="font-body-serif text-sm text-[var(--ink)]">
          This Member, or their office, can attach a response to this record or to any entry on it.{" "}
          <Link href={`/mp/${memberId}/reply`} className={linkClass}>Submit a reply</Link>. If we have made an error, the same form reaches us; corrections are logged below and at{" "}
          <Link href="/mp/corrections" className={linkClass}>the corrections log</Link>.
        </p>
        {record.replies.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--rule-light)]">
            {record.replies.map((r) => (
              <li key={r.id} className="py-3 font-body-serif text-sm text-[var(--ink)]">
                <p className={labelClass}>Reply{r.identity ? ` from ${r.identity}` : ""}{r.subjectRecord ? ` on ${r.subjectRecord}` : ""} · {d(r.createdAt)}</p>
                <p className="mt-1 whitespace-pre-line">{r.body}</p>
                {r.response && <p className="mt-2 text-[var(--ink-light)]">Our response: {r.response}</p>}
              </li>
            ))}
          </ul>
        )}
        <h3 className={`mt-6 ${labelClass}`}>Corrections</h3>
        {record.corrections.length === 0 ? (
          <Empty>No corrections have been made to this record.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--rule-light)]">
            {record.corrections.map((c) => (
              <li key={c.id} className="py-3 font-body-serif text-sm text-[var(--ink)]">
                <p className={labelClass}>{d(c.correctedAt)}{c.memberId === null ? " · site-wide" : ""}</p>
                <p className="mt-1">Was wrong: {c.whatWasWrong}</p>
                <p>Changed: {c.whatChanged}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <footer className="border-t-2 border-[var(--rule)] pt-4 font-body-serif text-xs leading-relaxed text-[var(--ink-light)]">
        <p>{MP_RECORD_NOTICE}</p>
        <p className="mt-2">
          Licences: {MP_RECORD_LICENCES.map((l, i) => (
            <span key={l.name}>{i > 0 ? "; " : ""}<SourceLink href={l.url}>{l.name}</SourceLink> ({l.covers})</span>
          ))}. Data: <a href={`/api/mp/${memberId}`} className={linkClass}>/api/mp/{memberId}</a>.
        </p>
        <p className="mt-2">Legal review: {gate.signedOff ?? "open — not yet signed off"}.</p>
      </footer>
    </article>
  );
}
