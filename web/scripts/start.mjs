#!/usr/bin/env node
/**
 * Universal start script — routes to either the Next.js web server
 * or the always-on worker process based on WORKER_TASKS env var.
 */
import { execSync } from "node:child_process";

const workerTasks = process.env.WORKER_TASKS?.trim();

if (workerTasks) {
  console.log(`[start] WORKER_TASKS=${workerTasks} — launching worker`);
  execSync("npm run worker:start", { stdio: "inherit" });
} else {
  console.log("[start] No WORKER_TASKS — launching Next.js server");
  execSync("npx next start -p " + (process.env.PORT || "3000"), {
    stdio: "inherit",
  });
}
