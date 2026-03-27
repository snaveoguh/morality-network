import { BRAND_DOMAIN, BRAND_NAME, withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Architecture"),
  description: `Full system architecture — EVM contracts, Solana programs, ZK circuits, trading engine, mobile app, browser extension, autonomous agents, and more.`,
};

/* ── Data ──────────────────────────────────────────────────────────────────── */

interface Layer {
  id: string;
  title: string;
  subtitle: string;
  items: { name: string; detail: string; tag?: string }[];
}

const LAYERS: Layer[] = [
  {
    id: "smart-contracts",
    title: "I. Smart Contracts — Solidity 0.8.24",
    subtitle:
      "26 contracts across Base L2, Ethereum mainnet, and Arbitrum. All upgradeable via ERC-1967 UUPS proxy pattern.",
    items: [
      { name: "MoralityRegistry", detail: "Universal entity registration — URL, DOMAIN, ADDRESS, CONTRACT get keccak256 hash", tag: "Base" },
      { name: "MoralityRatings", detail: "1-5 star onchain ratings with per-user vote tracking and averages", tag: "Base" },
      { name: "MoralityComments", detail: "Threaded comments with upvote/downvote mechanics", tag: "Base" },
      { name: "MoralityTipping", detail: "ETH tipping with escrow for unclaimed entities", tag: "Base" },
      { name: "MoralityLeaderboard", detail: "Composite scoring: 40% onchain + 30% AI + 20% tips + 10% engagement", tag: "Base" },
      { name: "MoralityAgentVault", detail: "Shared vault for AI agent strategy allocation with circuit breaker", tag: "Base" },
      { name: "MoralityPredictionMarket", detail: "Binary prediction markets — auto-open on first stake, cross-chain resolution", tag: "ETH" },
      { name: "MoralityProposalVoting", detail: "Quorum-based governance voting with Nouns integration", tag: "Base" },
      { name: "PooterEditions", detail: "Daily community NFT editions — ERC-721 with mintable cover art + metadata", tag: "Base" },
      { name: "PooterAuctions", detail: "Auction system for edition minting", tag: "Base" },
      { name: "MO Token", detail: "Native ERC-20 governance and utility token", tag: "Base" },
      { name: "BaseCapitalVault", detail: "ETH entry point — NAV delta bounds (10%), deposit cap, WETH-only redemptions", tag: "Vault Rail" },
      { name: "WithdrawalQueue", detail: "Queued WETH redemptions with reentrancy guard", tag: "Vault Rail" },
      { name: "MorphoReserveAllocator", detail: "Morpho integration for yield generation", tag: "Vault Rail" },
      { name: "BridgeRouter", detail: "Bridge execution to Arbitrum — 95% minimum return slippage protection", tag: "Vault Rail" },
      { name: "NavReporter", detail: "Daily NAV reconciliation — bounded strategy/fee deltas (10% max)", tag: "Vault Rail" },
      { name: "ExecutorAssetConverter", detail: "WETH ↔ USDC conversion layer", tag: "Vault Rail" },
      { name: "ExecutorBridgeAdapter", detail: "Bridge execution adapter", tag: "Vault Rail" },
      { name: "ArbTransitEscrow", detail: "Route-scoped balance escrow during cross-chain bridging", tag: "Arbitrum" },
      { name: "HLStrategyManager", detail: "Hyperliquid perp deployment with allocation caps", tag: "Arbitrum" },
      { name: "ZKRecovery", detail: "Groth16 verifier for zero-knowledge password recovery — cross-chain Base + Solana", tag: "ZK" },
      { name: "Groth16Verifier", detail: "Generated Groth16 verifier contract (circuit proof validation)", tag: "ZK" },
      { name: "DevUSDC", detail: "Test USDC token for testnet environments", tag: "Test" },
      { name: "DevReserveVault", detail: "Test ERC-4626 vault", tag: "Test" },
    ],
  },
  {
    id: "solana",
    title: "II. Solana Programs — Anchor",
    subtitle:
      "Full protocol replication on Solana via Anchor framework. Mirrors all Base L2 functionality with Solana-native PDA patterns.",
    items: [
      { name: "Registry", detail: "initialize, register_entity, approve_ownership_claim, claim_ownership, set_canonical_claim" },
      { name: "Ratings", detail: "rate, rate_with_reason — up to 500-character justifications" },
      { name: "Comments", detail: "post_comment (threaded, max 2000 chars), vote_comment (±1)" },
      { name: "Tipping", detail: "tip_entity, tip_comment, withdraw_tips, claim_escrow" },
      { name: "Leaderboard", detail: "update_ai_score (5-min cooldown), set_ai_oracle" },
      { name: "ZK Recovery", detail: "register_zk_commitment, initiate/execute/cancel recovery, revoke commitment — 24hr timelock + exponential backoff" },
    ],
  },
  {
    id: "zk",
    title: "III. Zero-Knowledge Cryptography",
    subtitle:
      "Circom 2.1.6 circuits for self-custody wallet recovery. First cross-chain ZK password recovery for EVM (Base) + Solana on shared BN254 curve.",
    items: [
      { name: "password_recover.circom", detail: "~241 constraints — Poseidon(password, salt) commitment stored onchain, proof binds to newAddress + chainId + nonce (anti-replay)" },
      { name: "Groth16 Proving", detail: "<3 seconds on modern mobile (iPhone 12+, modern Android). Compact proof size for on-chain verification" },
      { name: "Security Model", detail: "Password never leaves device. Commitment stored onchain. Proof verifies knowledge without revelation. Cross-chain portability via BN254" },
    ],
  },
  {
    id: "web",
    title: "IV. Web Application — Next.js 16",
    subtitle:
      "32 page routes, 78 API endpoints, 700+ React components. E-ink newspaper aesthetic with 6-column grid, Playfair Display headlines, Libre Baskerville body text.",
    items: [
      { name: "Feed", detail: "Aggregated RSS from 50+ sources with AI-scored sentiment and editorial synthesis" },
      { name: "Stumble", detail: "Random article discovery — infinite scroll, server-side pre-fetch" },
      { name: "Markets", detail: "Crypto market dashboard — CoinGecko, DexScreener, live ticker" },
      { name: "Signals", detail: "Real-time composite trading signals — technical, pattern, news, market, council vote" },
      { name: "Morality Index", detail: "Global sentiment scoring — Fear & Greed metrics with topic breakdown and moral axes" },
      { name: "Archive", detail: "AI editorial archive — DALL-E illustrated daily editions with market impact analysis" },
      { name: "Governance", detail: "Nouns DAO + Lil Nouns proposal viewer with quorum tracking and vote delegation" },
      { name: "Predictions", detail: "Binary outcome markets on entity/proposal reputation" },
      { name: "Pepe / Nouns", detail: "Collectible directories — metadata, auction integration, gallery views" },
      { name: "Music", detail: "Last.fm-powered curation — artist reputation scoring, genre filtering, discovery" },
      { name: "Discuss", detail: "Threaded discussion rooms — streaming, moderation, onchain comments" },
      { name: "Leaderboard", detail: "Universal Ledger — domain/address/contract rankings with composite reputation" },
      { name: "Vault", detail: "Capital management UI — deposit, bridge, strategy allocation, withdrawal queue" },
      { name: "Agents Console", detail: "Real-time agent monitoring — positions, P&L, trade journal, swarm status" },
      { name: "Write", detail: "Article publisher — S3 upload, content authoring, editorial workflow" },
      { name: "ZK Recovery", detail: "Passwordless wallet recovery onboarding — generate proof in-browser, submit to contract" },
      { name: "Terminal", detail: "AI chat terminal — holder-gated, risk assessment, research assistant" },
    ],
  },
  {
    id: "trading",
    title: "V. Trading Engine — 9,300+ LOC",
    subtitle:
      "Autonomous multi-source signal aggregation → HyperLiquid perpetual execution with Kelly Criterion position sizing, moral gates, and circuit breakers.",
    items: [
      { name: "Composite Signal Pipeline", detail: "Technical indicators (RSI, MACD, Bollinger), pattern detection (Cup-and-Handle, etc.), news sentiment, market momentum, council vote" },
      { name: "Council Signal", detail: "7+ independent signals vote on direction — majority consensus required before execution" },
      { name: "Kelly Criterion Sizing", detail: "Fractional Kelly for position sizing — mathematically optimal bet sizing based on edge and bankroll" },
      { name: "Moral Gate", detail: "Ethical filter — refuses to trade on articles about humanitarian crises, sanctions, etc." },
      { name: "Circuit Breaker", detail: "3 consecutive losses triggers automatic pause — human override required to resume" },
      { name: "HyperLiquid L1", detail: "Perpetual futures execution — REST API client, deposit/withdraw, position management" },
      { name: "Vault Rail", detail: "Capital flow pipeline: Base deposit → Bridge → Morpho yield → HyperLiquid perps" },
      { name: "Self-Learning", detail: "Agent learns from trade outcomes — adjusts signal weights based on P&L feedback loop" },
      { name: "Trade Journal", detail: "Complete execution log with entry/exit reasons, timestamps, P&L attribution" },
      { name: "Risk Advisory", detail: "Pre-trade safety checks — max position size, correlation limits, drawdown thresholds" },
    ],
  },
  {
    id: "agents",
    title: "VI. Autonomous Agent Swarm",
    subtitle:
      "7 specialized agents coordinating via message bus with persistent memory, self-learning, and ethical guardrails.",
    items: [
      { name: "Trader Agent", detail: "Executes trading cycles, publishes signals, manages positions on HyperLiquid" },
      { name: "Newsroom Agent", detail: "Synthesizes RSS feeds into actionable intelligence — polls indexer, LLM synthesis" },
      { name: "Scanner Agent", detail: "Detects hot tokens, new pairs, unusual volume — real-time market surveillance" },
      { name: "Scalper Agent", detail: "Sub-minute trading strategies — high-frequency signal processing" },
      { name: "NounIRL Agent", detail: "Settles Nouns auctions when target traits appear — predicts from NounsSeeder algorithm" },
      { name: "Coordinator Agent", detail: "Orchestrates message bus — routes messages between agents, manages lifecycle" },
      { name: "Swarm Agent", detail: "Multi-agent orchestration — task decomposition, parallel execution, result aggregation" },
      { name: "Agent Memory", detail: "Persistent knowledge base — learn from URLs, recall context, forget outdated knowledge" },
      { name: "Agent Soul", detail: "Personality framework — POOTER_SOUL_V1 with MORALITY_AXES for ethical decision-making" },
      { name: "Message Bus", detail: "Pub/sub inter-agent communication — typed messages, event streaming via SSE" },
    ],
  },
  {
    id: "editions",
    title: "VII. Daily Community NFT Editions",
    subtitle:
      "AI-generated editorial + DALL-E 3 cover art minted as ERC-721 on Base. One edition per day, every day.",
    items: [
      { name: "Editorial Engine", detail: "RSS crawl → LLM synthesis → sentiment extraction → market impact analysis → structured editorial" },
      { name: "DALL-E 3 Illustrations", detail: "Market-aware prompts generate cover art reflecting daily sentiment and key stories" },
      { name: "On-Chain Metadata", detail: "Token URI resolves to edition JSON — title, body, illustration, sentiment scores, source attribution" },
      { name: "Auction Mechanism", detail: "PooterAuctions contract — bid, settle, claim. Revenue flows to protocol treasury" },
      { name: "Community Claims", detail: "Open historical editions — community members can author and mint their own interpretations" },
      { name: "Cron Pipeline", detail: "3 AM: moral compass crawl → 4 AM: moral commentary → 5 AM: editorial pre-generation → 5:30 AM: daily edition → 5:45 AM: illustration" },
    ],
  },
  {
    id: "mobile",
    title: "VIII. Mobile Application — React Native",
    subtitle:
      "Expo 55 + React Native 0.83 with Expo Router. Native iOS and Android with biometric auth and secure key storage.",
    items: [
      { name: "Feed", detail: "Article browsing from Pooter feed — pull-to-refresh, infinite scroll" },
      { name: "In-App Browser", detail: "WebView-based article reader with entity overlay" },
      { name: "Wallet", detail: "Balance, send/receive, cross-chain bridge via LiFi SDK" },
      { name: "ZK Recovery", detail: "Password recovery interface — generate Groth16 proofs on-device" },
      { name: "Onboarding", detail: "Wallet setup flow — BIP39/BIP32 seed generation, secure storage" },
      { name: "Security", detail: "Expo SecureStore for keys, biometric auth (Face ID / fingerprint), no seed phrase logging" },
      { name: "Multi-Chain", detail: "viem for EVM (Base L2), @solana/web3.js for Solana — unified wallet experience" },
    ],
  },
  {
    id: "extension",
    title: "IX. Browser Extension — Manifest V3",
    subtitle:
      "Real-time bias and credibility overlay for any webpage. Injects entity scores, ratings, and tipping directly into news sites, Twitter, and blogs.",
    items: [
      { name: "Content Scripts", detail: "DOM mutation observer detects news content, injects bias overlay, tooltips, and entity profiles inline" },
      { name: "NLP Engine", detail: "Named entity extraction via compromise.js — identifies people, orgs, domains in page text" },
      { name: "Bias Overlay", detail: "Visual credibility indicator — composite score rendered as newspaper-style badge on detected entities" },
      { name: "Side Panel", detail: "Full entity profile panel — ratings, comments, tips, score breakdown, claim verification" },
      { name: "Popup", detail: "Quick entity lookup, wallet integration, settings" },
      { name: "Background Worker", detail: "Service worker — event routing, wallet handler, RPC relay, data cache" },
      { name: "Onchain Queries", detail: "viem-powered contract reads — ratings, scores, tips, comments fetched directly from Base L2" },
    ],
  },
  {
    id: "indexer",
    title: "X. Event Indexer — Ponder v0.16",
    subtitle:
      "Real-time event indexing for all Base L2 contracts. GraphQL API serves data as it syncs — partial data available during backfill.",
    items: [
      { name: "8 Tables", detail: "entity, rating, comment, tip, proposal, vote, prediction, edition — fully normalized relational schema" },
      { name: "Event Handlers", detail: "Listeners for all 5 core contracts + editions + vault — upsert pattern for event ordering" },
      { name: "GraphQL API", detail: "Hono-based — plural queries use { items: [...] } wrapper (Ponder v0.12+ convention)" },
      { name: "PostgreSQL", detail: "Railway-hosted with 5GB persistent volume" },
    ],
  },
  {
    id: "sdk",
    title: "XI. TypeScript SDK",
    subtitle:
      "Lightweight SDK for AI agents and third-party integrations. Dual export for Base L2 + Solana.",
    items: [
      { name: "Base L2 Client", detail: "Entity registration, rating, tipping, comment posting via viem" },
      { name: "Solana Client", detail: "Anchor program client — mirrors Base functionality with PDA patterns" },
      { name: "Agent Integration", detail: "Designed for autonomous agents to interact with the protocol programmatically" },
    ],
  },
  {
    id: "freedom-machine",
    title: "XII. The Freedom of Speech Machine",
    subtitle:
      "The core thesis: a permissionless, onchain information layer where every claim is rateable, every rating is transparent, and no entity can be censored or de-platformed.",
    items: [
      { name: "Permissionless Registration", detail: "Anyone can register any URL, domain, address, or contract — no gatekeeping, no approval process" },
      { name: "Transparent Scoring", detail: "Composite reputation is fully auditable: 40% onchain rating + 30% AI + 20% tips + 10% engagement" },
      { name: "Uncensorable Comments", detail: "Onchain threaded discussion — stored on Base L2, immutable, no moderation authority" },
      { name: "Moral Compass", detail: "AI ethics crawl — philosophy sources, moral commentary, structured ethical reasoning applied to news" },
      { name: "SIWE Identity", detail: "Sign-In with Ethereum — wallet-native auth, no email, no password, no platform lock-in" },
      { name: "Cross-Chain Portability", detail: "Same entity hash works on Base, Ethereum, Solana — reputation follows the entity, not the chain" },
    ],
  },
  {
    id: "governance-predictions",
    title: "XIII. Governance & Prediction Pools",
    subtitle:
      "Binary outcome markets on governance proposals. Stake on Pass/Fail, auto-resolve via onchain governor state.",
    items: [
      { name: "Nouns Governor V4", detail: "Full integration — proposal viewing, vote delegation, quorum tracking, timelock execution" },
      { name: "Prediction Markets", detail: "Binary outcome markets — auto-open on first stake, cancelled proposals resolve to VOID (full refund)" },
      { name: "Cross-Chain Resolution", detail: "Markets on Base resolve against Ethereum mainnet governor.state() — trustless, no oracle" },
      { name: "Proposal Voting", detail: "MoralityProposalVoting contract — quorum-based with configurable thresholds" },
    ],
  },
  {
    id: "music",
    title: "XIV. Music Curation",
    subtitle:
      "Artist reputation scoring and discovery powered by Last.fm API and onchain signal aggregation.",
    items: [
      { name: "Discovery Feed", detail: "Genre filtering, trending artists, new releases — curated via Last.fm API" },
      { name: "Artist Reputation", detail: "Composite score — onchain tip volume + entity ratings + community engagement" },
      { name: "Entity Integration", detail: "Artists are entities — rateable, tippable, commentable like any URL or domain" },
    ],
  },
  {
    id: "pooter1",
    title: "XV. Pooter One — Legacy Protocol",
    subtitle:
      "The original morality.network prototype. Solidity 0.5.x contracts + .NET backend + Chrome extension. Preserved for historical reference.",
    items: [
      { name: "MoralityToken", detail: "Original ERC-20 token contract" },
      { name: "MoralityContentStorage", detail: "On-chain content storage (pre-IPFS era)" },
      { name: "MoralityCrowdsale", detail: "Token sale contract" },
      { name: "MoralityIndexer", detail: "Event indexing contract" },
      { name: "TimeLockedFunds", detail: "Vesting / timelock for team tokens" },
      { name: "moralityAssets", detail: "Asset management contract" },
      { name: ".NET Backend", detail: "Original server — C# / ASP.NET Core, now fully replaced by Next.js 16" },
      { name: "Chrome Extension v1", detail: "Original browser extension — now rewritten as MV3 with TypeScript + viem" },
    ],
  },
];

const INFRA_ITEMS = [
  { label: "Railway", detail: "Monorepo deployment — web app, Ponder indexer, Agent Hub, PostgreSQL" },
  { label: "Groq (free tier)", detail: "Llama 3.3 70B for editorial synthesis, scoring, chat — $0/day" },
  { label: "Together.ai", detail: "LLM fallback provider — 8B fast model for lightweight tasks" },
  { label: "OpenAI", detail: "DALL-E 3 for daily edition illustrations" },
  { label: "Upstash Redis", detail: "Trading state, position store, signal cache" },
  { label: "HyperLiquid L1", detail: "Perpetual futures execution — REST API" },
  { label: "CoinGecko / DexScreener", detail: "Market data feeds — prices, volume, liquidity" },
  { label: "Last.fm", detail: "Music metadata and discovery" },
  { label: "Neynar", detail: "Farcaster channel feeds" },
];

const STATS: { label: string; value: string }[] = [
  { label: "Smart Contracts", value: "26" },
  { label: "Solana Instructions", value: "6 modules" },
  { label: "ZK Circuits", value: "1 (Circom)" },
  { label: "Web Routes", value: "32 pages" },
  { label: "API Endpoints", value: "78" },
  { label: "React Components", value: "700+" },
  { label: "Trading Engine LOC", value: "9,300+" },
  { label: "Autonomous Agents", value: "7" },
  { label: "Ponder Tables", value: "8" },
  { label: "Mobile Screens", value: "10+" },
  { label: "Extension Modules", value: "25+" },
  { label: "Chains Supported", value: "4" },
];

const TAG_COLORS: Record<string, string> = {
  Base: "border-[var(--ink)] text-[var(--ink)]",
  ETH: "border-[var(--ink-light)] text-[var(--ink-light)]",
  Arbitrum: "border-[var(--ink-faint)] text-[var(--ink-faint)]",
  "Vault Rail": "border-[var(--accent-red)] text-[var(--accent-red)]",
  ZK: "border-[var(--ink)] text-[var(--ink)] bg-[var(--paper-dark)]",
  Test: "border-[var(--rule-light)] text-[var(--ink-faint)]",
};

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Masthead */}
      <div className="mb-10 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-masthead text-4xl text-[var(--ink)] sm:text-5xl">
          Architecture
        </h1>
        <p className="mt-2 font-body-serif text-sm italic text-[var(--ink-light)]">
          The complete technical anatomy of {BRAND_NAME} &mdash; from zero-knowledge
          circuits to autonomous agent swarms. A permissionless information machine
          built across four blockchains, three runtimes, and every surface a user can touch.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[8px] uppercase tracking-[0.25em] text-[var(--ink-faint)]">
          <span>Base L2</span>
          <span>&middot;</span>
          <span>Ethereum L1</span>
          <span>&middot;</span>
          <span>Arbitrum</span>
          <span>&middot;</span>
          <span>Solana</span>
          <span>&middot;</span>
          <span>Circom / Groth16</span>
          <span>&middot;</span>
          <span>Next.js 16</span>
          <span>&middot;</span>
          <span>React Native</span>
          <span>&middot;</span>
          <span>Manifest V3</span>
        </div>
      </div>

      {/* Stats Banner */}
      <div className="mb-10 border border-[var(--rule)] bg-[var(--paper-dark)] p-4">
        <div className="mb-3 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          System at a Glance
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-4 md:grid-cols-6">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="font-headline text-lg text-[var(--ink)]">{s.value}</div>
              <div className="font-mono text-[7px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table of Contents */}
      <div className="mb-10 border border-[var(--rule-light)] p-4">
        <div className="mb-2 font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
          Contents
        </div>
        <div className="columns-2 gap-6 sm:columns-3">
          {LAYERS.map((layer) => (
            <a
              key={layer.id}
              href={`#${layer.id}`}
              className="mb-1 block font-mono text-[9px] text-[var(--ink-light)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
            >
              {layer.title.replace(/&mdash;/g, "—")}
            </a>
          ))}
          <a
            href="#infrastructure"
            className="mb-1 block font-mono text-[9px] text-[var(--ink-light)] underline decoration-[var(--rule-light)] underline-offset-2 transition-colors hover:text-[var(--ink)]"
          >
            XVI. Infrastructure &amp; Services
          </a>
        </div>
      </div>

      {/* Layer Sections */}
      {LAYERS.map((layer) => (
        <section key={layer.id} id={layer.id} className="mb-10 scroll-mt-16">
          <div className="mb-4 border-b-2 border-[var(--rule)] pb-2">
            <h2
              className="font-headline text-xl text-[var(--ink)]"
              dangerouslySetInnerHTML={{ __html: layer.title }}
            />
          </div>
          <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
            {layer.subtitle}
          </p>
          <div className="border border-[var(--rule-light)]">
            {layer.items.map((item, i) => (
              <div
                key={item.name}
                className={`flex items-baseline gap-3 px-3 py-2 ${
                  i > 0 ? "border-t border-[var(--rule-light)]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] font-bold text-[var(--ink)]">
                    {item.name}
                  </span>
                  <span className="ml-2 font-mono text-[9px] text-[var(--ink-faint)]">
                    {item.detail}
                  </span>
                </div>
                {item.tag && (
                  <span
                    className={`shrink-0 border px-1.5 py-0.5 font-mono text-[7px] uppercase tracking-wider ${
                      TAG_COLORS[item.tag] || "border-[var(--rule-light)] text-[var(--ink-faint)]"
                    }`}
                  >
                    {item.tag}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Infrastructure */}
      <section id="infrastructure" className="mb-10 scroll-mt-16">
        <div className="mb-4 border-b-2 border-[var(--rule)] pb-2">
          <h2 className="font-headline text-xl text-[var(--ink)]">
            XVI. Infrastructure &amp; Services
          </h2>
        </div>
        <p className="mb-4 font-body-serif text-sm text-[var(--ink-light)]">
          Railway-hosted monorepo deployment. Agent Hub routes LLM calls through Groq
          free tier (Llama 3.3 70B) with Together.ai fallback. Zero vendor lock-in.
        </p>
        <div className="border border-[var(--rule-light)]">
          {INFRA_ITEMS.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-baseline gap-3 px-3 py-2 ${
                i > 0 ? "border-t border-[var(--rule-light)]" : ""
              }`}
            >
              <span className="w-36 shrink-0 font-mono text-[10px] font-bold text-[var(--ink)]">
                {item.label}
              </span>
              <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* System Diagram (ASCII) */}
      <section className="mb-10">
        <div className="mb-4 border-b-2 border-[var(--rule)] pb-2">
          <h2 className="font-headline text-xl text-[var(--ink)]">
            XVII. System Topology
          </h2>
        </div>
        <div className="overflow-x-auto border border-[var(--rule)] bg-[var(--paper-dark)] p-4">
          <pre className="font-mono text-[8px] leading-[1.6] text-[var(--ink-light)] sm:text-[9px]">{`
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER  SURFACES                                  │
│  ┌──────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────┐ │
│  │ Web App  │   │ Mobile (Expo) │   │ Extension v3  │   │    SDK    │ │
│  │ Next.js  │   │ React Native  │   │ Content + BG  │   │ TS / npm  │ │
│  └────┬─────┘   └───────┬───────┘   └───────┬───────┘   └─────┬─────┘ │
└───────┼─────────────────┼───────────────────┼─────────────────┼───────┘
        │                 │                   │                 │
        ▼                 ▼                   ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API  LAYER                                     │
│  78 endpoints · SIWE auth · rate limiting · security headers            │
│  ┌──────────┐ ┌────────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │
│  │   Feed   │ │  Trading   │ │  Agents   │ │ Editorial │ │ Editions │ │
│  │ /api/fed │ │ /api/trad  │ │ /api/agen │ │ /api/edit │ │ /api/edi │ │
│  └──────────┘ └────────────┘ └───────────┘ └───────────┘ └──────────┘ │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐
│  AGENT HUB   │  │  TRADING ENGINE  │  │  PONDER INDEXER │
│  Groq / LLM  │  │  HyperLiquid L1  │  │  PostgreSQL     │
│  $0/day      │  │  Kelly + Circuit  │  │  GraphQL API    │
└──────────────┘  └──────────────────┘  └─────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SMART  CONTRACT  LAYER                             │
│                                                                         │
│  BASE L2 (8453)          ETHEREUM (1)         ARBITRUM           SOLANA │
│  ┌──────────────┐       ┌──────────────┐     ┌──────────┐    ┌───────┐ │
│  │ Registry     │       │ Prediction   │     │ Transit  │    │Anchor │ │
│  │ Ratings      │       │ Market       │     │ Escrow   │    │Progra │ │
│  │ Comments     │       │              │     │ Strategy │    │  m    │ │
│  │ Tipping      │       │ Nouns Gov V4 │     │ Manager  │    │       │ │
│  │ Leaderboard  │       │ (read-only)  │     │          │    │ 6 mod │ │
│  │ AgentVault   │       └──────────────┘     └──────────┘    │ ules  │ │
│  │ Editions     │                                            └───────┘ │
│  │ Auctions     │       ┌──────────────┐                               │
│  │ MO Token     │       │   ZK LAYER   │                               │
│  │ Vault Rail   │       │ Circom 2.1.6 │                               │
│  │ (6 contracts)│       │ Groth16 ─────┼──── BN254 shared curve ────── │
│  └──────────────┘       └──────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
`.trim()}</pre>
        </div>
      </section>

      {/* Colophon */}
      <footer className="mt-12 border-t-2 border-[var(--rule)] pt-4 pb-8 text-center">
        <div className="h-px bg-[var(--rule)] mb-1" />
        <div className="h-[2px] bg-[var(--rule)] mb-3" />
        <p className="font-mono text-[7px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          {BRAND_DOMAIN} &bull; permissionless &bull; onchain &bull; base l2 + ethereum l1 + arbitrum + solana
        </p>
        <p className="mt-1 font-mono text-[7px] tracking-[0.2em] text-[var(--ink-faint)]">
          the freedom of speech machine
        </p>
      </footer>
    </div>
  );
}
