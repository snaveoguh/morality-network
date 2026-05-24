"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

const STORAGE_KEY = "pw-examiner-open";

export function DocumentExaminer() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [windowOpen, setWindowOpen] = useState(true);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const n of TREE) init[n.label] = !!n.defaultOpen;
    return init;
  });

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "closed") setWindowOpen(false);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem(STORAGE_KEY, windowOpen ? "open" : "closed");
  }, [windowOpen, mounted]);

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

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

  if (!mounted) return null;

  if (!windowOpen) {
    return (
      <button
        type="button"
        onClick={() => setWindowOpen(true)}
        className="examiner-restore hover-morph-medium"
        aria-label="Open Document Examiner"
      >
        ≡ examiner
      </button>
    );
  }

  return (
    <aside className="examiner-window" aria-label="Document Examiner">
      <div className="examiner-titlebar">
        <span className="examiner-titlebar-text hover-morph-subtle">
          DOCUMENT EXAMINER
        </span>
        <button
          type="button"
          onClick={() => setWindowOpen(false)}
          className="examiner-close"
          aria-label="Close Document Examiner"
        >
          ×
        </button>
      </div>

      <div className="examiner-body">
        <div className="examiner-subtitle">(pooter.world :outline)</div>

        <ul className="examiner-tree">
          {TREE.map((node) => (
            <li key={node.label}>
              <ExaminerRow
                node={node}
                open={computedOpen[node.label] ?? false}
                onToggle={() =>
                  setOpenMap((m) => ({
                    ...m,
                    [node.label]: !(computedOpen[node.label] ?? false),
                  }))
                }
                isActive={isActive}
                depth={0}
              />
            </li>
          ))}
        </ul>

        <form onSubmit={locate} className="examiner-locate" role="search">
          <label htmlFor="examiner-locate" className="examiner-locate-label">
            LOCATE IN DOCUMENT:
          </label>
          <input
            id="examiner-locate"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search..."
            className="examiner-locate-input"
          />
        </form>
      </div>
    </aside>
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
            {open ? "−" : "+"}
          </button>
        ) : (
          <span className="examiner-marker" aria-hidden>
            ·
          </span>
        )}
        {node.href ? (
          <Link
            href={node.href}
            className="examiner-label hover-morph-medium"
            aria-current={active ? "page" : undefined}
          >
            {node.label}
          </Link>
        ) : (
          <span className="examiner-label examiner-label-group">{node.label}</span>
        )}
      </div>
      {hasChildren && open && (
        <ul className="examiner-tree">
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
