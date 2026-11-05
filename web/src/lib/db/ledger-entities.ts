// ledger_entities repo — non-MP entities in the Claim Ledger (migration 018).
// Readers: /ledger/maker/[entityId]. Writers: migrations/seeds only for now.

import { sql } from "../db";
import type { LedgerEntityKind } from "../ledger/types";

export interface LedgerEntity {
  id: string;
  kind: Exclude<LedgerEntityKind, "mp">;
  name: string;
  legalName: string | null;
  country: string | null;
  website: string | null;
  products: string[];
}

interface LedgerEntityRow {
  id: string;
  kind: LedgerEntity["kind"];
  name: string;
  legal_name: string | null;
  country: string | null;
  website: string | null;
  products: string[] | null;
}

function rowToEntity(row: LedgerEntityRow): LedgerEntity {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    legalName: row.legal_name,
    country: row.country,
    website: row.website,
    products: row.products ?? [],
  };
}

export async function getLedgerEntity(id: string): Promise<LedgerEntity | null> {
  const rows = await sql<LedgerEntityRow[]>`
    SELECT id, kind, name, legal_name, country, website, products
    FROM pooter.ledger_entities WHERE id = ${id}
  `;
  return rows[0] ? rowToEntity(rows[0]) : null;
}
