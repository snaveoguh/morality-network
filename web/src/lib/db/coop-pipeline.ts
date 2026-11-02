// Co-op pipeline repo. Schema: web/migrations/017_coop_tracker.sql.
// Public reads never select contact_email and only return is_public rows.
// Every write to a co-op's stage or figures appends a coop_pipeline_events row.

import { sql } from "../db";
import type { Model, PipelineCoop, PipelineEvent, Stage } from "../coops/types";

interface CoopRow {
  slug: string;
  area: string;
  name: string;
  model: Model;
  sector: string;
  district: string | null;
  summary: string;
  website: string | null;
  stage: Stage;
  fca_reg_no: string | null;
  founders: number;
  members: number;
  jobs_fte: string;
  support_pence: string;
  created_at: Date;
  updated_at: Date;
}

export interface OperatorCoop extends PipelineCoop {
  id: number;
  contactEmail: string;
  isPublic: boolean;
}

function toCoop(row: CoopRow): PipelineCoop {
  return {
    slug: row.slug,
    area: row.area,
    name: row.name,
    model: row.model,
    sector: row.sector,
    district: row.district,
    summary: row.summary,
    website: row.website,
    stage: row.stage,
    fcaRegNo: row.fca_reg_no,
    founders: row.founders,
    members: row.members,
    jobsFte: Number(row.jobs_fte),
    supportPence: Number(row.support_pence),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const PUBLIC_COLUMNS = sql`
  slug, area, name, model, sector, district, summary, website, stage,
  fca_reg_no, founders, members, jobs_fte, support_pence, created_at, updated_at
`;

export async function listPublicCoops(area: string): Promise<PipelineCoop[]> {
  const rows = await sql<CoopRow[]>`
    SELECT ${PUBLIC_COLUMNS} FROM pooter.coop_pipeline
    WHERE area = ${area} AND is_public
    ORDER BY created_at
  `;
  return rows.map(toCoop);
}

export async function getPublicCoop(
  slug: string,
): Promise<{ coop: PipelineCoop; events: PipelineEvent[] } | null> {
  const [row] = await sql<Array<CoopRow & { id: string }>>`
    SELECT id, ${PUBLIC_COLUMNS} FROM pooter.coop_pipeline
    WHERE slug = ${slug} AND is_public
  `;
  if (!row) return null;
  const events = await sql<
    Array<{ at: Date; stage: Stage; members: number; jobs_fte: string; support_pence: string; note: string }>
  >`
    SELECT at, stage, members, jobs_fte, support_pence, note
    FROM pooter.coop_pipeline_events
    WHERE coop_id = ${row.id}
    ORDER BY at DESC
  `;
  return {
    coop: toCoop(row),
    events: events.map((e) => ({
      at: e.at.toISOString(),
      stage: e.stage,
      members: e.members,
      jobsFte: Number(e.jobs_fte),
      supportPence: Number(e.support_pence),
      note: e.note,
    })),
  };
}

export async function listAllCoops(): Promise<OperatorCoop[]> {
  const rows = await sql<Array<CoopRow & { id: string; contact_email: string; is_public: boolean }>>`
    SELECT id, contact_email, is_public, ${PUBLIC_COLUMNS} FROM pooter.coop_pipeline
    ORDER BY is_public, created_at DESC
  `;
  return rows.map((row) => ({
    ...toCoop(row),
    id: Number(row.id),
    contactEmail: row.contact_email,
    isPublic: row.is_public,
  }));
}

export interface NewCoop {
  area: string;
  name: string;
  model: Model;
  sector: string;
  district: string | null;
  summary: string;
  website: string | null;
  stage: Stage;
  founders: number;
  contactEmail: string;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "co-op"
  );
}

/** Insert a submission (hidden until an operator publishes it). Returns its slug. */
export async function createCoop(input: NewCoop): Promise<string> {
  const base = slugify(input.name);
  return sql.begin(async (tx) => {
    const taken = await tx<Array<{ slug: string }>>`
      SELECT slug FROM pooter.coop_pipeline WHERE slug = ${base} OR slug LIKE ${`${base}-%`}
    `;
    const used = new Set(taken.map((t) => t.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

    const [row] = await tx<Array<{ id: string }>>`
      INSERT INTO pooter.coop_pipeline
        (slug, area, name, model, sector, district, summary, website, stage, founders, members, contact_email)
      VALUES
        (${slug}, ${input.area}, ${input.name}, ${input.model}, ${input.sector}, ${input.district},
         ${input.summary}, ${input.website}, ${input.stage}, ${input.founders}, ${input.founders},
         ${input.contactEmail})
      RETURNING id
    `;
    await tx`
      INSERT INTO pooter.coop_pipeline_events (coop_id, stage, members, jobs_fte, support_pence, note)
      VALUES (${row.id}, ${input.stage}, ${input.founders}, 0, 0, 'Joined the tracker')
    `;
    return slug;
  });
}

export interface CoopUpdate {
  stage?: Stage;
  members?: number;
  jobsFte?: number;
  supportPence?: number;
  fcaRegNo?: string | null;
  isPublic?: boolean;
  note?: string;
}

/** Operator update. Figure or stage changes append an event; publishing alone does not. */
export async function updateCoop(id: number, patch: CoopUpdate): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [current] = await tx<
      Array<{ stage: Stage; members: number; jobs_fte: string; support_pence: string; fca_reg_no: string | null; is_public: boolean }>
    >`
      SELECT stage, members, jobs_fte, support_pence, fca_reg_no, is_public
      FROM pooter.coop_pipeline WHERE id = ${id} FOR UPDATE
    `;
    if (!current) return false;

    const next = {
      stage: patch.stage ?? current.stage,
      members: patch.members ?? current.members,
      jobsFte: patch.jobsFte ?? Number(current.jobs_fte),
      supportPence: patch.supportPence ?? Number(current.support_pence),
      fcaRegNo: patch.fcaRegNo === undefined ? current.fca_reg_no : patch.fcaRegNo,
      isPublic: patch.isPublic ?? current.is_public,
    };

    await tx`
      UPDATE pooter.coop_pipeline SET
        stage = ${next.stage}, members = ${next.members}, jobs_fte = ${next.jobsFte},
        support_pence = ${next.supportPence}, fca_reg_no = ${next.fcaRegNo},
        is_public = ${next.isPublic}, updated_at = NOW()
      WHERE id = ${id}
    `;

    const figuresChanged =
      next.stage !== current.stage ||
      next.members !== current.members ||
      next.jobsFte !== Number(current.jobs_fte) ||
      next.supportPence !== Number(current.support_pence);
    if (figuresChanged || patch.note) {
      await tx`
        INSERT INTO pooter.coop_pipeline_events (coop_id, stage, members, jobs_fte, support_pence, note)
        VALUES (${id}, ${next.stage}, ${next.members}, ${next.jobsFte}, ${next.supportPence}, ${patch.note ?? ""})
      `;
    }
    return true;
  });
}
