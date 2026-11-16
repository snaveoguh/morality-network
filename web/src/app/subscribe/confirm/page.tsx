import { NewsletterLinkAction } from "@/components/newsletter/NewsletterLinkAction";
import { withBrand } from "@/lib/brand";

export const metadata = {
  title: withBrand("Confirm your subscription"),
  // The URL carries a personal token; keep it out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * /subscribe/confirm?token=... — where the link in the confirmation email
 * lands. Opening the page changes nothing; the button posts to
 * /api/newsletter/confirm.
 */
export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-12 sm:py-20">
      <NewsletterLinkAction action="confirm" token={token} />
    </main>
  );
}
