import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 55;

const CRON_SECRET = process.env.CRON_SECRET?.trim();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM || "pooter <daily@pooter.world>";
const NEWSLETTER_TO = (process.env.NEWSLETTER_RECIPIENTS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pooter.world";

/**
 * POST /api/newsletter/send
 * Compiles and sends The Daily Pooter morning intelligence brief.
 * Called by GitHub Actions cron or manually.
 */
export async function POST(request: NextRequest) {
  // Auth
  const auth = request.headers.get("authorization")?.trim();
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  if (NEWSLETTER_TO.length === 0) {
    return NextResponse.json({ error: "No recipients configured" }, { status: 400 });
  }

  try {
    // ── Gather data from our own APIs ──────────────────────────────
    const [feedRes, signalsRes, tradingRes] = await Promise.allSettled([
      fetch(`${SITE_URL}/api/feed?limit=20`, { next: { revalidate: 0 } }).then((r) => r.json()),
      fetch(`${SITE_URL}/api/signals/latest`, { next: { revalidate: 0 } }).then((r) => r.json()).catch(() => null),
      fetch(`${SITE_URL}/api/trading/performance`, {
        headers: CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {},
        next: { revalidate: 0 },
      }).then((r) => r.json()).catch(() => null),
    ]);

    const feed = feedRes.status === "fulfilled" ? feedRes.value : { items: [] };
    const signals = signalsRes.status === "fulfilled" ? signalsRes.value : null;
    const trading = tradingRes.status === "fulfilled" ? tradingRes.value : null;

    const items = Array.isArray(feed) ? feed : feed?.items || [];
    const topStories = items.slice(0, 8);

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // ── Build email HTML ──────────────────────────────────────────
    const html = buildEmailHtml({
      date: today,
      topStories,
      signals,
      trading,
    });

    // ── Send via Resend ───────────────────────────────────────────
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: NEWSLETTER_FROM,
        to: NEWSLETTER_TO,
        subject: `The Daily Pooter — ${today}`,
        html,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error("[newsletter] Resend error:", err);
      return NextResponse.json({ error: "Email send failed", details: err }, { status: 502 });
    }

    const result = await sendRes.json();
    return NextResponse.json({
      status: "sent",
      recipients: NEWSLETTER_TO.length,
      emailId: result.id,
    });
  } catch (error: any) {
    console.error("[newsletter] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── Email template ──────────────────────────────────────────────────

interface EmailData {
  date: string;
  topStories: any[];
  signals: any;
  trading: any;
}

function buildEmailHtml({ date, topStories, signals, trading }: EmailData): string {
  const storyRows = topStories
    .map(
      (item: any) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #DDD6CA;">
          <a href="${item.link || "#"}" style="color: #1A1A1A; text-decoration: none;">
            <span style="font-family: Georgia, serif; font-size: 15px; font-weight: 700; line-height: 1.3;">
              ${escHtml(item.title || "Untitled")}
            </span>
          </a>
          <br/>
          <span style="font-family: 'Courier New', monospace; font-size: 10px; color: #8A8A8A; text-transform: uppercase; letter-spacing: 1px;">
            ${escHtml(item.source || "")} · ${escHtml(item.category || "")}
          </span>
          ${item.description ? `<br/><span style="font-family: Georgia, serif; font-size: 13px; color: #555; line-height: 1.4;">${escHtml(truncate(item.description, 140))}</span>` : ""}
        </td>
      </tr>`,
    )
    .join("");

  // Market pulse
  let marketSection = "";
  if (trading) {
    const pnl = trading.totalPnlUsd ?? trading.pnl ?? "N/A";
    const openPos = trading.openPositions ?? trading.positions?.length ?? 0;
    const winRate = trading.winRate ?? "N/A";
    marketSection = `
    <tr><td style="padding: 20px 0 8px;">
      <span style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #1A1A1A; border-bottom: 2px solid #1A1A1A; padding-bottom: 4px;">
        Market Pulse
      </span>
    </td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid #DDD6CA;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family: 'Courier New', monospace; font-size: 12px; color: #1A1A1A; padding: 4px 0;">
            Open Positions: <strong>${openPos}</strong>
          </td>
          <td style="font-family: 'Courier New', monospace; font-size: 12px; color: #1A1A1A; padding: 4px 0; text-align: right;">
            P&L: <strong>${typeof pnl === "number" ? (pnl >= 0 ? "+" : "") + pnl.toFixed(2) + " USD" : pnl}</strong>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="font-family: 'Courier New', monospace; font-size: 12px; color: #8A8A8A; padding: 4px 0;">
            Win Rate: ${typeof winRate === "number" ? (winRate * 100).toFixed(0) + "%" : winRate}
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // Signals
  let signalSection = "";
  if (signals && Array.isArray(signals.signals) && signals.signals.length > 0) {
    const rows = signals.signals
      .slice(0, 5)
      .map(
        (s: any) => `
        <tr>
          <td style="font-family: 'Courier New', monospace; font-size: 12px; padding: 6px 0; border-bottom: 1px solid #EDE7DA;">
            <strong>${escHtml(s.market || s.symbol || "?")}</strong>
            <span style="color: ${s.direction === "long" ? "#2E5A2E" : s.direction === "short" ? "#8B0000" : "#8A8A8A"}; font-weight: 700;">
              ${escHtml((s.direction || "neutral").toUpperCase())}
            </span>
            <span style="color: #8A8A8A;"> · conf ${typeof s.confidence === "number" ? (s.confidence * 100).toFixed(0) + "%" : "N/A"}</span>
          </td>
        </tr>`,
      )
      .join("");

    signalSection = `
    <tr><td style="padding: 20px 0 8px;">
      <span style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #1A1A1A; border-bottom: 2px solid #1A1A1A; padding-bottom: 4px;">
        Signal Desk
      </span>
    </td></tr>
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </td></tr>`;
  }

  // Predictions section
  const predictions = generatePredictions(topStories, signals, trading);

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin: 0; padding: 0; background-color: #F5F0E8; font-family: Georgia, serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F5F0E8;">
<tr><td align="center" style="padding: 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background-color: #F5F0E8; max-width: 600px;">

  <!-- Header -->
  <tr><td style="border-bottom: 3px solid #1A1A1A; padding-bottom: 12px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-family: 'Courier New', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 3px; color: #8A8A8A;">
          The Daily Pooter
        </td>
        <td style="text-align: right; font-family: 'Courier New', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #8A8A8A;">
          ${escHtml(date)}
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding: 16px 0 4px;">
    <span style="font-family: Georgia, serif; font-size: 28px; font-weight: 700; color: #1A1A1A; line-height: 1.1;">
      Morning Intelligence Brief
    </span>
  </td></tr>

  <tr><td style="padding: 0 0 16px;">
    <span style="font-family: 'Courier New', monospace; font-size: 10px; color: #8A8A8A; text-transform: uppercase; letter-spacing: 1.5px;">
      Curated by pooter1 · Autonomous editorial agent
    </span>
  </td></tr>

  <!-- Top Stories -->
  <tr><td style="padding: 8px 0;">
    <span style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #1A1A1A; border-bottom: 2px solid #1A1A1A; padding-bottom: 4px;">
      Global Radar
    </span>
  </td></tr>
  ${storyRows}

  <!-- Market Pulse -->
  ${marketSection}

  <!-- Signals -->
  ${signalSection}

  <!-- Predictions -->
  <tr><td style="padding: 20px 0 8px;">
    <span style="font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #1A1A1A; border-bottom: 2px solid #1A1A1A; padding-bottom: 4px;">
      Predictions
    </span>
  </td></tr>
  <tr><td style="padding: 8px 0; border-bottom: 1px solid #DDD6CA;">
    <span style="font-family: Georgia, serif; font-size: 13px; color: #555; line-height: 1.5;">
      ${predictions}
    </span>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding: 24px 0;" align="center">
    <a href="${SITE_URL}" style="display: inline-block; padding: 10px 28px; background-color: #1A1A1A; color: #F5F0E8; font-family: 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; text-decoration: none;">
      Read More on pooter.world
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding: 16px 0; border-top: 1px solid #C8C0B4;">
    <span style="font-family: 'Courier New', monospace; font-size: 9px; color: #8A8A8A; line-height: 1.6;">
      This briefing is generated autonomously by pooter1, an AI agent operating on the pooter.world morality network.
      <br/><br/>
      <strong style="color: #8B0000;">IMPORTANT: This is not financial advice.</strong> Market signals, predictions, and trading data
      are for informational and entertainment purposes only. All trading involves risk of loss.
      Past performance does not guarantee future results. Do your own research. pooter.world and its
      agents are experimental software — use at your own risk.
      <br/><br/>
      <a href="${SITE_URL}" style="color: #8A8A8A;">pooter.world</a> · the morality browser
    </span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function generatePredictions(stories: any[], signals: any, trading: any): string {
  const lines: string[] = [];

  // Market direction prediction based on signals
  if (signals?.signals?.length > 0) {
    const longs = signals.signals.filter((s: any) => s.direction === "long").length;
    const shorts = signals.signals.filter((s: any) => s.direction === "short").length;
    if (longs > shorts) {
      lines.push(`• Market signals lean <strong style="color: #2E5A2E;">bullish</strong> (${longs} long vs ${shorts} short signals). Watch for confirmation above key resistance levels.`);
    } else if (shorts > longs) {
      lines.push(`• Market signals lean <strong style="color: #8B0000;">bearish</strong> (${shorts} short vs ${longs} long signals). Caution advised; downside pressure may continue.`);
    } else {
      lines.push(`• Market signals are <strong>mixed</strong> (${longs} long, ${shorts} short). Consolidation likely. Wait for directional clarity.`);
    }
  }

  // News-based predictions
  const cryptoStories = stories.filter((s: any) =>
    (s.category || "").toLowerCase().includes("crypto") ||
    (s.tags || []).some((t: string) => ["crypto", "bitcoin", "ethereum", "defi"].includes(t.toLowerCase())),
  );
  if (cryptoStories.length >= 3) {
    lines.push("• Elevated crypto news volume today — historically correlates with increased volatility. Position sizing matters.");
  }

  const govStories = stories.filter((s: any) =>
    (s.category || "").toLowerCase().includes("governance") ||
    (s.category || "").toLowerCase().includes("politics"),
  );
  if (govStories.length >= 2) {
    lines.push("• Policy/governance headlines prominent — watch for regulatory impact on risk assets over the next 48 hours.");
  }

  if (trading?.openPositions > 3) {
    lines.push(`• Currently running ${trading.openPositions} open positions. Concentrated exposure — monitor for correlated moves.`);
  }

  if (lines.length === 0) {
    lines.push("• Low-conviction environment. No strong directional signals. Patience is a position.");
  }

  return lines.join("<br/><br/>");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
