import { NewsletterLinkAction } from "@/components/newsletter/NewsletterLinkAction";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Unsubscribe"),
  // The URL carries a personal token; keep it out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * /unsubscribe?token=... — where the footer link of every edition lands.
 * Opening the page changes nothing; the button posts to
 * /api/newsletter/unsubscribe.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-12 sm:py-20">
      <NewsletterLinkAction action="unsubscribe" token={token} />
    </main>
  );
}
