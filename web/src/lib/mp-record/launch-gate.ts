// MP Record launch gate (MP_RECORD_SPEC §12). The record is NOT public until
// a media solicitor signs off. Until MP_RECORD_LEGAL_SIGNOFF holds the
// sign-off reference, production hides /mp/* and /api/mp/* unless
// MP_RECORD_PREVIEW=true (staging only), and every page carries a banner
// and noindex.

export interface MpLaunchGate {
  /** Sign-off reference (date, firm, ref) — null while review is open. */
  signedOff: string | null;
  /** Whether /mp/* and /api/mp/* respond at all in this environment. */
  visible: boolean;
}

export const LEGAL_REVIEW_NOTICE =
  "Pre-launch: this record is pending legal review by a media solicitor and is not published. Do not cite it yet.";

export function mpLaunchGate(env: Record<string, string | undefined> = process.env): MpLaunchGate {
  const signedOff = env.MP_RECORD_LEGAL_SIGNOFF?.trim() || null;
  const preview = env.MP_RECORD_PREVIEW === "true";
  const production = env.NODE_ENV === "production";
  return { signedOff, visible: signedOff !== null || preview || !production };
}
