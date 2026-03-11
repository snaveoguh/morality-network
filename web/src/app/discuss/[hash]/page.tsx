import { LiveRoom } from "@/components/discuss/LiveRoom";

interface DiscussRoomPageProps {
  params: Promise<{ hash: string }>;
}

export default async function DiscussRoomPage({ params }: DiscussRoomPageProps) {
  const { hash } = await params;

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="py-12 text-center font-body-serif text-sm italic text-[var(--ink-faint)]">
          Invalid room hash.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <LiveRoom entityHash={hash} />
    </main>
  );
}
