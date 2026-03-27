/**
 * pooter1 — first autonomous agent on the pooter network.
 *
 * A lightweight Hono server exposing task endpoints.
 * Triggered by GitHub Actions crons or manual calls.
 * Runs on Railway as a separate service.
 *
 * Endpoints:
 *   GET  /health           — status + voice profile version
 *   POST /tasks/editorial   — write and publish an editorial
 *   POST /tasks/comment     — comment on today's articles
 *   POST /tasks/learn       — self-learning cycle (weekly)
 *   GET  /voice             — current voice profile
 */
import { Hono } from "hono";
import { AGENT_NAME, CRON_SECRET } from "./config.js";
import { getVoiceProfile, getDailyStats } from "./memory.js";
import { writeEditorial } from "./tasks/write-editorial.js";
import { commentOnArticles } from "./tasks/comment.js";
import { learn } from "./tasks/learn.js";
import { farcasterDigest } from "./tasks/farcaster-digest.js";

const app = new Hono();

// ── Auth middleware for task endpoints ───────────────────────────────
function requireAuth(c: any, next: any) {
  if (!CRON_SECRET) return next(); // No auth configured = dev mode
  const auth = c.req.header("authorization");
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return next();
}

// ── Health ──────────────────────────────────────────────────────────
app.get("/health", async (c) => {
  const voice = await getVoiceProfile();
  const stats = await getDailyStats();
  return c.json({
    agent: AGENT_NAME,
    status: "alive",
    voiceVersion: voice.version,
    tone: voice.tone,
    dailyStats: stats,
    uptime: process.uptime(),
  });
});

// ── Voice Profile ──────────────────────────────────────────────────
app.get("/voice", async (c) => {
  const voice = await getVoiceProfile();
  return c.json(voice);
});

// ── Task: Write Editorial ──────────────────────────────────────────
app.post("/tasks/editorial", requireAuth, async (c) => {
  try {
    await writeEditorial();
    return c.json({ status: "ok", task: "editorial" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Task: Comment on Articles ──────────────────────────────────────
app.post("/tasks/comment", requireAuth, async (c) => {
  try {
    await commentOnArticles();
    return c.json({ status: "ok", task: "comment" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Task: Self-Learning ────────────────────────────────────────────
app.post("/tasks/learn", requireAuth, async (c) => {
  try {
    await learn();
    return c.json({ status: "ok", task: "learn" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Task: Farcaster Digest ────────────────────────────────────────
app.post("/tasks/farcaster-digest", requireAuth, async (c) => {
  try {
    await farcasterDigest();
    return c.json({ status: "ok", task: "farcaster-digest" });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ── Start ──────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT || "3001", 10);

import { serve } from "@hono/node-server";

serve({ fetch: app.fetch, port }, () => {
  console.log(`[${AGENT_NAME}] Listening on port ${port}`);
});
