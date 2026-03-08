export function normalizeDaoIdentifier(dao: string): string {
  return dao.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function getDaoPredictionKey(dao: string): string {
  if (dao === "Lil Nouns") return "lil-nouns";
  if (dao === "Nouns DAO") return "nouns";
  return normalizeDaoIdentifier(dao);
}

export function getPrimaryProposalEntityIdentifier(dao: string, proposalId: string): string {
  return `proposal:${normalizeDaoIdentifier(dao)}:${proposalId.trim()}`;
}

export function getProposalEntityIdentifiers(dao: string, proposalId: string): string[] {
  const normalized = normalizeDaoIdentifier(dao);
  const raw = dao.trim().toLowerCase();
  const pid = proposalId.trim();

  const identifiers = new Set<string>([
    `${raw}:${pid}`,
    `${normalized}:${pid}`,
    `proposal:${raw}:${pid}`,
    `proposal:${normalized}:${pid}`,
    `${raw}-${pid}`,
    `${normalized}-${pid}`,
    `${raw}/${pid}`,
    `${normalized}/${pid}`,
    `proposals/${raw}/${pid}`,
    `proposals/${normalized}/${pid}`,
  ]);

  if (raw.includes("nouns") || normalized.includes("nouns")) {
    identifiers.add(`nouns:${pid}`);
    identifiers.add(`nouns-${pid}`);
    identifiers.add(`proposal:nouns:${pid}`);
    identifiers.add(`proposal:nouns-${pid}`);
  }

  return [...identifiers];
}
