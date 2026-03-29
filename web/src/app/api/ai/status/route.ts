import { getProviderStatuses } from "@/lib/ai-router";

export const runtime = "nodejs";

/**
 * GET /api/ai/status — Show all configured AI providers, health, and usage stats.
 */
export async function GET() {
  const statuses = getProviderStatuses();
  const configured = statuses.filter((s) => s.configured);
  const healthy = configured.filter((s) => s.healthy);

  return Response.json({
    totalProviders: statuses.length,
    configured: configured.length,
    healthy: healthy.length,
    providers: statuses,
  });
}
