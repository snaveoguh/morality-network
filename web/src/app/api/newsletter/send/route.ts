import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/newsletter/auth";
import {
  deliverIndividually,
  type DeliveryFailure,
  type OutgoingEmail,
} from "@/lib/newsletter/delivery";
import { unsubscribeLinks } from "@/lib/newsletter/links";
import { getNewsletterRedis, listNewsletterRecipients } from "@/lib/newsletter/store";
import { newsletterTokensConfigured } from "@/lib/newsletter/tokens";

export const runtime = "nodejs";
export const maxDuration = 55;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pooter.world";

/** Time allowed for the Resend calls; leaves room under maxDuration to reply. */
const SEND_BUDGET_MS = 40_000;

/**
 * POST /api/newsletter/send
 * Compiles and sends The Daily Pooter morning intelligence brief.
 * Called by GitHub Actions cron or manually.
 *
 * Each recipient gets their own message — nobody is ever on another
 * subscriber's `to` line — carrying their own unsubscribe link. The response
 * lists every recipient that could not be sent to:
 *   200 all sent · 207 some failed · 502 none sent
 */
export async function POST(request: NextRequest) {
  // Auth — fails closed: no CRON_SECRET means nobody may send.
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const cronSecret = process.env.CRON_SECRET?.trim();
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  // Without these an email would go out with an unsubscribe link that cannot
  // work, so nothing is sent.
  if (!newsletterTokensConfigured()) {
    return NextResponse.json(
      { error: "NEWSLETTER_TOKEN_SECRET not configured (needs at least 32 characters)" },
      { status: 500 },
    );
  }
  const redis = getNewsletterRedis();
  if (!redis) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  let recipients: string[];
  try {
    const operatorRecipients = (process.env.NEWSLETTER_RECIPIENTS || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    recipients = await listNewsletterRecipients(redis, operatorRecipients);
  } catch (error) {
    // The list of who has unsubscribed is unreadable; sending anyway could
    // mail people who opted out.
    console.error("[newsletter] Could not read the subscriber list:", error);
    return NextResponse.json({ error: "Subscriber list unavailable" }, { status: 503 });
  }
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No recipients configured" }, { status: 400 });
  }

  try {
    // ── Gather data from our own APIs ──────────────────────────────
    const [feedRes, signalsRes, tradingRes] = await Promise.allSettled([
      fetch(`${SITE_URL}/api/feed?limit=20`, { next: { revalidate: 0 } }).then((r) => r.json()),
      fetch(`${SITE_URL}/api/signals/latest`, { next: { revalidate: 0 } }).then((r) => r.json()).catch(() => null),
      fetch(`${SITE_URL}/api/trading/performance`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
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

    // ── Build one email per recipient ─────────────────────────────
    // Same edition for everyone; the unsubscribe link is the recipient's own.
    const emails: OutgoingEmail[] = recipients.map((email) => {
      const unsubscribe = unsubscribeLinks(email);
      return {
        to: email,
        subject: `The Daily Pooter — ${today}`,
        html: buildEmailHtml({
          date: today,
          topStories,
          signals,
          trading,
          unsubscribeUrl: unsubscribe.page,
        }),
        headers: {
          "List-Unsubscribe": `<${unsubscribe.oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    // ── Send via Resend ───────────────────────────────────────────
    const report = await deliverIndividually(emails, {
      apiKey: resendApiKey,
      from: process.env.NEWSLETTER_FROM || "pooter <daily@pooter.world>",
      deadline: Date.now() + SEND_BUDGET_MS,
    });

    if (report.failures.length > 0) {
      console.error(
        `[newsletter] ${report.failures.length} of ${recipients.length} recipients not sent:`,
        summarizeFailures(report.failures),
      );
    }

    const body = {
      recipients: recipients.length,
      sent: report.sent,
      failed: report.failures.length,
      failures: report.failures,
    };
    if (report.sent === 0) {
      return NextResponse.json(
        { status: "failed", error: "Email send failed", ...body },
        { status: 502 },
      );
    }
    if (report.failures.length > 0) {
      return NextResponse.json({ status: "partial", ...body }, { status: 207 });
    }
    return NextResponse.json({ status: "sent", ...body });
  } catch (error) {
    console.error("[newsletter] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Failure reasons for the server log, with addresses masked: the full list
 * goes only to the authenticated caller, in the response.
 */
function summarizeFailures(failures: DeliveryFailure[]): Record<string, string[]> {
  const byReason: Record<string, string[]> = {};
  for (const failure of failures) {
    const at = failure.email.lastIndexOf("@");
    const masked = at > 0 ? `${failure.email[0]}***${failure.email.slice(at)}` : "***";
    (byReason[failure.error] ??= []).push(masked);
  }
  return byReason;
}

// ── Email template ──────────────────────────────────────────────────

interface EmailData {
  date: string;
  topStories: any[];
  signals: any;
  trading: any;
  /** This recipient's own unsubscribe page. */
  unsubscribeUrl: string;
}

function buildEmailHtml({ date, topStories, signals, trading, unsubscribeUrl }: EmailData): string {
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
      You are receiving this because this address is subscribed to The Daily Pooter.
      <a href="${escHtml(unsubscribeUrl)}" style="color: #8A8A8A; text-decoration: underline;">Unsubscribe</a>
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
