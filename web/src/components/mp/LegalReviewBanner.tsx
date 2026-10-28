// Visible launch-gate flag (MP_RECORD_SPEC §12): shown on every MP Record
// page until the media solicitor's sign-off reference is configured.

import { LEGAL_REVIEW_NOTICE, mpLaunchGate } from "@/lib/mp-record/launch-gate";

export function LegalReviewBanner() {
  const gate = mpLaunchGate();
  if (gate.signedOff) return null;
  return (
    <div role="status" className="mb-6 border-2 border-[var(--accent-red)] p-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-red)]">
        Legal review open
      </p>
      <p className="mt-1 font-body-serif text-sm text-[var(--ink)]">{LEGAL_REVIEW_NOTICE}</p>
    </div>
  );
}
