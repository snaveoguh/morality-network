#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(new URL("../../", import.meta.url).pathname);
const WEB_API_ROOT = path.join(REPO_ROOT, "web", "src", "app", "api");
const INDEXER_ROUTES = path.join(REPO_ROOT, "indexer", "src", "api", "routes.ts");

const MUTATION_METHODS = ["POST", "PUT", "PATCH", "DELETE"];
const AUTH_MARKERS = [
  "verifyCronAuth(",
  "isAuthorized(",
  "getSession(",
  "GOD_MODE_SECRET",
  "AGENT_BRIDGE_SECRET",
  "Authorization: `Bearer ${GOD_MODE_SECRET}`",
];
const RATE_LIMIT_MARKER = "rateLimit(";

const PUBLIC_MUTATION_EXCEPTIONS = new Map([
  ["/api/auth/verify", "Public by design: SIWE verification endpoint."],
  ["/api/auth/session", "Public by design: session destroy endpoint."],
]);

const SENSITIVE_GET_PATTERNS = [
  {
    path: "/api/trading/positions",
    reason: "Returns live and historical positions plus runtime config.",
    signals: ["positions:", "config:", "fetchPersistedTraderState"],
  },
  {
    path: "/api/trading/readiness",
    reason: "Returns execution readiness and runtime config.",
    signals: ["readiness:", "config:", "fetchPersistedTraderState"],
  },
  {
    path: "/api/trading/performance",
    reason: "Returns live account value and performance metrics.",
    signals: ["accountValueUsd", "metrics", "openPositionCount"],
  },
  {
    path: "/api/trading/journal",
    reason: "Returns recent trade history.",
    signals: ["trades:", "positionsToJournal"],
  },
  {
    path: "/api/agents/console",
    reason: "Returns agent throughput, bridge status, trader decisions, and AI budget telemetry.",
    signals: ["verifiedRelayCount", "recentDecisions", "providerBudgets", "trader:"],
  },
];

function toRoutePath(filePath) {
  const relative = path.relative(WEB_API_ROOT, filePath);
  const withoutRoute = relative.replace(/\/route\.ts$/, "").replace(/\\/g, "/");
  return `/api/${withoutRoute}`;
}

async function listRouteFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRouteFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      files.push(fullPath);
    }
  }
  return files;
}

function detectMutationMethods(source) {
  return MUTATION_METHODS.filter((method) =>
    new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).test(source),
  );
}

function hasAnyMarker(source, markers) {
  return markers.some((marker) => source.includes(marker));
}

function classifyWebRoute(routePath, source) {
  const methods = detectMutationMethods(source);
  const hasAuth = hasAnyMarker(source, AUTH_MARKERS);
  const hasRateLimit = source.includes(RATE_LIMIT_MARKER);
  const exception = PUBLIC_MUTATION_EXCEPTIONS.get(routePath);

  if (methods.length === 0) {
    return null;
  }

  let classification = "public";
  let detail = "No auth guard detected.";

  if (exception) {
    classification = "allowed-public";
    detail = exception;
  } else if (hasAuth) {
    classification = "guarded";
    detail = "Explicit auth guard detected.";
  } else if (hasRateLimit) {
    classification = "rate-limited-only";
    detail = "Rate limiting present, but no auth guard detected.";
  }

  return {
    routePath,
    methods,
    classification,
    detail,
  };
}

async function scanWebRoutes() {
  const files = await listRouteFiles(WEB_API_ROOT);
  const routes = [];
  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    const routePath = toRoutePath(filePath);
    const mutationResult = classifyWebRoute(routePath, source);
    const sensitiveGet = SENSITIVE_GET_PATTERNS.find(
      (candidate) =>
        candidate.path === routePath &&
        candidate.signals.every((signal) => source.includes(signal)),
    );

    routes.push({
      filePath,
      routePath,
      mutation: mutationResult,
      sensitiveGet:
        sensitiveGet && /export\s+async\s+function\s+GET\s*\(/.test(source)
          ? sensitiveGet
          : null,
    });
  }
  return routes;
}

function findBlocks(source, marker) {
  const blocks = [];
  let offset = 0;

  while (true) {
    const start = source.indexOf(marker, offset);
    if (start === -1) break;

    let cursor = start + marker.length;
    let depth = 0;
    let opened = false;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth -= 1;
        if (opened && depth === 0) {
          cursor += 1;
          break;
        }
      }
      cursor += 1;
    }

    blocks.push(source.slice(start, cursor));
    offset = cursor;
  }

  return blocks;
}

function parseIndexerEndpointPath(block) {
  const match = block.match(/ponder\.(?:post|put|delete|patch|get)\(\s*"([^"]+)"/);
  return match ? match[1] : null;
}

async function scanIndexerRoutes() {
  const source = await fs.readFile(INDEXER_ROUTES, "utf8");
  const workerAuthFailOpen =
    source.includes("function hasWorkerWriteAccess") &&
    source.includes("if (!secret) return true;");

  const postBlocks = [
    ...findBlocks(source, 'ponder.post("'),
    ...findBlocks(source, 'ponder.put("'),
    ...findBlocks(source, 'ponder.delete("'),
    ...findBlocks(source, 'ponder.patch("'),
  ];

  const mutationRoutes = postBlocks
    .map((block) => {
      const routePath = parseIndexerEndpointPath(block);
      if (!routePath) return null;

      const hasWorkerWriteAccess = block.includes("hasWorkerWriteAccess(");
      return {
        routePath,
        classification: hasWorkerWriteAccess ? "worker-secret-guarded" : "public",
        detail: hasWorkerWriteAccess
          ? workerAuthFailOpen
            ? "Guard present, but fail-open when INDEXER_WORKER_SECRET is unset."
            : "Worker secret guard detected."
          : "No worker auth guard detected.",
      };
    })
    .filter(Boolean);

  return {
    workerAuthFailOpen,
    mutationRoutes,
  };
}

function printSection(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

function printRouteRow({ methodLabel, routePath, classification, detail, filePath }) {
  console.log(`${methodLabel.padEnd(10)} ${classification.padEnd(18)} ${routePath}`);
  console.log(`  ${detail}`);
  if (filePath) {
    console.log(`  file: ${path.relative(REPO_ROOT, filePath)}`);
  }
}

async function main() {
  const webRoutes = await scanWebRoutes();
  const indexer = await scanIndexerRoutes();

  const riskyWebMutations = webRoutes
    .filter((route) => route.mutation && !["guarded", "allowed-public"].includes(route.mutation.classification))
    .sort((a, b) => a.routePath.localeCompare(b.routePath));

  const sensitiveGets = webRoutes
    .filter((route) => route.sensitiveGet)
    .sort((a, b) => a.routePath.localeCompare(b.routePath));

  const riskyIndexerMutations = indexer.mutationRoutes
    .filter((route) => route.classification !== "worker-secret-guarded" || indexer.workerAuthFailOpen)
    .sort((a, b) => a.routePath.localeCompare(b.routePath));

  console.log("Pooter World Local Red-Team Scan");
  console.log("Static-only audit. No network traffic sent.");
  console.log(`Repo: ${REPO_ROOT}`);

  printSection("Web Mutation Routes Missing Real Auth");
  if (riskyWebMutations.length === 0) {
    console.log("No risky public mutation routes detected.");
  } else {
    for (const route of riskyWebMutations) {
      printRouteRow({
        methodLabel: route.mutation.methods.join(","),
        routePath: route.routePath,
        classification: route.mutation.classification,
        detail: route.mutation.detail,
        filePath: route.filePath,
      });
    }
  }

  printSection("Sensitive Public GET Surfaces");
  if (sensitiveGets.length === 0) {
    console.log("No sensitive public GET surfaces detected by heuristics.");
  } else {
    for (const route of sensitiveGets) {
      printRouteRow({
        methodLabel: "GET",
        routePath: route.routePath,
        classification: "public-telemetry",
        detail: route.sensitiveGet.reason,
        filePath: route.filePath,
      });
    }
  }

  printSection("Indexer Mutation Surfaces");
  console.log(
    `hasWorkerWriteAccess fail-open: ${indexer.workerAuthFailOpen ? "YES" : "NO"}`,
  );
  if (riskyIndexerMutations.length === 0) {
    console.log("No risky indexer mutation surfaces detected.");
  } else {
    for (const route of riskyIndexerMutations) {
      printRouteRow({
        methodLabel: "MUTATION",
        routePath: route.routePath,
        classification: route.classification,
        detail: route.detail,
        filePath: INDEXER_ROUTES,
      });
    }
  }

  const summary = {
    riskyWebMutations: riskyWebMutations.length,
    sensitivePublicGets: sensitiveGets.length,
    riskyIndexerMutations: riskyIndexerMutations.length,
    indexerFailOpen: indexer.workerAuthFailOpen,
  };

  printSection("Summary");
  console.log(JSON.stringify(summary, null, 2));

  if (
    summary.riskyWebMutations > 0 ||
    summary.sensitivePublicGets > 0 ||
    summary.riskyIndexerMutations > 0 ||
    summary.indexerFailOpen
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("red-team-local failed:", error);
  process.exitCode = 1;
});
