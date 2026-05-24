"use client";

// ============================================================================
// DocumentExaminer — left sidebar, collapsible Lisp-style outline of routes.
// Each node has a +/- collapse marker, indents children, highlights active path.
// Bottom: "Locate in document:" input acting as a small search.
// ============================================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface Node {
  label: string;
  href?: string;
  children?: Node[];
  defaultOpen?: boolean;
}

const TREE: Node[] = [
  {
    label: "FEED",
    href: "/",
    defaultOpen: true,
    children: [
      { label: "Daily Edition", href: "/daily" },
      { label: "Pooter Originals", href: "/originals" },
      { label: "Live Pipe", href: "/pipe" },
      { label: "Stumble", href: "/stumble" },
      { label: "Archive", href: "/archive" },
    ],
  },
  {
    label: "MARKETS",
    href: "/markets",
    children: [
      { label: "Predictions", href: "/predictions" },
      { label: "Arb Scanner", href: "/predictions/arb" },
      { label: "Sentiment Index", href: "/sentiment" },
      { label: "Signals", href: "/signals" },
    ],
  },
  {
    label: "EXCHANGE",
    children: [
      { label: "Nouns", href: "/nouns" },
      { label: "Pepe", href: "/pepe" },
      { label: "Music", href: "/music" },
      { label: "Vault", href: "/vault" },
    ],
  },
  {
    label: "AGENTS",
    href: "/bots",
    children: [
      { label: "Registry", href: "/registry" },
      { label: "Discuss", href: "/discuss" },
      { label: "Co-op", href: "/coop" },
    ],
  },
  {
    label: "GOVERNANCE",
    href: "/proposals",
    children: [
      { label: "Proposals", href: "/proposals" },
      { label: "Leaderboard", href: "/leaderboard" },
    ],
  },
  {
    label: "AUTHOR",
    children: [
      { label: "Write", href: "/write" },
      { label: "Subscribe", href: "/subscribe" },
    ],
  },
  {
    label: "APPENDIX",
    children: [
      { label: "Architecture", href: "/architecture" },
      { label: "Appendix", href: "/appendix" },
      { label: "Status", href: "/status" },
      { label: "Style Guide", href: "/style-guide" },
      { label: "Typography", href: "/typography" },
      { label: "ZK Recovery", href: "/zk-recovery" },
    ],
  },
];

export function DocumentExaminer() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const n of TREE) init[n.label] = !!n.defaultOpen;
    return init;
  });

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // Merge manual toggles with auto-open of any group containing the active route.
  const computedOpen = useMemo(() => {
    const out: Record<string, boolean> = { ...openMap };
    for (const n of TREE) {
      if (n.children?.some((c) => isActive(c.href))) out[n.label] = true;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, openMap]);

  function locate(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // direct route match
    const all = TREE.flatMap((n) => [n, ...(n.children ?? [])]);
    const hit = all.find(
      (n) =>
        n.href &&
        (n.label.toLowerCase() === q.toLowerCase() ||
          n.label.toLowerCase().includes(q.toLowerCase())),
    );
    if (hit?.href) {
      router.push(hit.href);
      setQuery("");
      return;
    }
    router.push(`/?q=${encodeURIComponent(q)}`);
    setQuery("");
  }

  return (
    <nav className="examiner" aria-label="Document Examiner">
      <div className="mb-2 border-b border-[var(--rule)] pb-2">
        <div className="label-sm tracking-[0.22em] text-[var(--ink)]">
          DOCUMENT EXAMINER
        </div>
        <div className="mt-0.5 text-[10px] italic text-[var(--ink-faint)]">
          (pooter.world :outline)
        </div>
      </div>

      <ul className="space-y-0">
        {TREE.map((node) => (
          <li key={node.label}>
            <ExaminerRow
              node={node}
              open={computedOpen[node.label] ?? false}
              onToggle={() =>
                setOpenMap((m) => ({ ...m, [node.label]: !(computedOpen[node.label] ?? false) }))
              }
              isActive={isActive}
              depth={0}
            />
          </li>
        ))}
      </ul>

      <form
        onSubmit={locate}
        className="mt-3 border-t border-[var(--rule)] pt-2"
        role="search"
      >
        <label
          htmlFor="examiner-locate"
          className="block label-sm text-[var(--ink-faint)]"
        >
          LOCATE IN DOCUMENT:
        </label>
        <input
          id="examiner-locate"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search..."
          className="mt-1 w-full border border-[var(--rule)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink)] placeholder-[var(--ink-faint)] focus:outline-none focus:bg-[var(--paper-tint)]"
        />
      </form>

      <div className="dither-diag mt-3 h-4 border border-[var(--rule)]" aria-hidden />
      <p className="mt-2 text-[10px] italic leading-[1.35] text-[var(--ink-faint)]">
        A permissionless news network. Filed via the morality network.
      </p>
    </nav>
  );
}

function ExaminerRow({
  node,
  open,
  onToggle,
  isActive,
  depth,
}: {
  node: Node;
  open: boolean;
  onToggle: () => void;
  isActive: (href?: string) => boolean;
  depth: number;
}) {
  const hasChildren = !!node.children?.length;
  const active = isActive(node.href);

  const indent = { paddingLeft: `${depth * 12}px` } as React.CSSProperties;

  return (
    <>
      <div className="examiner-row" data-active={active} style={indent}>
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            className="examiner-marker"
            aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
          >
            {open ? "-" : "+"}
          </button>
        ) : (
          <span className="examiner-marker" aria-hidden>
            &middot;
          </span>
        )}
        {node.href ? (
          <Link
            href={node.href}
            className="examiner-label hover:underline"
          >
            {node.label}
          </Link>
        ) : (
          <span className="examiner-label font-bold">{node.label}</span>
        )}
      </div>
      {hasChildren && open && (
        <ul className="space-y-0">
          {node.children!.map((child) => (
            <li key={`${node.label}>${child.label}`}>
              <ExaminerRow
                node={child}
                open={false}
                onToggle={() => undefined}
                isActive={isActive}
                depth={depth + 1}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
