import { redirect } from "next/navigation";

// Bearometer lives at /signals; this keeps the brand name as a working URL.
export default function BearometerRedirect() {
  redirect("/signals");
}
