#!/usr/bin/env node
/**
 * Universal start script — routes to either the Next.js web server
 * or the always-on worker process based on WORKER_TASKS env var.
 */
import { execSync, spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const workerTasks = process.env.WORKER_TASKS?.trim();

if (workerTasks) {
  // The worker imports modules that use `import "server-only"`.
  // That package intentionally throws outside Next.js Server Components.
  // We're server-side in the worker, so replace it with a no-op stub.
  try {
    const stubDir = join(process.cwd(), "node_modules", "server-only");
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(join(stubDir, "index.js"), "// worker shim — no-op\n");
    console.log("[start] patched server-only for worker context");
  } catch {}

  console.log(`[start] WORKER_TASKS=${workerTasks} — launching worker`);
  execSync("npm run worker:start", { stdio: "inherit" });
} else {
  console.log("[start] No WORKER_TASKS — launching Next.js server");
  startWebWithWatchdog();
}

// Railway restarts a process that exits, but not one that hangs: a stuck
// server just answers every request with "Application failed to respond".
// So run Next as a child, ping it, and exit when it stops answering; the
// restart policy (railway.json: ALWAYS) brings up a fresh one.
function startWebWithWatchdog() {
  const port = process.env.PORT || "3000";
  const GRACE_MS = 3 * 60_000; // boot and first crawl
  const INTERVAL_MS = 30_000;
  const TIMEOUT_MS = 10_000;
  const MAX_MISSES = 4; // about two minutes unresponsive

  // Run Next's own binary (not via npx) so the watchdog kills the server
  // itself, not a wrapper that would leave it orphaned.
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", port], {
    stdio: "inherit",
    env: {
      ...process.env,
      // Prevent OOM on Railway — default 512MB is too small for SSR with large archives.
      // In NODE_OPTIONS the LAST --max-old-space-size wins, so only append the fallback
      // when the platform env hasn't already set one (Railway prod sets 4096).
      NODE_OPTIONS: process.env.NODE_OPTIONS?.includes("--max-old-space-size")
        ? process.env.NODE_OPTIONS
        : [process.env.NODE_OPTIONS, "--max-old-space-size=2048"].filter(Boolean).join(" "),
    },
  });

  child.on("exit", (code, signal) => {
    console.error(`[start] next exited (code ${code}, signal ${signal})`);
    process.exit(code ?? 1);
  });
  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => child.kill(sig));
  }

  if (process.env.WATCHDOG === "false") return;
  let misses = 0;
  setTimeout(() => {
    setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/ping`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        misses = res.ok ? 0 : misses + 1;
      } catch {
        misses += 1;
      }
      if (misses > 0) console.warn(`[watchdog] ping failed (${misses}/${MAX_MISSES})`);
      if (misses >= MAX_MISSES) {
        console.error("[watchdog] server unresponsive — restarting");
        child.kill("SIGKILL");
      }
    }, INTERVAL_MS);
  }, GRACE_MS);
}
