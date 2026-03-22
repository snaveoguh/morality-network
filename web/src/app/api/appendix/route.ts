import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 86400; // 1 day

const APPENDIX = {
  version: "2026-03-21",
  baseUrl: {
    production: "https://pooter.world",
    dev: "https://dev.pooter.world",
  },
  contracts: {
    baseMainnet: {
      chainId: 8453,
      explorer: "https://basescan.org",
      rpc: "https://mainnet.base.org",
      contracts: [
        { name: "MoralityRegistry", address: "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608", type: "UUPS Proxy" },
        { name: "MoralityRatings", address: "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405", type: "UUPS Proxy" },
        { name: "MoralityComments", address: "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b", type: "UUPS Proxy" },
        { name: "MoralityTipping", address: "0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B", type: "UUPS Proxy" },
        { name: "MoralityLeaderboard", address: "0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6", type: "UUPS Proxy" },
        { name: "MoralityAgentVault", address: "0x4B48d35E019129bb5a16920ADC4Cb7F445ec8cA5", type: "UUPS Proxy" },
        { name: "PooterEditions", address: "0x06d7c7d70c685d58686FF6E0b0DB388209fCCC6e", type: "UUPS Proxy · ERC-721" },
        { name: "PooterAuctions", address: "0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f", type: "Immutable" },
        { name: "MO Token", address: "0x8729c70061739140ee6bE00A3875Cbf6d09A746C", type: "ERC-20" },
        { name: "MoralityProposalVoting", address: null, type: "UUPS Proxy", status: "pending deploy" },
      ],
    },
    baseSepolia: {
      chainId: 84532,
      explorer: "https://sepolia.basescan.org",
      rpc: "https://sepolia.base.org",
      contracts: [
        { name: "MoralityRegistry", address: "0x661674e3Bf03B644a755c0438E3F2168a4d6aa13", type: "UUPS Proxy", implementation: "0xbaa0f71a3b788cdab19383b18ea5894981b308d9" },
        { name: "MoralityRatings", address: "0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f", type: "UUPS Proxy", implementation: "0x510fb45089f2d93cb27f313cced22b440734f33b" },
        { name: "MoralityComments", address: "0xd17E13507f8005048a3fcf9850F2dF65c56e3005", type: "UUPS Proxy", implementation: "0x73db7cda31fb9104f800c969b4732178c7ba8170" },
        { name: "MoralityTipping", address: "0x8b632dF91E59Fb14C828E65E3e1f6eea2180721e", type: "UUPS Proxy", implementation: "0x8f99c886d84ceff9f62f4d5706751e4871cf7e2e" },
        { name: "MoralityLeaderboard", address: "0xf7294B25396E77Fcf6af3f38A3116737df229080", type: "UUPS Proxy", implementation: "0x02f32c1f1780c1c028f2bcb9ad9f1d857eebb564" },
        { name: "MoralityPredictionMarket", address: "0x57bB5C8a19385bCBD366EEcDCFDfA59f47744058", type: "UUPS Proxy", implementation: "0x0b672bdb380010e848e801b8ffacea700e60dd7f" },
        { name: "MoralityAgentVault", address: "0x781A6904a00b8B1a03ba358011A9BF9720eeC531", type: "UUPS Proxy", implementation: "0x83180abffce65523bc6de88d7d4eebdc12de8fb7" },
        { name: "PooterEditions", address: "0x7Ec524d8804cA86562F6892de58CCDc22260CA42", type: "UUPS Proxy · ERC-721", implementation: "0x30e49f9Bc0E11b90F3828597e061c78388978DDa" },
        { name: "PooterAuctions", address: "0xe1D407E486b5943d773FAC9A145a5308b14cC225", type: "Immutable" },
        { name: "MoralityProposalVoting", address: null, type: "Requires NOUNS_TOKEN", status: "not deployed" },
      ],
      wiring: {
        treasury: "0xae4705dC0816ee6d8a13F1C72780Ec5021915Fed",
        editionsMinter: "0xe1D407E486b5943d773FAC9A145a5308b14cC225",
      },
    },
    vaultRailBaseSepolia: {
      chainId: 84532,
      explorer: "https://sepolia.basescan.org",
      note: "ETH-denominated vault rail: deposits on Base, bridges to Arbitrum, deploys to Hyperliquid strategies.",
      contracts: [
        { name: "BaseCapitalVault", address: "0x3bb95125f2a8d8af94dd7ba0ce5b0b8b5eef7d81", type: "UUPS Proxy", implementation: "0x78c8e591f3471ab7d379361dc07c43d1897921e7", security: "NAV delta bounds (10%), deposit cap, WETH-only redemptions, liquid invariant check" },
        { name: "WithdrawalQueue", address: "0x834952e34566feee95fc1cb6a1f6d851be183ebc", type: "UUPS Proxy", implementation: "0x206138ab44dc7190307eb9f4e407a674656f562e", security: "Reentrancy guard" },
        { name: "MorphoReserveAllocator", address: "0xcf85a88125ad622bae3978a2dc7f7fc2dc8fb821", type: "UUPS Proxy", implementation: "0x3abadce58e94ae31fd527f6f6b7d2db195549b7e", security: "Balance-diff withdrawal verification" },
        { name: "BridgeRouter", address: "0x55865854f9d58ad7c6d2cfa7a304419e23817133", type: "UUPS Proxy", implementation: "0xe8cd12085ce417421cca7bc24cf9aef875a33e55", security: "95% min return slippage protection" },
        { name: "NavReporter", address: "0xfa33f4dfe3bec32ae3cb78dbcf508597f74dc528", type: "UUPS Proxy", implementation: "0x24a96f0a0ee5616affd4986032539239a004d4c1", security: "Bounded strategy/fee deltas (10% max per report)" },
        { name: "ExecutorAssetConverter", address: "0xf4d307a237b22e39d2000cf54b53b9116a7b3669", type: "UUPS Proxy" },
        { name: "ExecutorBridgeAdapter", address: "0x692cb562919809d4e850e05c00f389b92b5e298c", type: "UUPS Proxy" },
      ],
      hardeningParams: {
        maxNavDeltaBps: 1000,
        maxStrategyDeltaBps: 1000,
        maxFeeDeltaBps: 1000,
        minReturnBps: 9500,
        maxTotalAssets: 0,
      },
    },
    vaultRailArbSepolia: {
      chainId: 421614,
      explorer: "https://sepolia.arbiscan.io",
      note: "Arbitrum-side vault rail contracts (transit escrow + Hyperliquid strategy manager).",
      contracts: [
        { name: "ArbTransitEscrow", address: "0x14a361454edcb477644eb82bf540a26e1cead72a", type: "UUPS Proxy", implementation: "0x0fe56bda80240da39b7bbc6112269647544dedd6" },
        { name: "HLStrategyManager", address: "0x71b2e273727385c617fe254f4fb14a36a679b12a", type: "UUPS Proxy", implementation: "0x05feabc8611558110aaaea396fae6d3426e05202" },
      ],
    },
    ethereumMainnet: {
      chainId: 1,
      explorer: "https://etherscan.io",
      contracts: [
        { name: "MoralityPredictionMarket", address: "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608", type: "UUPS Proxy" },
      ],
    },
    nounsEcosystem: {
      chainId: 1,
      note: "Read-only integrations. Not owned by pooter world.",
      contracts: [
        { name: "Nouns Token", address: "0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03", type: "ERC-721" },
        { name: "Nouns Governor V4", address: "0x6f3E6272A167e8AcCb32072d08E0957F9c79223d", type: "Governor Bravo" },
        { name: "Nouns Treasury", address: "0x0BC3807Ec262cB779b38D65b38158acC3bfedE10", type: "Executor / Timelock" },
        { name: "Nouns Auction House", address: "0x830BD73E4184ceF73443C15111a1DF14e495C706", type: "Proxy" },
        { name: "Nouns Descriptor", address: "0x0Cfdb3Ba1694c2bb2CFACB0339ad7b1Ae5932B63", type: "SVG Renderer" },
        { name: "Lil Nouns Governor", address: "0x5d2C31ce16924C2a71D317e5BbFd5ce387854039", type: "Governor Bravo" },
      ],
    },
  },
  api: {
    auth: "SIWE (Sign-In with Ethereum). PUBLIC = no auth. AUTH = valid session. HOLDER = MO token holder gate.",
    endpoints: [
      { category: "Feed & Content", routes: [
        { method: "GET", path: "/api/feed", description: "Aggregated RSS feed", auth: "PUBLIC" },
        { method: "GET", path: "/api/feed/sources", description: "Feed source list", auth: "PUBLIC" },
        { method: "GET", path: "/api/stumble", description: "Random article", auth: "PUBLIC" },
        { method: "GET", path: "/api/search", description: "Full-text search", auth: "PUBLIC" },
        { method: "GET", path: "/api/newsroom", description: "Newsroom data", auth: "AUTH" },
        { method: "GET", path: "/api/health/sources", description: "Feed health check", auth: "PUBLIC" },
      ]},
      { category: "Markets & Sentiment", routes: [
        { method: "GET", path: "/api/markets", description: "Crypto market data", auth: "PUBLIC" },
        { method: "GET", path: "/api/sentiment", description: "Sentiment metrics", auth: "PUBLIC" },
        { method: "GET", path: "/api/sentiment/history", description: "Sentiment history", auth: "PUBLIC" },
      ]},
      { category: "Governance", routes: [
        { method: "GET", path: "/api/governance", description: "Nouns/Lil Nouns proposals", auth: "PUBLIC" },
        { method: "GET", path: "/api/governance/[id]", description: "Single proposal detail", auth: "PUBLIC" },
        { method: "GET", path: "/api/v1/governance/live", description: "Live governance feed", auth: "PUBLIC" },
        { method: "POST", path: "/api/proposals/ops", description: "Proposal operations", auth: "AUTH" },
      ]},
      { category: "Predictions", routes: [
        { method: "GET", path: "/api/predictions/ops", description: "Operator dashboard", auth: "AUTH" },
      ]},
      { category: "Discussion", routes: [
        { method: "GET", path: "/api/discuss/stream", description: "Discussion streaming", auth: "PUBLIC" },
        { method: "POST", path: "/api/discuss/stream", description: "Post discussion", auth: "AUTH" },
      ]},
      { category: "AI & Scoring", routes: [
        { method: "POST", path: "/api/ai/score", description: "AI scoring", auth: "AUTH" },
        { method: "POST", path: "/api/editorial/mark-onchain", description: "Mark editorial content", auth: "AUTH" },
        { method: "POST", path: "/api/editorial/pregenerate", description: "Pre-generate content", auth: "AUTH" },
        { method: "GET", path: "/api/evidence/verify", description: "Verify evidence", auth: "AUTH" },
        { method: "GET", path: "/api/deliberation/schema", description: "Deliberation schema", auth: "PUBLIC" },
        { method: "GET", path: "/api/analysts/reputation", description: "Analyst reputation", auth: "PUBLIC" },
        { method: "GET", path: "/api/analysts/interpretations", description: "Analyst interpretations", auth: "PUBLIC" },
      ]},
      { category: "Trading", routes: [
        { method: "GET", path: "/api/trading/signals", description: "Trading signals", auth: "PUBLIC" },
        { method: "GET", path: "/api/trading/signals/live", description: "Live composite signals", auth: "HOLDER" },
        { method: "POST", path: "/api/trading/execute", description: "Execute trades", auth: "AUTH" },
        { method: "GET", path: "/api/trading/metrics", description: "Trading metrics", auth: "PUBLIC" },
        { method: "GET", path: "/api/trading/positions", description: "Trading positions", auth: "AUTH" },
        { method: "GET", path: "/api/trading/readiness", description: "Trading readiness", auth: "AUTH" },
        { method: "GET", path: "/api/trading/candles", description: "OHLCV candlestick data", auth: "PUBLIC" },
        { method: "GET", path: "/api/trading/indicators", description: "Technical indicators", auth: "PUBLIC" },
        { method: "GET", path: "/api/trading/journal", description: "Trade execution journal", auth: "AUTH" },
        { method: "GET", path: "/api/trading/performance", description: "Portfolio performance", auth: "AUTH" },
        { method: "GET", path: "/api/trading/learning", description: "Self-learning report", auth: "AUTH" },
      ]},
      { category: "Agents", routes: [
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
      ]},
      { category: "Auth (SIWE)", routes: [
        { method: "POST", path: "/api/auth/nonce", description: "Generate SIWE nonce", auth: "PUBLIC" },
        { method: "POST", path: "/api/auth/verify", description: "Verify SIWE signature", auth: "PUBLIC" },
        { method: "GET", path: "/api/auth/session", description: "Session status", auth: "PUBLIC" },
      ]},
      { category: "Pepe", routes: [
        { method: "GET", path: "/api/pepe/[asset]", description: "Asset detail", auth: "PUBLIC" },
        { method: "GET", path: "/api/pepe/listings", description: "Pepe listings", auth: "PUBLIC" },
        { method: "GET", path: "/api/pepe/img/[asset]", description: "Pepe image proxy", auth: "PUBLIC" },
      ]},
      { category: "Editions & Auctions", routes: [
        { method: "GET", path: "/api/edition/[tokenId]", description: "Edition metadata", auth: "PUBLIC" },
        { method: "GET", path: "/api/edition/[tokenId]/image", description: "Edition image", auth: "PUBLIC" },
        { method: "GET", path: "/api/daily-edition", description: "Daily edition", auth: "PUBLIC" },
      ]},
      { category: "Terminal & Music", routes: [
        { method: "POST", path: "/api/terminal/chat", description: "Terminal chat — bankr engine", auth: "HOLDER" },
        { method: "GET", path: "/api/terminal/subscription/status", description: "Subscription status", auth: "PUBLIC" },
        { method: "POST", path: "/api/terminal/risk", description: "Risk assessment — venice engine", auth: "HOLDER" },
        { method: "GET", path: "/api/music/discover", description: "Music discovery", auth: "PUBLIC" },
      ]},
      { category: "Protocol", routes: [
        { method: "GET", path: "/api/protocol-wire", description: "Protocol wire", auth: "PUBLIC" },
        { method: "POST", path: "/api/protocol-wire", description: "Submit to wire", auth: "AUTH" },
      ]},
      { category: "Moral Compass", routes: [
        { method: "GET", path: "/api/moral-compass/crawl", description: "Ethics/philosophy crawl", auth: "AUTH" },
        { method: "GET", path: "/api/moral-compass/status", description: "Compass stats", auth: "PUBLIC" },
      ]},
      { category: "Moral Commentary", routes: [
        { method: "GET", path: "/api/moral-commentary/generate", description: "Daily moral commentary", auth: "AUTH" },
      ]},
      { category: "Appendix", routes: [
        { method: "GET", path: "/api/appendix", description: "This reference as JSON", auth: "PUBLIC" },
      ]},
    ],
  },
} as const;

export async function GET() {
  return NextResponse.json(APPENDIX, {
    headers: {
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
