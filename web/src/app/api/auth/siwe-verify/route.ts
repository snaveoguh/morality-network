/**
 * Legacy alias — this route was a byte-identical duplicate of
 * /api/auth/verify. Kept as a re-export so deployed clients that still POST
 * here keep working; new code should call /api/auth/verify.
 *
 * Segment config can't be re-exported (Next parses it statically), so the
 * values are declared here and must match ../verify/route.ts.
 */
export { POST } from "../verify/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
