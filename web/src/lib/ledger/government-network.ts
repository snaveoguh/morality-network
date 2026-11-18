// Government network — departments and the ministers who corrected the record
// for them, built from the Corrections Register and nothing else.
//
// Every node and every line is a count of register entries: a department, a
// minister, and "this minister placed N corrections on the record for this
// department". Nothing is inferred and no line means anything more than that.
// Pure module (no I/O) so the graph and its layout are unit-testable.

import { median, type MinisterialCorrection } from "./corrections";

export interface NetworkDepartment {
  /** Stable key: "d:<name>". */
  id: string;
  name: string;
  /** Confirmed corrections laid for this department. */
  count: number;
  medianDays: number | null;
  /** Ministers who corrected for it, most corrections first. */
  memberKeys: string[];
}

export interface NetworkMember {
  /** Stable key: "m:<memberId>" or "n:<name>" when the record has no id. */
  key: string;
  memberId: number | null;
  name: string;
  initials: string;
  party: string | null;
  house: "Commons" | "Lords";
  /** Office as stated on the record, when it states one. */
  role: string | null;
  count: number;
  medianDays: number | null;
  /** Departments this minister corrected for, most corrections first. */
  departments: Array<{ id: string; name: string; count: number }>;
}

export interface GovernmentNetwork {
  departments: NetworkDepartment[];
  members: NetworkMember[];
  /** Confirmed corrections the graph is built from. */
  total: number;
}

const TITLES = new Set([
  "sir", "dame", "dr", "mr", "mrs", "ms", "lord", "lady", "baroness", "baron",
  "viscount", "earl", "the", "rt", "hon", "rev",
]);

/** Two letters for a node: first and last name word, titles and "of …" dropped. */
export function memberInitials(name: string): string {
  const words = name
    .replace(/\bof\b.*$/i, "")
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w && !TITLES.has(w.toLowerCase()));
  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function memberKey(member: { memberId: number | null; name: string }): string {
  return member.memberId ? `m:${member.memberId}` : `n:${member.name}`;
}

function departmentName(c: MinisterialCorrection): string {
  return c.department?.trim() || "Unattributed";
}

/** Review-flagged candidates are excluded, as in every other register figure. */
export function buildGovernmentNetwork(all: MinisterialCorrection[]): GovernmentNetwork {
  const confirmed = all.filter((c) => !c.needsReview);
  const daysOf = (rows: MinisterialCorrection[]) =>
    rows.map((c) => c.daysToCorrect).filter((d): d is number => d !== null);

  const byDept = new Map<string, MinisterialCorrection[]>();
  const byMember = new Map<string, MinisterialCorrection[]>();
  for (const c of confirmed) {
    const dept = departmentName(c);
    byDept.set(dept, [...(byDept.get(dept) ?? []), c]);
    const key = memberKey(c.member);
    byMember.set(key, [...(byMember.get(key) ?? []), c]);
  }

  const members: NetworkMember[] = [...byMember.entries()]
    .map(([key, rows]) => {
      const perDept = new Map<string, number>();
      for (const c of rows) perDept.set(departmentName(c), (perDept.get(departmentName(c)) ?? 0) + 1);
      const first = rows[0];
      return {
        key,
        memberId: first.member.memberId,
        name: first.member.name,
        initials: memberInitials(first.member.name),
        party: first.member.party,
        house: first.house,
        role: rows.find((c) => c.member.role)?.member.role ?? null,
        count: rows.length,
        medianDays: median(daysOf(rows)),
        departments: [...perDept.entries()]
          .map(([name, count]) => ({ id: `d:${name}`, name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const departments: NetworkDepartment[] = [...byDept.entries()]
    .map(([name, rows]) => ({
      id: `d:${name}`,
      name,
      count: rows.length,
      medianDays: median(daysOf(rows)),
      // `members` is already sorted, so this keeps most-corrections-first.
      memberKeys: members.filter((m) => m.departments.some((d) => d.name === name)).map((m) => m.key),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { departments, members, total: confirmed.length };
}

/** Other ministers who corrected the record for the same departments. */
export function colleaguesOf(
  network: GovernmentNetwork,
  key: string,
): Array<{ department: NetworkDepartment; members: NetworkMember[] }> {
  const self = network.members.find((m) => m.key === key);
  if (!self) return [];
  const byKey = new Map(network.members.map((m) => [m.key, m]));
  return self.departments
    .map((d) => network.departments.find((dept) => dept.id === d.id))
    .filter((d): d is NetworkDepartment => Boolean(d))
    .map((department) => ({
      department,
      members: department.memberKeys.filter((k) => k !== key).map((k) => byKey.get(k)!),
    }));
}

// ── layout ──────────────────────────────────────────────────────────────────
// Deterministic (same data → same picture, on the server and in tests): each
// department is a hub with its ministers on a ring around it, clusters laid in
// a grid, biggest first. A minister who corrected for two departments sits in
// the one with more of their corrections and a line crosses to the other.

export interface LaidOutDepartment {
  id: string;
  x: number;
  y: number;
  r: number;
  /** Department name wrapped for the label under the cluster. */
  labelLines: string[];
  labelY: number;
}

export interface LaidOutMember {
  key: string;
  x: number;
  y: number;
  r: number;
}

export interface LaidOutEdge {
  memberKey: string;
  departmentId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Corrections this line stands for. */
  count: number;
  /** True when the line leaves the minister's own cluster. */
  cross: boolean;
}

export interface NetworkLayout {
  width: number;
  height: number;
  departments: LaidOutDepartment[];
  members: LaidOutMember[];
  edges: LaidOutEdge[];
}

const CELL_WIDTH = 195;
const LABEL_LINE = 13;
const LABEL_CHARS = 30;

export function wrapLabel(text: string, maxChars = LABEL_CHARS): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Area-proportional radii, floored so a node stays a comfortable tap target. */
export function memberRadius(count: number): number {
  return Math.min(17, 8 + 2.4 * Math.sqrt(count));
}
export function departmentRadius(count: number): number {
  return Math.min(26, 11 + 2.6 * Math.sqrt(count));
}

export function layoutNetwork(network: GovernmentNetwork, columns: number): NetworkLayout {
  const cols = Math.max(1, Math.floor(columns));
  const memberByKey = new Map(network.members.map((m) => [m.key, m]));

  // A minister lives in the cluster holding most of their corrections.
  const homeOf = new Map(network.members.map((m) => [m.key, m.departments[0].id]));

  const clusters = network.departments.map((dept) => {
    const residents = dept.memberKeys.filter((k) => homeOf.get(k) === dept.id);
    const hubR = departmentRadius(dept.count);
    const maxMemberR = Math.max(0, ...residents.map((k) => memberRadius(memberByKey.get(k)!.count)));
    // Ring wide enough that neighbours on it never overlap.
    const needed = residents.reduce((sum, k) => sum + 2 * memberRadius(memberByKey.get(k)!.count) + 6, 0);
    const ring =
      residents.length === 0
        ? 0
        : Math.max(hubR + maxMemberR + 10, residents.length > 1 ? needed / (2 * Math.PI) : 0);
    const labelLines = wrapLabel(dept.name);
    const extent = residents.length === 0 ? hubR : ring + maxMemberR;
    return { dept, residents, hubR, ring, labelLines, extent, height: 2 * extent + 12 + labelLines.length * LABEL_LINE + 18 };
  });

  const departments: LaidOutDepartment[] = [];
  const members: LaidOutMember[] = [];
  let y = 8;
  for (let i = 0; i < clusters.length; i += cols) {
    const row = clusters.slice(i, i + cols);
    const rowExtent = Math.max(...row.map((c) => c.extent));
    row.forEach((c, col) => {
      const cx = col * CELL_WIDTH + CELL_WIDTH / 2;
      const cy = y + rowExtent;
      departments.push({
        id: c.dept.id,
        x: cx,
        y: cy,
        r: c.hubR,
        labelLines: c.labelLines,
        labelY: cy + c.extent + 16,
      });
      c.residents.forEach((key, n) => {
        // Start at the top; a lone minister sits directly above the hub.
        const angle = -Math.PI / 2 + (2 * Math.PI * n) / c.residents.length;
        members.push({
          key,
          x: cx + c.ring * Math.cos(angle),
          y: cy + c.ring * Math.sin(angle),
          r: memberRadius(memberByKey.get(key)!.count),
        });
      });
    });
    y += Math.max(...row.map((c) => c.height + (rowExtent - c.extent) * 2));
  }

  const deptPos = new Map(departments.map((d) => [d.id, d]));
  const memberPos = new Map(members.map((m) => [m.key, m]));
  const edges: LaidOutEdge[] = [];
  for (const m of network.members) {
    const from = memberPos.get(m.key)!;
    for (const d of m.departments) {
      const to = deptPos.get(d.id)!;
      edges.push({
        memberKey: m.key,
        departmentId: d.id,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        count: d.count,
        cross: homeOf.get(m.key) !== d.id,
      });
    }
  }

  return { width: cols * CELL_WIDTH, height: Math.ceil(y), departments, members, edges };
}
