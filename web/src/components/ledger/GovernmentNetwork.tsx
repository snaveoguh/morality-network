"use client";

import Link from "next/link";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type {
  GovernmentNetwork as Network,
  NetworkLayout,
  NetworkMember,
} from "@/lib/ledger/government-network";

// The government as one picture: a filled circle per department, an open
// circle per minister, a line for "corrected the record for". One ink on a
// cream panel in both themes (brand chart rule) — size carries the count,
// never colour. Tap a circle to read it; the detail card links to the profile.

// Cream panel + black ink regardless of site theme.
const PANEL: CSSProperties = {
  ["--paper" as string]: "#f2ede2",
  ["--paper-dark" as string]: "#e6e0d2",
  ["--ink" as string]: "#0d0d0d",
  ["--ink-light" as string]: "#383734",
  ["--ink-faint" as string]: "#6e6a61",
  ["--rule" as string]: "#0d0d0d",
  ["--rule-light" as string]: "#cfc8b8",
  background: "var(--paper)",
  color: "var(--ink)",
};

function days(n: number | null): string {
  if (n === null) return "not dated";
  return n === 1 ? "1 day" : `${Number.isInteger(n) ? n : n.toFixed(1)} days`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}

function Graph({
  network,
  layout,
  selected,
  onSelect,
  className,
}: {
  network: Network;
  layout: NetworkLayout;
  selected: string | null;
  onSelect: (id: string | null) => void;
  className: string;
}) {
  const memberByKey = new Map(network.members.map((m) => [m.key, m]));
  const deptById = new Map(network.departments.map((d) => [d.id, d]));

  // What stays at full strength when something is selected.
  const lit = new Set<string>();
  if (selected) {
    lit.add(selected);
    for (const e of layout.edges) {
      if (e.memberKey === selected) lit.add(e.departmentId);
      if (e.departmentId === selected) lit.add(e.memberKey);
    }
  }
  const dim = (id: string) => (selected && !lit.has(id) ? 0.22 : 1);
  const edgeLit = (e: { memberKey: string; departmentId: string }) =>
    !selected || e.memberKey === selected || e.departmentId === selected;

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={className}
      role="group"
      aria-label="Network of departments and the ministers who corrected the record for them"
      onClick={() => onSelect(null)}
    >
      {/* Lines first so every circle sits on top of them. */}
      {layout.edges.map((e) => (
        <line
          key={`${e.memberKey}>${e.departmentId}`}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke="var(--ink)"
          strokeWidth={Math.min(4, 0.75 + e.count * 0.5)}
          strokeDasharray={e.cross ? "3 3" : undefined}
          opacity={edgeLit(e) ? (e.cross && !selected ? 0.3 : 0.8) : 0.08}
        />
      ))}

      {layout.departments.map((d) => {
        const dept = deptById.get(d.id)!;
        const isSelected = selected === d.id;
        const select = () => onSelect(isSelected ? null : d.id);
        return (
          <g
            key={d.id}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${dept.name}: ${plural(dept.count, "correction")} by ${plural(dept.memberKeys.length, "minister")}`}
            onClick={(e) => {
              e.stopPropagation();
              select();
            }}
            onKeyDown={onActivate(select)}
            opacity={dim(d.id)}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[3]"
          >
            <circle cx={d.x} cy={d.y} r={d.r + 2} fill="var(--paper)" />
            <circle cx={d.x} cy={d.y} r={d.r} fill="var(--ink)" stroke="var(--ink)" />
            <text
              x={d.x}
              y={d.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--paper)"
              fontSize={d.r > 16 ? 13 : 11}
              fontWeight={700}
              className="font-mono"
            >
              {dept.count}
            </text>
            {d.labelLines.map((line, i) => (
              <text
                key={i}
                x={d.x}
                y={d.labelY + i * 13}
                textAnchor="middle"
                fill="var(--ink)"
                fontSize={10.5}
                fontWeight={isSelected ? 700 : 500}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {layout.members.map((p) => {
        const m = memberByKey.get(p.key)!;
        const isSelected = selected === p.key;
        const select = () => onSelect(isSelected ? null : p.key);
        return (
          <g
            key={p.key}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${m.name}: ${plural(m.count, "correction")}`}
            onClick={(e) => {
              e.stopPropagation();
              select();
            }}
            onKeyDown={onActivate(select)}
            opacity={dim(p.key)}
            className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[3]"
          >
            {/* Tap target larger than the mark. */}
            <circle cx={p.x} cy={p.y} r={Math.max(p.r + 5, 16)} fill="transparent" stroke="none" />
            <circle
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={isSelected ? "var(--ink)" : "var(--paper)"}
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isSelected ? "var(--paper)" : "var(--ink)"}
              fontSize={p.r > 12 ? 9.5 : 8}
              fontWeight={600}
            >
              {m.initials}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MemberLink({ m }: { m: NetworkMember }) {
  if (!m.memberId) return <>{m.name}</>;
  return (
    <Link href={`/ledger/member/${m.memberId}`} className="underline decoration-1 underline-offset-2">
      {m.name}
    </Link>
  );
}

function Detail({
  network,
  selected,
  onSelect,
}: {
  network: Network;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const member = selected ? network.members.find((m) => m.key === selected) : undefined;
  const dept = selected ? network.departments.find((d) => d.id === selected) : undefined;
  const meta = "font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-faint)]";

  if (member) {
    return (
      <>
        <p className={meta}>
          Minister &middot; {member.house}
          {member.party ? ` · ${member.party}` : ""}
        </p>
        <p className="font-headline-serif text-xl font-bold leading-tight">{member.name}</p>
        {member.role && <p className="font-body-serif text-sm text-[var(--ink-light)]">{member.role}</p>}
        <p className="mt-1 font-body-serif text-sm">
          {plural(member.count, "correction")} on the record &middot; median {days(member.medianDays)} to correct
        </p>
        <p className="font-body-serif text-sm text-[var(--ink-light)]">
          For{" "}
          {member.departments.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <button type="button" onClick={() => onSelect(d.id)} className="underline decoration-1 underline-offset-2">
                {d.name}
              </button>{" "}
              ({d.count})
            </span>
          ))}
        </p>
        {member.memberId && (
          <Link
            href={`/ledger/member/${member.memberId}`}
            className="mt-2 inline-block border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--paper)]"
          >
            Open {member.name}&rsquo;s record &rarr;
          </Link>
        )}
      </>
    );
  }

  if (dept) {
    const members = dept.memberKeys.map((k) => network.members.find((m) => m.key === k)!);
    return (
      <>
        <p className={meta}>Department</p>
        <p className="font-headline-serif text-xl font-bold leading-tight">{dept.name}</p>
        <p className="mt-1 font-body-serif text-sm">
          {plural(dept.count, "correction")} by {plural(members.length, "minister")} &middot; median{" "}
          {days(dept.medianDays)} to correct
        </p>
        <p className="mt-1 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          {members.map((m, i) => (
            <span key={m.key}>
              {i > 0 && " · "}
              <MemberLink m={m} /> ({m.departments.find((d) => d.id === dept.id)?.count})
            </span>
          ))}
        </p>
      </>
    );
  }

  return null;
}

export function GovernmentNetwork({
  network,
  phone,
  wide,
  title,
  source,
}: {
  network: Network;
  /** Two-column layout for phones. */
  phone: NetworkLayout;
  /** Four-column layout from tablet up. */
  wide: NetworkLayout;
  /** Plain-language finding. */
  title: string;
  source: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <figure style={PANEL} className="border border-[var(--rule)]">
      <figcaption className="border-b border-[var(--rule-light)] p-4">
        <h2 className="font-headline-serif text-xl font-bold leading-snug md:text-2xl">{title}</h2>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">{source}</p>
        <p className="mt-3 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
          Tap a circle to read it. A filled circle is a department; its number is the corrections laid for
          it. An open circle is a minister, sized by how many corrections they made. A line joins a minister
          to a department they corrected the record for; a dashed line is a second department.
        </p>
      </figcaption>

      <div className="px-1 py-3 md:px-4">
        <Graph network={network} layout={phone} selected={selected} onSelect={setSelected} className="block w-full md:hidden" />
        <Graph network={network} layout={wide} selected={selected} onSelect={setSelected} className="hidden w-full md:block" />
      </div>

      {/* Bottom sheet for the tapped circle; sits above the phone tab bar. */}
      {selected && (
        <div
          style={PANEL}
          aria-live="polite"
          className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-4xl border-t-2 border-[var(--rule)] p-4 pr-12 shadow-[0_-4px_16px_rgba(0,0,0,0.18)] lg:bottom-0 lg:border-x-2"
        >
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Close"
            className="absolute right-2 top-2 h-9 w-9 font-mono text-lg leading-none text-[var(--ink)]"
          >
            &times;
          </button>
          <Detail network={network} selected={selected} onSelect={setSelected} />
        </div>
      )}
    </figure>
  );
}
