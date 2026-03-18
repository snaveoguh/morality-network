import "server-only";

const DEFAULT_TIMEOUT_MS = 10_000;

function firstDefined(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function getIndexerBackendUrl(): string | null {
  const url = firstDefined(
    process.env.INDEXER_BACKEND_URL,
    process.env.ARCHIVE_BACKEND_URL,
    process.env.SCANNER_BACKEND_URL,
  );

  // Strip trailing slashes AND literal \n characters (common Vercel env var artifact)
  return url ? url.replace(/\\n/g, "").replace(/\/$/, "") : null;
}

export function hasIndexerBackend(): boolean {
  return getIndexerBackendUrl() !== null;
}

export async function fetchIndexerJson<T>(
  path: string,
  init: (RequestInit & { timeoutMs?: number }) | undefined = undefined,
): Promise<T> {
  const baseUrl = getIndexerBackendUrl();
  if (!baseUrl) {
    throw new Error("Indexer backend URL is not configured");
  }

  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = new URL(path, `${baseUrl}/`);
  const response = await fetch(url.toString(), {
    ...init,
    ...(init?.method && init.method !== "GET"
      ? { cache: "no-store" as const }
      : { next: { revalidate: init?.cache === "no-store" ? 0 : 60 } }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Indexer ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  return (await response.json()) as T;
}
