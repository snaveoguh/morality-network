import { BRAND_DOMAIN, BRAND_NAME, withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Appendix"),
  description: `Smart contract registry, API endpoints, and technical reference for ${BRAND_NAME}.`,
};

// ── Contract Data ────────────────────────────────────────────────────────────

interface ContractEntry {
  name: string;
  address: string;
  type: string;
  explorer: "base" | "eth";
}

const BASE_CONTRACTS: ContractEntry[] = [
  { name: "MoralityRegistry", address: "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608", type: "UUPS Proxy", explorer: "base" },
  { name: "MoralityRatings", address: "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405", type: "UUPS Proxy", explorer: "base" },
  { name: "MoralityComments", address: "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b", type: "UUPS Proxy", explorer: "base" },
  { name: "MoralityTipping", address: "0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B", type: "UUPS Proxy", explorer: "base" },
  { name: "MoralityLeaderboard", address: "0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6", type: "UUPS Proxy", explorer: "base" },
  { name: "MoralityAgentVault", address: "0x4B48d35E019129bb5a16920ADC4Cb7F445ec8cA5", type: "UUPS Proxy", explorer: "base" },
  { name: "PooterEditions", address: "0x06d7c7d70c685d58686FF6E0b0DB388209fCCC6e", type: "UUPS Proxy · ERC-721", explorer: "base" },
  { name: "PooterAuctions", address: "0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f", type: "Immutable", explorer: "base" },
  { name: "MO Token", address: "0x8729c70061739140ee6bE00A3875Cbf6d09A746C", type: "ERC-20", explorer: "base" },
  { name: "MoralityProposalVoting", address: "pending deploy", type: "UUPS Proxy", explorer: "base" },
];

const ETH_CONTRACTS: ContractEntry[] = [
  { name: "MoralityPredictionMarket", address: "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608", type: "UUPS Proxy", explorer: "eth" },
];

const NOUNS_CONTRACTS: ContractEntry[] = [
  { name: "Nouns Token", address: "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03", type: "ERC-721", explorer: "eth" },
  { name: "Nouns Governor V4", address: "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d", type: "Governor Bravo", explorer: "eth" },
  { name: "Nouns Treasury", address: "0x0BC3807Ec262cB779b38D65b38158acC3bfedE10", type: "Executor / Timelock", explorer: "eth" },
  { name: "Nouns Auction House", address: "0x830BD73E4184ceF73443C15111a1DF14e495C706", type: "Proxy", explorer: "eth" },
  { name: "Nouns Descriptor", address: "0x0Cfdb3Ba1694c2bb2CFACB0339ad7b1Ae5932B63", type: "SVG Renderer", explorer: "eth" },
  { name: "Lil Nouns Governor", address: "0x5d2C31ce16924C2a71D317e5BbFd5ce387854039", type: "Governor Bravo", explorer: "eth" },
];

const LEGACY_CONTRACTS = [
  "MoralityToken",
  "MoralityContentStorage",
  "MoralityCrowdsale",
  "MoralityIndexer",
  "TimeLockedFunds",
  "moralityAssets",
];

// ── API Endpoint Data ────────────────────────────────────────────────────────

interface ApiEntry {
  method: string;
  path: string;
  description: string;
  auth: "PUBLIC" | "AUTH";
}

const API_ENDPOINTS: { category: string; endpoints: ApiEntry[] }[] = [
  {
    category: "Feed & Content",
    endpoints: [
      { method: "GET", path: "/api/feed", description: "Aggregated RSS feed", auth: "PUBLIC" },
      { method: "GET", path: "/api/feed/sources", description: "Feed source list", auth: "PUBLIC" },
      { method: "GET", path: "/api/stumble", description: "Random article", auth: "PUBLIC" },
      { method: "GET", path: "/api/search", description: "Full-text search", auth: "PUBLIC" },
      { method: "GET", path: "/api/newsroom", description: "Newsroom data", auth: "AUTH" },
      { method: "GET", path: "/api/health/sources", description: "Feed health check", auth: "PUBLIC" },
    ],
  },
  {
    category: "Markets & Sentiment",
    endpoints: [
      { method: "GET", path: "/api/markets", description: "Crypto market data", auth: "PUBLIC" },
      { method: "GET", path: "/api/sentiment", description: "Sentiment metrics", auth: "PUBLIC" },
      { method: "GET", path: "/api/sentiment/history", description: "Sentiment history", auth: "PUBLIC" },
    ],
  },
  {
    category: "Governance",
    endpoints: [
      { method: "GET", path: "/api/governance", description: "Nouns/Lil Nouns proposals", auth: "PUBLIC" },
      { method: "GET", path: "/api/governance/[id]", description: "Single proposal detail", auth: "PUBLIC" },
      { method: "GET", path: "/api/v1/governance/live", description: "Live governance feed", auth: "PUBLIC" },
      { method: "POST", path: "/api/proposals/ops", description: "Proposal operations", auth: "AUTH" },
    ],
  },
  {
    category: "Predictions",
    endpoints: [
      { method: "GET", path: "/api/predictions/ops", description: "Operator dashboard", auth: "AUTH" },
    ],
  },
  {
    category: "Discussion",
    endpoints: [
      { method: "GET", path: "/api/discuss/stream", description: "Discussion streaming", auth: "PUBLIC" },
      { method: "POST", path: "/api/discuss/stream", description: "Post discussion", auth: "AUTH" },
    ],
  },
  {
    category: "AI & Scoring",
    endpoints: [
      { method: "POST", path: "/api/ai/score", description: "AI scoring", auth: "AUTH" },
      { method: "POST", path: "/api/editorial/mark-onchain", description: "Mark editorial content", auth: "AUTH" },
      { method: "POST", path: "/api/editorial/pregenerate", description: "Pre-generate content", auth: "AUTH" },
      { method: "GET", path: "/api/evidence/verify", description: "Verify evidence", auth: "AUTH" },
      { method: "GET", path: "/api/deliberation/schema", description: "Deliberation schema", auth: "PUBLIC" },
      { method: "GET", path: "/api/analysts/reputation", description: "Analyst reputation", auth: "PUBLIC" },
      { method: "GET", path: "/api/analysts/interpretations", description: "Analyst interpretations", auth: "PUBLIC" },
    ],
  },
  {
    category: "Trading",
    endpoints: [
      { method: "GET", path: "/api/trading/signals", description: "Trading signals", auth: "PUBLIC" },
      { method: "POST", path: "/api/trading/execute", description: "Execute trades", auth: "AUTH" },
      { method: "GET", path: "/api/trading/metrics", description: "Trading metrics", auth: "PUBLIC" },
      { method: "GET", path: "/api/trading/positions", description: "Trading positions", auth: "AUTH" },
      { method: "GET", path: "/api/trading/readiness", description: "Trading readiness", auth: "AUTH" },
      { method: "GET", path: "/api/trading/candles", description: "OHLCV candlestick data", auth: "PUBLIC" },
      { method: "GET", path: "/api/trading/indicators", description: "Technical indicators (RSI, MACD)", auth: "PUBLIC" },
      { method: "GET", path: "/api/trading/journal", description: "Trade execution journal", auth: "AUTH" },
      { method: "GET", path: "/api/trading/performance", description: "Portfolio performance metrics", auth: "AUTH" },
      { method: "GET", path: "/api/trading/learning", description: "Self-learning report", auth: "AUTH" },
    ],
  },
  {
    category: "Agents",
    endpoints: [
      { method: "GET", path: "/api/agents", description: "Agent list", auth: "AUTH" },
      { method: "POST", path: "/api/agents", description: "Create agent", auth: "AUTH" },
      { method: "GET", path: "/api/agents/scanner", description: "Token scanner", auth: "PUBLIC" },
      { method: "GET", path: "/api/agents/scanner/[token]", description: "Specific token analysis", auth: "PUBLIC" },
      { method: "GET", path: "/api/agents/bus", description: "Agent message bus", auth: "AUTH" },
      { method: "POST", path: "/api/agents/bus/relay", description: "Message relay", auth: "AUTH" },
      { method: "GET", path: "/api/agents/coordinator", description: "Agent coordination", auth: "AUTH" },
      { method: "GET", path: "/api/agents/console", description: "Agent console", auth: "AUTH" },
      { method: "GET", path: "/api/agents/events/stream", description: "Agent events (SSE)", auth: "AUTH" },
      { method: "POST", path: "/api/agents/memory/learn", description: "Learning endpoint", auth: "AUTH" },
      { method: "POST", path: "/api/agents/memory/self-learn", description: "Self-learning", auth: "AUTH" },
      { method: "GET", path: "/api/agents/memory/stats", description: "Memory stats", auth: "AUTH" },
      { method: "GET", path: "/api/agents/memory/debug", description: "Memory debug", auth: "AUTH" },
      { method: "GET", path: "/api/agents/swarm", description: "Research swarm output", auth: "AUTH" },
    ],
  },
  {
    category: "Auth (SIWE)",
    endpoints: [
      { method: "POST", path: "/api/auth/nonce", description: "Generate SIWE nonce", auth: "PUBLIC" },
      { method: "POST", path: "/api/auth/verify", description: "Verify SIWE signature", auth: "PUBLIC" },
      { method: "GET", path: "/api/auth/session", description: "Session status", auth: "PUBLIC" },
    ],
  },
  {
    category: "Pepe",
    endpoints: [
      { method: "GET", path: "/api/pepe/[asset]", description: "Asset detail", auth: "PUBLIC" },
      { method: "GET", path: "/api/pepe/listings", description: "Pepe listings", auth: "PUBLIC" },
      { method: "GET", path: "/api/pepe/img/[asset]", description: "Pepe image proxy", auth: "PUBLIC" },
    ],
  },
  {
    category: "Editions & Auctions",
    endpoints: [
      { method: "GET", path: "/api/edition/[tokenId]", description: "Edition / community-claim metadata", auth: "PUBLIC" },
      { method: "GET", path: "/api/edition/[tokenId]/image", description: "Edition / community-claim image", auth: "PUBLIC" },
      { method: "GET", path: "/api/daily-edition", description: "Daily edition", auth: "PUBLIC" },
    ],
  },
  {
    category: "Terminal & Music",
    endpoints: [
      { method: "POST", path: "/api/terminal/chat", description: "Terminal chat (AI)", auth: "AUTH" },
      { method: "GET", path: "/api/terminal/subscription/status", description: "Subscription status", auth: "PUBLIC" },
      { method: "POST", path: "/api/terminal/risk", description: "Risk assessment", auth: "AUTH" },
      { method: "GET", path: "/api/music/discover", description: "Music discovery", auth: "PUBLIC" },
    ],
  },
  {
    category: "Protocol",
    endpoints: [
      { method: "GET", path: "/api/protocol-wire", description: "Protocol wire", auth: "PUBLIC" },
      { method: "POST", path: "/api/protocol-wire", description: "Submit to wire", auth: "AUTH" },
    ],
  },
  {
    category: "Moral Compass",
    endpoints: [
      { method: "GET", path: "/api/moral-compass/crawl", description: "Ethics/philosophy crawl (cron)", auth: "AUTH" },
      { method: "GET", path: "/api/moral-compass/status", description: "Compass stats & context", auth: "PUBLIC" },
    ],
  },
  {
    category: "Moral Commentary",
    endpoints: [
      { method: "GET", path: "/api/moral-commentary/generate", description: "Daily moral commentary (cron)", auth: "AUTH" },
    ],
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

function explorerUrl(address: string, explorer: "base" | "eth"): string {
  return explorer === "base"
    ? `https://basescan.org/address/${address}`
    : `https://etherscan.io/address/${address}`;
}

function shortAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function AppendixPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Masthead */}
      <div className="mb-8 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-masthead text-4xl text-[var(--ink)] sm:text-5xl">
          Appendix
        </h1>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          Smart contract registry, API surface, and technical reference for {BRAND_NAME}.
          All contracts are verified and open-source.
        </p>
        <div className="mt-3 flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <span>Solidity 0.8.24</span>
          <span>&middot;</span>
          <span>Base L2 + Ethereum L1</span>
          <span>&middot;</span>
          <span>UUPS Upgradeable</span>
        </div>
      </div>

      {/* ══════════════ BASE MAINNET ══════════════ */}
      <Section title="I. Smart Contracts &mdash; Base Mainnet">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Core protocol contracts on Base (chain ID 8453). All upgradeable contracts use the
          ERC-1967 UUPS proxy pattern. The editions stack supports open, community-authored
          historical claims alongside the main pooter archive.
        </p>
        <ContractTable contracts={BASE_CONTRACTS} />
      </Section>

      {/* ══════════════ ETHEREUM MAINNET ══════════════ */}
      <Section title="II. Smart Contracts &mdash; Ethereum Mainnet">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Prediction market lives on Ethereum L1 for trustless resolution via
          native <code className="bg-[var(--paper-dark)] px-1 font-mono text-[10px]">governor.state()</code> calls.
          Markets auto-open on first stake; cancelled proposals resolve to VOID (full refund).
        </p>
        <ContractTable contracts={ETH_CONTRACTS} />
      </Section>

      {/* ══════════════ NOUNS ECOSYSTEM ══════════════ */}
      <Section title="III. Nouns Ecosystem &mdash; Ethereum Mainnet">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          External Nouns DAO contracts referenced by the prediction market and governance modules.
          These are not owned by {BRAND_NAME} &mdash; they are read-only integrations.
        </p>
        <ContractTable contracts={NOUNS_CONTRACTS} />
      </Section>

      {/* ══════════════ LEGACY ══════════════ */}
      <Section title="IV. Legacy Contracts (Deprecated)">
        <p className="mb-3 font-body-serif text-sm text-[var(--ink-light)]">
          Solidity 0.5.x contracts from the original morality.network prototype. Not deployed
          on any current network. Preserved in <code className="bg-[var(--paper-dark)] px-1 font-mono text-[10px]">morality.network.contracts-master/</code> for
          historical reference.
        </p>
        <div className="flex flex-wrap gap-2">
          {LEGACY_CONTRACTS.map((name) => (
            <span
              key={name}
              className="border border-[var(--rule-light)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]"
            >
              {name}
            </span>
          ))}
        </div>
      </Section>

      {/* ══════════════ API ENDPOINTS ══════════════ */}
      <Section title="V. API Endpoints">
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Next.js API routes. <span className="font-mono text-[10px] font-bold text-[var(--ink)]">PUBLIC</span> endpoints
          require no authentication. <span className="font-mono text-[10px] font-bold text-[var(--ink)]">AUTH</span> endpoints
          require a valid SIWE session (Sign-In with Ethereum).
        </p>
        <div className="space-y-6">
          {API_ENDPOINTS.map((group) => (
            <div key={group.category}>
              <h4 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
                {group.category}
              </h4>
              <div className="border border-[var(--rule-light)]">
                {group.endpoints.map((ep, i) => (
                  <div
                    key={`${ep.method}-${ep.path}`}
                    className={`flex items-baseline gap-3 px-3 py-1.5 font-mono text-[9px] ${
                      i > 0 ? "border-t border-[var(--rule-light)]" : ""
                    }`}
                  >
                    <span
                      className={`w-8 shrink-0 font-bold ${
                        ep.method === "POST" ? "text-[var(--accent-red)]" : "text-[var(--ink)]"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[var(--ink-light)]">
                      {ep.path}
                    </span>
                    <span className="hidden shrink-0 text-[var(--ink-faint)] sm:inline">
                      {ep.description}
                    </span>
                    <span
                      className={`shrink-0 border px-1.5 py-0.5 text-[7px] uppercase tracking-wider ${
                        ep.auth === "AUTH"
                          ? "border-[var(--accent-red)] text-[var(--accent-red)]"
                          : "border-[var(--rule-light)] text-[var(--ink-faint)]"
                      }`}
                    >
                      {ep.auth}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════ COLOPHON ══════════════ */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <div className="h-px bg-[var(--rule)] mb-1" />
        <div className="h-[2px] bg-[var(--rule)] mb-3" />
        <p className="font-mono text-[7px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_DOMAIN} &bull; permissionless &bull; onchain &bull; base l2 + ethereum l1
        </p>
      </footer>
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 border-b-2 border-[var(--rule)] pb-2">
        <h2
          className="font-headline text-xl text-[var(--ink)]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
      </div>
      {children}
    </section>
  );
}

function ContractTable({ contracts }: { contracts: ContractEntry[] }) {
  return (
    <div className="overflow-x-auto border border-[var(--rule-light)]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--rule)] bg-[var(--paper-dark)]">
            <th className="px-3 py-1.5 text-left font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink)]">
              Contract
            </th>
            <th className="px-3 py-1.5 text-left font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink)]">
              Address
            </th>
            <th className="hidden px-3 py-1.5 text-left font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--ink)] sm:table-cell">
              Type
            </th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c, i) => (
            <tr
              key={c.address + c.name}
              className={i > 0 ? "border-t border-[var(--rule-light)]" : ""}
            >
              <td className="px-3 py-1.5 font-mono text-[9px] font-bold text-[var(--ink)]">
                {c.name}
              </td>
              <td className="px-3 py-1.5 font-mono text-[9px]">
                {c.address.startsWith("0x") ? (
                  <a
                    href={explorerUrl(c.address, c.explorer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ink-light)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
                    title={c.address}
                  >
                    <span className="hidden sm:inline">{c.address}</span>
                    <span className="sm:hidden">{shortAddr(c.address)}</span>
                  </a>
                ) : (
                  <span className="italic text-[var(--ink-faint)]">{c.address}</span>
                )}
              </td>
              <td className="hidden px-3 py-1.5 font-mono text-[8px] text-[var(--ink-faint)] sm:table-cell">
                {c.type}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
