import { StumbleView } from "@/components/stumble/StumbleView";
import { fetchStumbleContent } from "@/lib/stumble";

export const revalidate = 0; // always fresh
export const maxDuration = 55;

export default async function StumblePage() {
  // Pre-fetch a batch of random content server-side
  const initialItems = await fetchStumbleContent();

  return <StumbleView initialItems={initialItems} />;
}
