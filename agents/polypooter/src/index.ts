import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getConfig } from "./config.js";
import { scanMarkets, getLastScanResults } from "./tasks/scan-markets.js";
import { generateReport } from "./tasks/report.js";

const config = getConfig();
const app = new Hono();
const startedAt = Date.now();

// ── Auth middleware ──

function verifyAuth(authHeader: string | undefined): boolean {
  if (!config.cronSecret) return true; // Dev mode — no auth
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === config.cronSecret;
}

// ── Routes ──

app.get("/health", (c) => {
  const { totalScans, totalOpportunitiesFound, lastScanAt } = getLastScanResults();
  return c.json({
    status: "ok",
    agent: "polypooter",
    version: "0.1.0",
    dryRun: config.dryRun,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    totalScans,
    totalOpportunitiesFound,
    lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : null,
    config: {
      minArbSpreadPct: config.minArbSpreadPct,
      minLiquidityUsd: config.minLiquidityUsd,
      scanIntervalMs: config.scanIntervalMs,
    },
  });
});

app.post("/tasks/scan", async (c) => {
  if (!verifyAuth(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await scanMarkets(config);
    return c.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[polypooter] Scan failed:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      500,
    );
  }
});

app.get("/opportunities", (c) => {
  if (!verifyAuth(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { opportunities, lastScanAt } = getLastScanResults();
  return c.json({
    count: opportunities.length,
    lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : null,
    opportunities,
  });
});

app.get("/report", (c) => {
  if (!verifyAuth(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(generateReport());
});

// ── Background scanner (optional) ──

let scanInterval: ReturnType<typeof setInterval> | null = null;

function startBackgroundScanner() {
  if (config.scanIntervalMs <= 0) return;

  console.log(`[polypooter] Background scanner enabled: every ${config.scanIntervalMs / 1000}s`);

  // Initial scan after 10s startup delay
  setTimeout(() => {
    scanMarkets(config).catch((err) =>
      console.error("[polypooter] Initial scan failed:", err),
    );
  }, 10_000);

  scanInterval = setInterval(() => {
    scanMarkets(config).catch((err) =>
      console.error("[polypooter] Scheduled scan failed:", err),
    );
  }, config.scanIntervalMs);
}

// ── Start ──

console.log(`[polypooter] Starting on port ${config.port}...`);
console.log(`[polypooter] Dry run: ${config.dryRun}`);
console.log(`[polypooter] Min arb spread: ${(config.minArbSpreadPct * 100).toFixed(1)}%`);
console.log(`[polypooter] Min liquidity: $${config.minLiquidityUsd}`);

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`[polypooter] Listening on http://localhost:${config.port}`);
  startBackgroundScanner();
});
