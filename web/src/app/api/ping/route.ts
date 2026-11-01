// Liveness probe for the start-script watchdog (scripts/start.mjs).
// No I/O: if this does not answer, the server process is stuck.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
