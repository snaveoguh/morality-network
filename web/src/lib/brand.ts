export const BRAND_NAME =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Morality Network";

export const BRAND_DOMAIN =
  process.env.NEXT_PUBLIC_BRAND_DOMAIN?.trim() || "morality.network";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || `https://${BRAND_DOMAIN}`;

export function withBrand(title: string): string {
  return `${title} — ${BRAND_NAME}`;
}
