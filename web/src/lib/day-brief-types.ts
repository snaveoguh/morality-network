// Shared between the server brief (lib/day-brief.ts) and the client widget.

export const BRIEF_TOPICS = [
  { id: "all", label: "Everything" },
  { id: "uk", label: "UK politics" },
  { id: "world", label: "World" },
  { id: "business", label: "Business" },
  { id: "tech", label: "Tech & science" },
  { id: "environment", label: "Environment" },
] as const;

export type BriefTopic = (typeof BRIEF_TOPICS)[number]["id"];

export interface BriefSource {
  title: string;
  source: string;
  link: string;
  pubDate: string;
}

export interface DayBrief {
  topic: BriefTopic;
  generatedAt: string;
  /** Stories from the last 24 hours the brief was built from. */
  storyCount: number;
  /** "ai": written by the model from cited headlines; "headlines": the top stories as listed. */
  mode: "ai" | "headlines";
  summary: string | null;
  points: Array<{ text: string; sources: BriefSource[] }>;
  suggestions: string[];
  /** Whether the ask box can answer (an AI provider is configured). */
  chatAvailable: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatAnswer {
  answer: string;
  sources: BriefSource[];
  /** False when no AI provider is configured. */
  available: boolean;
}
