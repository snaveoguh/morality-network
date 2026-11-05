// Co-op tracker vocabulary. Stage and model keys match the CHECK constraints
// in web/migrations/017_coop_tracker.sql — change both together.

export const STAGES = ["idea", "forming", "registered", "trading", "reporting", "closed"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idea",
  forming: "Forming",
  registered: "Registered",
  trading: "Trading",
  reporting: "Reporting",
  closed: "Closed",
};

export const STAGE_MEANING: Record<Stage, string> = {
  idea: "A group has an idea and is testing it.",
  forming: "Founders are meeting, choosing rules and preparing to register.",
  registered: "Registered with the FCA as a society.",
  trading: "Selling goods or services, or providing its service.",
  reporting: "Has filed at least one annual return with the FCA.",
  closed: "Stopped trading or deregistered.",
};

export const MODELS = [
  "worker",
  "consumer",
  "producer",
  "multi-stakeholder",
  "community-benefit",
  "housing",
  "undecided",
] as const;
export type Model = (typeof MODELS)[number];

export const MODEL_LABEL: Record<Model, string> = {
  worker: "Worker co-op",
  consumer: "Consumer co-op",
  producer: "Producer co-op",
  "multi-stakeholder": "Multi-stakeholder co-op",
  "community-benefit": "Community benefit society",
  housing: "Housing co-op",
  undecided: "Not decided yet",
};

/** One society from the FCA register snapshot (scripts/build-coop-economy.mjs). */
export interface Society {
  regNo: string;
  name: string;
  form: string;
  type: string;
  sector: string;
  sic: string | null;
  postcode: string;
  district: string;
  /** English region, or the nation for Scotland, Wales and Northern Ireland. */
  region: string;
  country: string;
  lat: number;
  lng: number;
  registered: string | null;
  deregistered: string | null;
  status: string;
}

export interface EconomySnapshot {
  area: string;
  source: { name: string; url: string; file: string };
  fetchedAt: string;
  count: number;
  /** Societies on the UK register whose postcode could not be placed. */
  unplaced: number;
  societies: Society[];
}

/** A search hit from /api/coops/search: an active society anywhere in the UK. */
export type SocietyHit = Pick<Society, "regNo" | "name" | "type" | "sector" | "district" | "region" | "registered">;

export interface Town {
  name: string;
  lat: number;
  lng: number;
  /** Which side of the point the label sits; default centred above. */
  anchor?: "start" | "middle" | "end";
}

export interface Area {
  slug: string;
  name: string;
  /** How the area reads mid-sentence ("the UK"); defaults to name. */
  inName: string;
  authority: string;
  authorityNote: string;
  /** Local authority districts that make up the area. Empty = the whole UK. */
  districts: Array<{ name: string; county: string }>;
  /** Labels for the dot map. */
  towns: Town[];
}

/** A co-op in the development pipeline (pooter.coop_pipeline), public fields only. */
export interface PipelineCoop {
  slug: string;
  area: string;
  name: string;
  model: Model;
  sector: string;
  district: string | null;
  summary: string;
  website: string | null;
  stage: Stage;
  fcaRegNo: string | null;
  founders: number;
  members: number;
  jobsFte: number;
  supportPence: number;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineEvent {
  at: string;
  stage: Stage;
  members: number;
  jobsFte: number;
  supportPence: number;
  note: string;
}
