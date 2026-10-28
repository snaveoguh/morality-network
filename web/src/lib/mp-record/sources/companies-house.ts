// Source: Companies House officer appointments — STUB.
//
// TODO(mp-record): implement once a free Companies House API key exists
// (COMPANIES_HOUSE_API_KEY; do not create one from automation). Plan:
//   1. GET https://api.company-information.service.gov.uk/search/officers?q=<name>
//      (HTTP basic auth, key as username) → candidate officer ids.
//   2. GET /officers/{officer_id}/appointments → appointments; store each as
//      an mp_directorships row (scope 'ch-officer:<id>', record id
//      '<company_number>:<role>:<appointed_on>'), raw response in mp_raw_fetches.
//   3. Propose an mp_source_links row (source 'companies_house') with the
//      evidence: name match, date_of_birth month/year, nationality,
//      correspondence address — and confidence 'high' ONLY when a published
//      date of birth for the MP corroborates. Name alone is never 'high'.
//   4. Nothing is public until a named human confirms the link
//      (mp_directorships_public joins confirmed links only). An LLM may help
//      rank candidates for the reviewer; it never confirms.
// Rate limit: 600 requests / 5 minutes per key.

export const COMPANIES_HOUSE_STATUS = "stub: needs COMPANIES_HOUSE_API_KEY" as const;

export function companiesHouseConfigured(): boolean {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
}

export async function ingestCompaniesHouse(): Promise<never> {
  throw new Error(`Companies House ingester not implemented (${COMPANIES_HOUSE_STATUS}). See TODO in sources/companies-house.ts.`);
}
