import { NextResponse } from "next/server";

const XCHAIN_IMG = "https://xchain.io/img/cards";
const EXTENSIONS = ["jpg", "png", "gif"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  if (!/^[A-Za-z0-9]+$/.test(asset)) {
    return new NextResponse("Bad asset name", { status: 400 });
  }

  try {
    for (const ext of EXTENSIONS) {
      const upstream = await fetch(`${XCHAIN_IMG}/${asset}.${ext}`, {
        next: { revalidate: 86400 },
      });

      if (upstream.ok) {
        const contentType =
          upstream.headers.get("content-type") || `image/${ext === "jpg" ? "jpeg" : ext}`;
        const body = await upstream.arrayBuffer();

        return new NextResponse(body, {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control": "public, max-age=86400, s-maxage=86400",
          },
        });
      }
    }

    return new NextResponse(null, { status: 404 });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
