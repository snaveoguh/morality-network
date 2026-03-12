export function normalizeDaoIdentifier(dao: string): string {
  return dao.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function getDaoPredictionKey(dao: string): string {
  const normalized = normalizeDaoIdentifier(dao);
  if (normalized === "lil-nouns" || normalized === "lilnouns" || normalized === "lil-nouns-dao") {
    return "lil-nouns";
  }
  if (normalized === "nouns" || normalized === "nouns-dao") {
    return "nouns";
  }
  return normalized;
}

export function getPrimaryProposalEntityIdentifier(dao: string, proposalId: string): string {
  return `proposal:${normalizeDaoIdentifier(dao)}:${proposalId.trim()}`;
}

export function getProposalEntityIdentifiers(dao: string, proposalId: string): string[] {
  const normalized = normalizeDaoIdentifier(dao);
  const raw = dao.trim().toLowerCase();
  const pid = proposalId.trim();
  const predictionKey = getDaoPredictionKey(dao);

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

  if (predictionKey === "nouns") {
    identifiers.add(`nouns:${pid}`);
    identifiers.add(`nouns-${pid}`);
    identifiers.add(`proposal:nouns:${pid}`);
    identifiers.add(`proposal:nouns-${pid}`);
  }

  if (predictionKey === "lil-nouns") {
    identifiers.add(`lil-nouns:${pid}`);
    identifiers.add(`lil-nouns-${pid}`);
    identifiers.add(`proposal:lil-nouns:${pid}`);
    identifiers.add(`proposal:lil-nouns-${pid}`);
    identifiers.add(`lilnouns:${pid}`);
    identifiers.add(`lilnouns-${pid}`);
    identifiers.add(`proposal:lilnouns:${pid}`);
    identifiers.add(`proposal:lilnouns-${pid}`);
  }

  return [...identifiers];
}
