#!/usr/bin/env node
/**
 * Universal start script — routes to either the Next.js web server
 * or the always-on worker process based on WORKER_TASKS env var.
 */
import { execSync } from "node:child_process";
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
  execSync("npx next start -p " + (process.env.PORT || "3000"), {
    stdio: "inherit",
    env: {
      ...process.env,
      // Prevent OOM on Railway — default 512MB is too small for SSR with large archives
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=1024"].filter(Boolean).join(" "),
    },
  });
}
