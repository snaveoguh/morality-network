import type { Metadata } from "next";
import Link from "next/link";
import { runStatusChecks, type CheckStatus, type StatusCheck } from "@/lib/status-checks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "System Status — pooter world",
  description: "Public health dashboard. Daily edition, newsroom, indexer, agent worker.",
  robots: { index: true, follow: false },
};

const STATUS_CRON_SCHEDULE: Array<{ time: string; what: string; route: string }> = [
  { time: "03:00 UTC (Mon, Thu)", what: "Moral Compass crawl", route: "/api/moral-compass/crawl" },
  { time: "04:00 UTC daily", what: "AI commentary", route: "/api/moral-commentary/generate" },
  { time: "05:30 UTC daily", what: "Daily Edition", route: "/api/cron/daily-edition" },
  { time: "05:45 UTC daily", what: "Daily Illustration", route: "/api/cron/daily-illustration" },
  { time: "06:00 UTC daily", what: "Newsroom (Originals)", route: "/api/newsroom" },
  { time: "07:15 UTC daily", what: "Newsletter send", route: "/api/newsletter/send" },
];

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: "OPERATIONAL",
  warn: "DEGRADED",
  fail: "DOWN",
};

const STATUS_DOT: Record<CheckStatus, string> = {
  ok: "bg-[var(--accent-green)]",
  warn: "bg-[var(--accent-amber)]",
  fail: "bg-[var(--accent-red)]",
};

const STATUS_BORDER: Record<CheckStatus, string> = {
  ok: "border-[var(--accent-green)]",
  warn: "border-[var(--accent-amber)]",
  fail: "border-[var(--accent-red)]",
};

function formatAge(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 0) return "future";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = min / 60;
  if (hr < 48) return `${hr.toFixed(1)}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toUTCString().replace(" GMT", " UTC");
  } catch {
    return iso;
  }
}

export default async function StatusPage() {
  const { overall, generatedAt, checks } = await runStatusChecks();

  return (
    <section className="mx-auto max-w-5xl py-8">
      {/* Auto-refresh every 60s — surface freshness without client JS */}
      <meta httpEquiv="refresh" content="60" />

      {/* Banner */}
      <div className={`mb-6 border-2 ${STATUS_BORDER[overall]} bg-[var(--paper-tint)] p-5`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className={`h-3 w-3 ${STATUS_DOT[overall]} animate-pulse`}
            />
            <div>
              <h1 className="font-headline text-3xl text-[var(--ink)] md:text-4xl">
                System Status — {STATUS_LABEL[overall]}
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Live · auto-refreshes every 60s · checked {formatTimestamp(generatedAt)}
              </p>
            </div>
          </div>
          <Link
            href="/api/status"
            className="hover-morph-subtle hidden font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink-faint)] hover:text-[var(--ink)] md:block"
          >
            JSON →
          </Link>
        </div>
      </div>

      {/* Checks */}
      <ul className="mb-10 space-y-3">
        {checks.map((check) => (
          <CheckRow key={check.name} check={check} />
        ))}
      </ul>

      {/* Schedule reference */}
      <details className="mb-8 border border-[var(--rule-light)] bg-[var(--paper-tint)] p-5">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-faint)] hover:text-[var(--ink)]">
          Scheduled jobs (GitHub Actions · crons.yml)
        </summary>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-light)]">
              <th className="pb-2 pr-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                When
              </th>
              <th className="pb-2 pr-4 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Job
              </th>
              <th className="pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                Endpoint
              </th>
            </tr>
          </thead>
          <tbody>
            {STATUS_CRON_SCHEDULE.map(({ time, what, route }) => (
              <tr key={route} className="border-b border-[var(--rule-light)]/50 last:border-b-0">
                <td className="py-2 pr-4 font-mono text-[11px] text-[var(--ink-light)]">{time}</td>
                <td className="py-2 pr-4 text-[var(--ink)]">{what}</td>
                <td className="py-2 font-mono text-[10px] text-[var(--ink-faint)]">{route}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        Public probe — no secrets exposed. Source:{" "}
        <code className="font-mono">/web/src/lib/status-checks.ts</code>.
      </p>
    </section>
  );
}

function CheckRow({ check }: { check: StatusCheck }) {
  return (
    <li
      className={`border-l-4 ${STATUS_BORDER[check.status]} border-y border-r border-[var(--rule-light)] bg-[var(--paper)] p-4`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span aria-hidden className={`h-2 w-2 ${STATUS_DOT[check.status]}`} />
            <h2 className="font-headline-serif text-lg text-[var(--ink)]">{check.name}</h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
              {STATUS_LABEL[check.status]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-[var(--ink-light)]">{check.description}</p>
          <p className="mt-2 break-words text-[13px] text-[var(--ink)]">{check.detail}</p>
        </div>
        <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-faint)]">
          <div>last activity</div>
          <div className="mt-0.5 text-[var(--ink)]">{formatAge(check.ageMs)}</div>
          {check.lastActivityAt && (
            <div className="mt-1 text-[9px] normal-case tracking-normal text-[var(--ink-faint)]">
              {formatTimestamp(check.lastActivityAt)}
            </div>
          )}
          <div className="mt-2 text-[9px] normal-case tracking-normal text-[var(--ink-faint)]">
            probe {check.durationMs}ms
          </div>
        </div>
      </div>
    </li>
  );
}
