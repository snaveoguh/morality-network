// Domain-specific entity dictionary for enriched keyword detection
// Maps lowercase terms to entity metadata for tagging + tooltip enrichment

export interface KnownEntity {
  name: string;
  type: 'organization' | 'protocol' | 'person' | 'token' | 'chain' | 'government' | 'event';
  tags: string[];
}

export const KNOWN_ENTITIES: Record<string, KnownEntity> = {
  // ── Governments ──
  'congress': { name: 'US Congress', type: 'government', tags: ['governance', 'us'] },
  'us congress': { name: 'US Congress', type: 'government', tags: ['governance', 'us'] },
  'senate': { name: 'US Senate', type: 'government', tags: ['governance', 'us'] },
  'house of representatives': { name: 'US House', type: 'government', tags: ['governance', 'us'] },
  'parliament': { name: 'Parliament', type: 'government', tags: ['governance'] },
  'house of commons': { name: 'UK House of Commons', type: 'government', tags: ['governance', 'uk'] },
  'house of lords': { name: 'UK House of Lords', type: 'government', tags: ['governance', 'uk'] },
  'european parliament': { name: 'European Parliament', type: 'government', tags: ['governance', 'eu'] },
  'european commission': { name: 'European Commission', type: 'government', tags: ['governance', 'eu'] },
  'federal reserve': { name: 'Federal Reserve', type: 'government', tags: ['finance', 'us'] },
  'sec': { name: 'Securities and Exchange Commission', type: 'government', tags: ['regulation', 'us'] },
  'cftc': { name: 'CFTC', type: 'government', tags: ['regulation', 'us'] },
  'fca': { name: 'Financial Conduct Authority', type: 'government', tags: ['regulation', 'uk'] },
  'supreme court': { name: 'Supreme Court', type: 'government', tags: ['governance'] },
  'white house': { name: 'White House', type: 'government', tags: ['governance', 'us'] },
  'treasury': { name: 'Treasury', type: 'government', tags: ['finance', 'governance'] },
  'imf': { name: 'International Monetary Fund', type: 'organization', tags: ['finance'] },
  'world bank': { name: 'World Bank', type: 'organization', tags: ['finance'] },
  'united nations': { name: 'United Nations', type: 'organization', tags: ['governance'] },

  // ── DAOs ──
  'nouns dao': { name: 'Nouns DAO', type: 'organization', tags: ['dao', 'governance', 'nft'] },
  'nouns': { name: 'Nouns DAO', type: 'organization', tags: ['dao', 'governance', 'nft'] },
  'uniswap': { name: 'Uniswap', type: 'protocol', tags: ['defi', 'dao', 'governance'] },
  'aave': { name: 'Aave', type: 'protocol', tags: ['defi', 'dao', 'governance'] },
  'compound': { name: 'Compound', type: 'protocol', tags: ['defi', 'dao', 'governance'] },
  'makerdao': { name: 'MakerDAO', type: 'protocol', tags: ['defi', 'dao', 'governance'] },
  'maker': { name: 'MakerDAO', type: 'protocol', tags: ['defi', 'dao'] },
  'ens': { name: 'ENS', type: 'protocol', tags: ['dao', 'governance', 'identity'] },
  'ens dao': { name: 'ENS DAO', type: 'organization', tags: ['dao', 'governance'] },
  'gitcoin': { name: 'Gitcoin', type: 'protocol', tags: ['dao', 'governance', 'grants'] },
  'optimism': { name: 'Optimism', type: 'chain', tags: ['layer2', 'dao', 'governance'] },
  'arbitrum': { name: 'Arbitrum', type: 'chain', tags: ['layer2', 'dao', 'governance'] },
  'lido': { name: 'Lido', type: 'protocol', tags: ['defi', 'staking', 'dao'] },
  'safe': { name: 'Safe (Gnosis)', type: 'protocol', tags: ['dao', 'multisig'] },
  'curve': { name: 'Curve Finance', type: 'protocol', tags: ['defi', 'dao'] },
  'balancer': { name: 'Balancer', type: 'protocol', tags: ['defi', 'dao'] },
  'sushiswap': { name: 'SushiSwap', type: 'protocol', tags: ['defi', 'dao'] },
  'snapshot': { name: 'Snapshot', type: 'protocol', tags: ['dao', 'governance'] },

  // ── Chains & L2s ──
  'ethereum': { name: 'Ethereum', type: 'chain', tags: ['crypto', 'layer1'] },
  'bitcoin': { name: 'Bitcoin', type: 'chain', tags: ['crypto', 'layer1'] },
  'solana': { name: 'Solana', type: 'chain', tags: ['crypto', 'layer1'] },
  'polygon': { name: 'Polygon', type: 'chain', tags: ['crypto', 'layer2'] },
  'base': { name: 'Base', type: 'chain', tags: ['crypto', 'layer2'] },
  'avalanche': { name: 'Avalanche', type: 'chain', tags: ['crypto', 'layer1'] },
  'cosmos': { name: 'Cosmos', type: 'chain', tags: ['crypto', 'layer1'] },
  'polkadot': { name: 'Polkadot', type: 'chain', tags: ['crypto', 'layer1'] },
  'starknet': { name: 'Starknet', type: 'chain', tags: ['crypto', 'layer2', 'zk'] },
  'zksync': { name: 'zkSync', type: 'chain', tags: ['crypto', 'layer2', 'zk'] },
  'zcash': { name: 'Zcash', type: 'chain', tags: ['crypto', 'privacy'] },
  'monero': { name: 'Monero', type: 'chain', tags: ['crypto', 'privacy'] },

  // ── Tokens ──
  'usdc': { name: 'USDC', type: 'token', tags: ['stablecoin', 'defi'] },
  'usdt': { name: 'USDT (Tether)', type: 'token', tags: ['stablecoin', 'defi'] },
  'dai': { name: 'DAI', type: 'token', tags: ['stablecoin', 'defi'] },

  // ── Companies ──
  'coinbase': { name: 'Coinbase', type: 'organization', tags: ['crypto', 'exchange'] },
  'binance': { name: 'Binance', type: 'organization', tags: ['crypto', 'exchange'] },
  'blackrock': { name: 'BlackRock', type: 'organization', tags: ['finance', 'tradfi'] },
  'jpmorgan': { name: 'JPMorgan', type: 'organization', tags: ['finance', 'tradfi'] },
  'goldman sachs': { name: 'Goldman Sachs', type: 'organization', tags: ['finance', 'tradfi'] },
  'circle': { name: 'Circle', type: 'organization', tags: ['crypto', 'stablecoin'] },
  'consensys': { name: 'ConsenSys', type: 'organization', tags: ['crypto', 'infrastructure'] },
  'a16z': { name: 'Andreessen Horowitz', type: 'organization', tags: ['vc', 'crypto'] },
  'paradigm': { name: 'Paradigm', type: 'organization', tags: ['vc', 'crypto'] },
  'openai': { name: 'OpenAI', type: 'organization', tags: ['ai', 'tech'] },
  'anthropic': { name: 'Anthropic', type: 'organization', tags: ['ai', 'tech'] },
  'meta': { name: 'Meta', type: 'organization', tags: ['tech', 'social'] },
  'google': { name: 'Google', type: 'organization', tags: ['tech'] },
  'apple': { name: 'Apple', type: 'organization', tags: ['tech'] },
  'microsoft': { name: 'Microsoft', type: 'organization', tags: ['tech'] },
  'tesla': { name: 'Tesla', type: 'organization', tags: ['tech', 'finance'] },

  // ── Notable People (crypto/gov) ──
  'vitalik': { name: 'Vitalik Buterin', type: 'person', tags: ['crypto', 'ethereum'] },
  'vitalik buterin': { name: 'Vitalik Buterin', type: 'person', tags: ['crypto', 'ethereum'] },
  'satoshi': { name: 'Satoshi Nakamoto', type: 'person', tags: ['crypto', 'bitcoin'] },
  'gary gensler': { name: 'Gary Gensler', type: 'person', tags: ['regulation', 'sec'] },
  'elon musk': { name: 'Elon Musk', type: 'person', tags: ['tech', 'finance'] },

  // ── Concepts ──
  'defi': { name: 'DeFi', type: 'protocol', tags: ['defi', 'crypto'] },
  'nft': { name: 'NFT', type: 'protocol', tags: ['nft', 'crypto'] },
  'dao': { name: 'DAO', type: 'organization', tags: ['dao', 'governance'] },
  'stablecoin': { name: 'Stablecoin', type: 'token', tags: ['stablecoin', 'defi'] },
  'layer 2': { name: 'Layer 2', type: 'chain', tags: ['crypto', 'layer2'] },
  'zero knowledge': { name: 'Zero Knowledge', type: 'protocol', tags: ['crypto', 'zk', 'privacy'] },
  'zk rollup': { name: 'ZK Rollup', type: 'protocol', tags: ['crypto', 'zk', 'layer2'] },
};

/** Look up a term (case-insensitive) against the known entities dictionary */
export function lookupEntity(term: string): KnownEntity | null {
  return KNOWN_ENTITIES[term.toLowerCase()] || null;
}

/** Extract tags for a given identifier (URL, domain, keyword) */
export function deriveTagsFromIdentifier(identifier: string): string[] {
  const tags = new Set<string>();

  // Check known entities
  const known = lookupEntity(identifier);
  if (known) {
    known.tags.forEach(t => tags.add(t));
  }

  // URL-based tags
  try {
    const url = new URL(identifier);
    const host = url.hostname.replace(/^www\./, '');
    if (host.includes('gov') || host.includes('parliament')) tags.add('governance');
    if (host.includes('sec.gov') || host.includes('edgar')) tags.add('regulation');
    if (host.endsWith('.edu')) tags.add('education');
  } catch {
    // Not a URL
  }

  // Keyword-based tags
  const lower = identifier.toLowerCase();
  if (lower.includes('propos')) tags.add('governance');
  if (lower.includes('regulat')) tags.add('regulation');
  if (lower.includes('climate') || lower.includes('carbon')) tags.add('climate');
  if (lower.includes('health') || lower.includes('pharma')) tags.add('health');

  return Array.from(tags);
}
