"use client";

import { useState, useMemo } from "react";
import { getVotePercentage } from "@/lib/governance";
import type { ParliamentDivision, MPVote } from "@/lib/parliament";

interface DivisionDetailProps {
  division: ParliamentDivision;
}

export function DivisionDetail({ division }: DivisionDetailProps) {
  const { forPct, againstPct } = getVotePercentage(
    division.ayeCount,
    division.noeCount
  );
  const [activeTab, setActiveTab] = useState<"ayes" | "noes">("ayes");

  const ayeMembers = division.ayeMembers || [];
  const noeMembers = division.noeMembers || [];

  const ayeByParty = useMemo(() => groupByParty(ayeMembers), [ayeMembers]);
  const noeByParty = useMemo(() => groupByParty(noeMembers), [noeMembers]);

  const allParties = useMemo(() => {
    const partyMap = new Map<
      string,
      { party: string; ayes: number; noes: number }
    >();
    for (const m of ayeMembers) {
      const entry = partyMap.get(m.party) || {
        party: m.party,
        ayes: 0,
        noes: 0,
      };
      entry.ayes++;
      partyMap.set(m.party, entry);
    }
    for (const m of noeMembers) {
      const entry = partyMap.get(m.party) || {
        party: m.party,
        ayes: 0,
        noes: 0,
      };
      entry.noes++;
      partyMap.set(m.party, entry);
    }
    return Array.from(partyMap.values()).sort(
      (a, b) => b.ayes + b.noes - (a.ayes + a.noes)
    );
  }, [ayeMembers, noeMembers]);

  const officialLink =
    division.house === "Commons"
      ? `https://votes.parliament.uk/votes/commons/division/${division.id}`
      : `https://votes.parliament.uk/votes/lords/division/${division.id}`;
  const houseLabel =
    division.house === "Commons" ? "House of Commons" : "House of Lords";
  const resultPassed = division.ayeCount > division.noeCount;
  const totalVotes = division.ayeCount + division.noeCount;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            🇬🇧 UK Parliament
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-faint)]">
            · {houseLabel}
          </span>
          <span className="font-mono text-[10px] text-[var(--ink-faint)]">
            ·{" "}
            {new Date(division.date).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>

        <h1 className="font-headline text-3xl leading-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
          {division.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-b border-[var(--rule-light)] pb-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            Division #{division.id}
          </span>
          <a
            href={officialLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            View on Parliament website &rsaquo;
          </a>
        </div>

        <div className="mt-5 border-b border-t border-[var(--rule)] py-4">
          <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Division Result
          </h2>

          <div className="mb-3 flex items-baseline gap-6">
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {division.ayeCount.toLocaleString()}
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Ayes ({forPct}%)
              </span>
            </div>
            <span className="font-headline text-lg text-[var(--ink-faint)]">&mdash;</span>
            <div>
              <span className="font-headline text-2xl font-black text-[var(--ink)]">
                {division.noeCount.toLocaleString()}
              </span>
              <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                Noes ({againstPct}%)
              </span>
            </div>
            {division.didNotVoteCount > 0 && (
              <>
                <span className="font-headline text-lg text-[var(--ink-faint)]">&mdash;</span>
                <div>
                  <span className="font-headline text-2xl font-black text-[var(--ink-faint)]">
                    {division.didNotVoteCount.toLocaleString()}
                  </span>
                  <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Did Not Vote
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex h-1.5 overflow-hidden bg-[var(--paper-dark)]">
            <div
              className="bg-[var(--ink)] transition-all"
              style={{ width: `${forPct}%` }}
            />
            <div
              className="bg-[var(--rule)] transition-all"
              style={{ width: `${againstPct}%` }}
            />
          </div>

          <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            {resultPassed ? (
              <span className="font-bold text-[var(--ink)]">Motion passed</span>
            ) : (
              <span className="font-bold text-[var(--ink)]">Motion defeated</span>
            )}
          </p>
        </div>

        {allParties.length > 0 && (
          <div className="mt-5 border-b border-[var(--rule)] pb-4">
            <h2 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
              Party Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-light)] text-left">
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                      Party
                    </th>
                    <th className="pb-2 pr-3 text-right font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                      Ayes
                    </th>
                    <th className="pb-2 pr-3 text-right font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                      Noes
                    </th>
                    <th className="pb-2 text-right font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allParties.map((party) => (
                    <tr
                      key={party.party}
                      className="border-b border-[var(--rule-light)] last:border-0"
                    >
                      <td className="py-2 pr-3 font-body-serif text-[var(--ink)]">
                        {party.party}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-[11px] text-[var(--ink)]">
                        {party.ayes}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-[11px] text-[var(--ink)]">
                        {party.noes}
                      </td>
                      <td className="py-2 text-right font-mono text-[11px] text-[var(--ink-faint)]">
                        {party.ayes + party.noes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(ayeMembers.length > 0 || noeMembers.length > 0) && (
          <div className="mt-4">
            <div className="flex items-center gap-0 font-mono text-[10px] uppercase tracking-wider">
              {(["ayes", "noes"] as const).map((tab, index) => (
                <span key={tab} className="flex items-center">
                  {index > 0 && (
                    <span className="mx-2 text-[var(--rule-light)]">|</span>
                  )}
                  <button
                    onClick={() => setActiveTab(tab)}
                    className={`transition-colors ${
                      activeTab === tab
                        ? "font-bold text-[var(--ink)] underline underline-offset-4"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {tab === "ayes"
                      ? `Ayes (${ayeMembers.length})`
                      : `Noes (${noeMembers.length})`}
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-4 border-t border-[var(--rule)] pt-4">
              {activeTab === "ayes" ? (
                <MemberList members={ayeByParty} isAye />
              ) : (
                <MemberList members={noeByParty} isAye={false} />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="border-t border-[var(--rule)] pt-4">
          <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            Details
          </h3>
          <dl className="space-y-2">
            {[
              ["House", houseLabel],
              ["Division ID", `#${division.id}`],
              ["Date", new Date(division.date).toLocaleDateString("en-GB")],
              ["Total Votes", totalVotes.toLocaleString()],
              ["Did Not Vote", division.didNotVoteCount.toLocaleString()],
              ["Result", resultPassed ? "Passed" : "Defeated"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between">
                <dt className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {label}
                </dt>
                <dd className="font-body-serif text-xs text-[var(--ink)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function groupByParty(
  members: MPVote[]
): { party: string; members: MPVote[] }[] {
  const map = new Map<string, MPVote[]>();
  for (const m of members) {
    const party = m.party?.trim() || "Independent";
    const arr = map.get(party) || [];
    arr.push(m);
    map.set(party, arr);
  }
  return Array.from(map.entries())
    .map(([party, members]) => ({ party, members }))
    .sort((a, b) => b.members.length - a.members.length);
}

function MemberList({
  members,
  isAye,
}: {
  members: { party: string; members: MPVote[] }[];
  isAye: boolean;
}) {
  if (members.length === 0) {
    return (
      <p className="font-body-serif text-sm italic text-[var(--ink-faint)]">
        No individual vote data available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {members.map(({ party, members: mps }, partyIndex) => (
        <div key={party}>
          <h4 className="mb-2 border-b border-[var(--rule-light)] pb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            {party} ({mps.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {mps.map((mp, index) => (
              <span
                key={`${partyIndex}-${mp.memberId}-${index}`}
                className={`border px-2 py-0.5 font-mono text-[10px] ${
                  isAye
                    ? "border-[var(--rule)] text-[var(--ink)]"
                    : "border-[var(--rule-light)] text-[var(--ink-faint)]"
                }`}
              >
                {mp.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
