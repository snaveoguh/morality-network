// MP Record launch gate (MP_RECORD_SPEC §12). The record is NOT public until
// a media solicitor signs off. Until MP_RECORD_LEGAL_SIGNOFF holds the
// sign-off reference, production hides /mp/* and /api/mp/* and every page
// carries a banner and noindex.
//
// Staging (MP_RECORD_PREVIEW=true) is still a public URL, so preview is
// token-gated: open any /mp page once with ?preview=<MP_RECORD_PREVIEW_TOKEN>
// to receive an httpOnly cookie. No token configured = no preview (fail
// closed). Enforced in middleware; this module stays edge-safe (no imports).

export interface MpLaunchGate {
  /** Sign-off reference (date, firm, ref) — null while review is open. */
  signedOff: string | null;
  /** Whether /mp/* and /api/mp/* may respond in this environment (preview still needs the token). */
  visible: boolean;
}

export const LEGAL_REVIEW_NOTICE =
  "Pre-launch: this record is pending legal review by a media solicitor and is not published. Do not cite it yet.";

export const MP_PREVIEW_COOKIE = "mp_preview";
export const MP_PREVIEW_PARAM = "preview";
const MIN_TOKEN_LENGTH = 24;

type Env = Record<string, string | undefined>;

export function mpLaunchGate(env: Env = process.env): MpLaunchGate {
  const signedOff = env.MP_RECORD_LEGAL_SIGNOFF?.trim() || null;
  const preview = env.MP_RECORD_PREVIEW === "true";
  const production = env.NODE_ENV === "production";
  return { signedOff, visible: signedOff !== null || preview || !production };
}

export function isMpRoute(pathname: string): boolean {
  return pathname === "/mp" || pathname.startsWith("/mp/") || pathname === "/api/mp" || pathname.startsWith("/api/mp/");
}

/** Length-independent comparison so the token can't be guessed byte by byte. */
function sameToken(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export type MpAccess = "open" | "deny" | "preview" | "grant-preview";

/**
 * Who may see an /mp route. "open": signed off, or not production.
 * "preview": staging visitor holding the cookie. "grant-preview": the
 * ?preview= token is correct — set the cookie. Everything else: "deny".
 */
export function mpRouteAccess(
  env: Env,
  presented: { cookie?: string | null; param?: string | null },
): MpAccess {
  const gate = mpLaunchGate(env);
  if (gate.signedOff !== null || env.NODE_ENV !== "production") return "open";
  if (env.MP_RECORD_PREVIEW !== "true") return "deny";
  const token = env.MP_RECORD_PREVIEW_TOKEN?.trim() ?? "";
  if (token.length < MIN_TOKEN_LENGTH) return "deny";
  if (presented.param && sameToken(presented.param, token)) return "grant-preview";
  if (presented.cookie && sameToken(presented.cookie, token)) return "preview";
  return "deny";
}
