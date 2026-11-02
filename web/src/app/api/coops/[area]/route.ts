import { NextResponse } from "next/server";
import { getArea, getSnapshot } from "@/lib/coops/economy";
import { readPipeline } from "@/lib/coops/service";
import type { Society } from "@/lib/coops/types";

// Open data: the area's register snapshot plus its public pipeline.
// ?format=csv returns the register snapshot as CSV.

export const revalidate = 300;

const CSV_COLUMNS: Array<keyof Society> = [
  "regNo", "name", "form", "type", "sector", "sic", "postcode", "district",
  "lat", "lng", "registered", "deregistered", "status",
];

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request, { params }: { params: Promise<{ area: string }> }) {
  const { area: slug } = await params;
  const area = getArea(slug);
  const snapshot = getSnapshot(slug);
  if (!area || !snapshot) {
    return NextResponse.json({ error: "Unknown area" }, { status: 404 });
  }

  if (new URL(request.url).searchParams.get("format") === "csv") {
    const lines = [
      CSV_COLUMNS.join(","),
      ...snapshot.societies.map((s) => CSV_COLUMNS.map((c) => csvCell(s[c])).join(",")),
    ];
    return new NextResponse(`${lines.join("\n")}\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-co-op-register.csv"`,
      },
    });
  }

  const pipeline = await readPipeline(slug);
  return NextResponse.json({
    area,
    register: {
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
      count: snapshot.count,
      societies: snapshot.societies,
    },
    pipeline: { available: pipeline.available, coops: pipeline.coops },
  });
}
