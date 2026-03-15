// ─── Agent Core — Barrel Exports ───────────────────────────────────────────

export type {
  Agent,
  AgentSnapshot,
  AgentStatus,
  AgentMessage,
  AgentMessageMeta,
  AgentMessageSender,
  MessageHandler,
} from "./types";
export { messageBus } from "./bus";
export { agentRegistry } from "./registry";
export { Store, type StoreOptions } from "./store";
export { POOTER_SOUL_V1, MORALITY_AXES, getAgentSoulSummary } from "./soul";
export {
  remember,
  recall,
  forget,
  recallAll,
  countByScope,
  buildMemoryContext,
  type MemoryEntry,
} from "./memory";
export {
  learnFromUrl,
  batchLearn,
  getKnowledgeStats,
  buildKnowledgeContext,
  type LearnResult,
  type KnowledgeStats,
} from "./knowledge";
export {
  runSelfLearn,
  runPipeline,
  type SelfLearnResult,
  type SelfLearnSummary,
} from "./self-learn";
