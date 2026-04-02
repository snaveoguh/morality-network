import { NextResponse } from "next/server";
import { getIndexerBackendUrl } from "@/lib/server/indexer-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BACKEND_TIMEOUT_MS = 10_000;

function buildMarketplacePath(slug: string[]): string | null {
  if (slug.length === 0) {
    return "/api/v1/marketplace/orders";
  }

  if (slug.length === 1) {
    return `/api/v1/marketplace/orders/${encodeURIComponent(slug[0])}`;
  }

  if (
    slug.length === 2 &&
    (slug[1] === "fill" || slug[1] === "cancel")
  ) {
    return `/api/v1/marketplace/orders/${encodeURIComponent(slug[0])}/${slug[1]}`;
  }

  return null;
}

function buildProxyHeaders(request: Request): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const secret = process.env.INDEXER_WORKER_SECRET?.trim();
  if (secret) {
    headers.set("authorization", `Bearer ${secret}`);
  }

  return headers;
}

async function toNextResponse(response: Response): Promise<NextResponse> {
  const body = await response.text();
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("cache-control", "no-store, max-age=0");

  return new NextResponse(body, {
    status: response.status,
    headers,
  });
}

async function proxyMarketplaceRequest(
  request: Request,
  slug: string[],
  method: "GET" | "POST",
): Promise<NextResponse> {
  const backendUrl = getIndexerBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: "Indexer backend URL is not configured" },
      { status: 503 },
    );
  }

  const path = buildMarketplacePath(slug);
  if (!path) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(path, `${backendUrl}/`);
  url.search = new URL(request.url).search;

  try {
    const body = method === "GET" ? undefined : await request.text();
    const response = await fetch(url.toString(), {
      method,
      headers: buildProxyHeaders(request),
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });

    return await toNextResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Marketplace backend request failed",
      },
      { status: 502 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await params;
  return proxyMarketplaceRequest(request, slug, "GET");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await params;
  return proxyMarketplaceRequest(request, slug, "POST");
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug = [] } = await params;
  return proxyMarketplaceRequest(request, slug, "POST");
}
