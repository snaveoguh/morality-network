import { StumbleView } from "@/components/stumble/StumbleView";
import { fetchStumbleContent } from "@/lib/stumble";

export async function AsyncStumble() {
  const initialItems = await fetchStumbleContent();
  return <StumbleView initialItems={initialItems} />;
}
