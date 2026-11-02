import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { verifyOperatorAuth } from "@/lib/operator-auth";
import { getArea } from "@/lib/coops/economy";
import { MODELS, STAGES, type Model, type Stage } from "@/lib/coops/types";
import { createCoop, listAllCoops, updateCoop, type CoopUpdate } from "@/lib/db/coop-pipeline";

// POST: a new co-op asks to join an area's tracker (from /coops/start).
//       Stored hidden; an operator publishes it.
// GET / PATCH: operator list and update (/coops/admin).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function count(value: unknown, max: number): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, { maxRequests: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // Honeypot: the form hides this field; bots fill it.
  if (text(body.company, 200)) return NextResponse.json({ ok: true });

  const area = text(body.area, 40);
  const areaDef = getArea(area);
  const name = text(body.name, 120);
  const model = text(body.model, 40) as Model;
  const stage = text(body.stage, 20) as Stage;
  const sector = text(body.sector, 80);
  const district = text(body.district, 80);
  const contactEmail = text(body.contactEmail, 200);
  const founders = count(body.founders, 10_000) ?? 0;
  let website = text(body.website, 200) || null;
  if (website && !/^https?:\/\//.test(website)) website = `https://${website}`;

  const problems: string[] = [];
  if (!areaDef) problems.push("area");
  if (name.length < 2) problems.push("name");
  if (!MODELS.includes(model)) problems.push("model");
  if (!["idea", "forming", "registered", "trading"].includes(stage)) problems.push("stage");
  if (!sector) problems.push("sector");
  if (district && !areaDef?.districts.some((d) => d.name === district)) problems.push("district");
  if (!EMAIL.test(contactEmail)) problems.push("contactEmail");
  if (body.consent !== true) problems.push("consent");
  if (problems.length) {
    return NextResponse.json({ error: "Check these fields", fields: problems }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Tracker storage is not configured" }, { status: 503 });
  }
  try {
    const slug = await createCoop({
      area,
      name,
      model,
      sector,
      district: district || null,
      summary: text(body.summary, 600),
      website,
      stage,
      founders,
      contactEmail,
    });
    return NextResponse.json({ ok: true, slug });
  } catch (err) {
    console.error("[coops] submission failed:", err);
    return NextResponse.json({ error: "Could not save. Try again later." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const denied = await verifyOperatorAuth(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ coops: await listAllCoops() });
  } catch (err) {
    console.error("[coops] operator list failed:", err);
    return NextResponse.json({ error: "Pipeline storage unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await verifyOperatorAuth(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const id = count(body?.id, Number.MAX_SAFE_INTEGER);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: CoopUpdate = {};
  if (body.stage !== undefined) {
    if (!STAGES.includes(body.stage)) return NextResponse.json({ error: "bad stage" }, { status: 400 });
    patch.stage = body.stage;
  }
  const figures = { members: 10_000_000, jobsFte: 100_000, supportPence: 1e12 } as const;
  for (const [key, max] of Object.entries(figures) as Array<[keyof typeof figures, number]>) {
    if (body[key] === undefined) continue;
    const value = count(body[key], max);
    if (value === undefined) return NextResponse.json({ error: `bad ${key}` }, { status: 400 });
    patch[key] = value;
  }
  if (body.fcaRegNo !== undefined) patch.fcaRegNo = text(body.fcaRegNo, 20) || null;
  if (typeof body.isPublic === "boolean") patch.isPublic = body.isPublic;
  if (body.note !== undefined) patch.note = text(body.note, 400);

  try {
    const ok = await updateCoop(id, patch);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    console.error("[coops] operator update failed:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
