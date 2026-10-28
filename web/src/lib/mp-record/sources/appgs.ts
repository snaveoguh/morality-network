// Source: Register of All-Party Parliamentary Groups — STUB.
//
// TODO(mp-record): the register is published as HTML editions at
// https://publications.parliament.uk/pa/cm/cmallparty/<yymmdd>/contents.htm,
// one page per group listing its officers (role + name as registered) and
// registrable benefits. Plan:
//   1. Fetch the latest edition's contents page, then each group page; store
//      every page body in mp_raw_fetches.
//   2. Parse officers into mp_appgs (scope 'appg-officer:<name as registered>',
//      record id '<group>:<role>', register_edition = edition date).
//   3. Names in the register are free text ("Sir James Cleverly"), so each
//      officer name gets an mp_source_links proposal (source 'appg') using the
//      same normalised exact-name rule as the EC ingester; a human confirms.
//   4. Benefits received by a group are the GROUP's, not the officer's: they
//      must never be summed into an MP's figures.

export const APPG_STATUS = "stub: HTML register parser not written" as const;

export async function ingestAppgs(): Promise<never> {
  throw new Error(`APPG ingester not implemented (${APPG_STATUS}). See TODO in sources/appgs.ts.`);
}
