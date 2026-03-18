import { fetchGovernanceSocialSignals } from "@/lib/governance";
import { GovernanceSocialList } from "@/components/proposals/GovernanceSocialList";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function AsyncGovernanceSocial() {
  const socialSignals = await withTimeout(fetchGovernanceSocialSignals(), 6000, []);
  return <GovernanceSocialList signals={socialSignals} />;
}
