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

  // Group by party
  const ayeByParty = useMemo(() => groupByParty(ayeMembers), [ayeMembers]);
  const noeByParty = useMemo(() => groupByParty(noeMembers), [noeMembers]);

  // Party breakdown for summary
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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main content */}
      <div className="lg:col-span-2">
        {/* Header */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-2xl" role="img" aria-label="UK">
              🇬🇧
            </span>
            <span className="text-sm font-medium text-white">UK Parliament</span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                division.house === "Commons"
                  ? "border-green-500/30 bg-green-500/10 text-green-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              House of {division.house}
            </span>
            <span className="text-xs text-zinc-500">
              {new Date(division.date).toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>

          <h1 className="mb-3 text-2xl font-bold text-white sm:text-3xl">
            {division.title}
          </h1>

          <a
            href={officialLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#2F80ED] hover:underline"
          >
            View on Parliament website &rarr;
          </a>
        </div>

        {/* Vote bar — big version */}
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Division Result
          </h2>
          <div className="mb-3 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-[#31F387]">
                {division.ayeCount}
              </p>
              <p className="text-xs text-zinc-500">Ayes ({forPct}%)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#D0021B]">
                {division.noeCount}
              </p>
              <p className="text-xs text-zinc-500">Noes ({againstPct}%)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-400">
                {division.didNotVoteCount}
              </p>
              <p className="text-xs text-zinc-500">Did Not Vote</p>
            </div>
          </div>

          <div className="flex h-4 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="bg-[#31F387] transition-all"
              style={{ width: `${forPct}%` }}
            />
            <div
              className="bg-[#D0021B] transition-all"
              style={{ width: `${againstPct}%` }}
            />
          </div>

          <p className="mt-3 text-center text-sm font-medium">
            {division.ayeCount > division.noeCount ? (
              <span className="text-[#31F387]">Motion passed</span>
            ) : (
              <span className="text-[#D0021B]">Motion defeated</span>
            )}
          </p>
        </div>

        {/* Party breakdown table */}
        {allParties.length > 0 && (
          <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Party Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-4">Party</th>
                    <th className="pb-2 pr-4 text-right text-[#31F387]">Ayes</th>
                    <th className="pb-2 pr-4 text-right text-[#D0021B]">Noes</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allParties.map((p) => (
                    <tr
                      key={p.party}
                      className="border-b border-zinc-800/50 last:border-0"
                    >
                      <td className="py-2 pr-4 text-white">{p.party}</td>
                      <td className="py-2 pr-4 text-right text-[#31F387]">
                        {p.ayes}
                      </td>
                      <td className="py-2 pr-4 text-right text-[#D0021B]">
                        {p.noes}
                      </td>
                      <td className="py-2 text-right text-zinc-400">
                        {p.ayes + p.noes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Individual MPs tabs */}
        {(ayeMembers.length > 0 || noeMembers.length > 0) && (
          <>
            <div className="mb-4 flex gap-1 border-b border-zinc-800">
              {(["ayes", "noes"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? tab === "ayes"
                        ? "border-[#31F387] text-[#31F387]"
                        : "border-[#D0021B] text-[#D0021B]"
                      : "border-transparent text-zinc-500 hover:text-white"
                  }`}
                >
                  {tab === "ayes"
                    ? `Ayes (${ayeMembers.length})`
                    : `Noes (${noeMembers.length})`}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              {activeTab === "ayes" ? (
                <MemberList members={ayeByParty} isAye={true} />
              ) : (
                <MemberList members={noeByParty} isAye={false} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Division metadata */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Details
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">House</dt>
              <dd
                className={
                  division.house === "Commons"
                    ? "text-green-400"
                    : "text-red-400"
                }
              >
                House of {division.house}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Division ID</dt>
              <dd className="text-white">#{division.id}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Date</dt>
              <dd className="text-white">
                {new Date(division.date).toLocaleDateString("en-GB")}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Total Votes</dt>
              <dd className="text-white">
                {division.ayeCount + division.noeCount}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Did Not Vote</dt>
              <dd className="text-white">{division.didNotVoteCount}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Result</dt>
              <dd>
                {division.ayeCount > division.noeCount ? (
                  <span className="text-[#31F387]">Passed</span>
                ) : (
                  <span className="text-[#D0021B]">Defeated</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function groupByParty(
  members: MPVote[]
): { party: string; members: MPVote[] }[] {
  const map = new Map<string, MPVote[]>();
  for (const m of members) {
    const arr = map.get(m.party) || [];
    arr.push(m);
    map.set(m.party, arr);
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
      <p className="text-sm text-zinc-500">
        No individual vote data available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {members.map(({ party, members: mps }) => (
        <div key={party}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {party} ({mps.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {mps.map((mp) => (
              <span
                key={mp.memberId}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isAye
                    ? "bg-[#31F387]/10 text-[#31F387]"
                    : "bg-[#D0021B]/10 text-[#D0021B]"
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
