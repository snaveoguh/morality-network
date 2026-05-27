import type { AnySkill, SkillHandler } from "./types";
import { commentSkill } from "./comment";
import { swapSkill } from "./swap";
import { transferSkill } from "./transfer";
import { tipAgentSkill } from "./tip-agent";
import { wrapSkill } from "./wrap";

const skills = new Map<string, AnySkill>();

function register<P>(handler: SkillHandler<P>) {
  skills.set(handler.name, handler as unknown as AnySkill);
}

register(commentSkill);
register(swapSkill);
register(transferSkill);
register(tipAgentSkill);
register(wrapSkill);

export function getSkill(name: string): AnySkill | undefined {
  return skills.get(name);
}

export function listSkills(): string[] {
  return [...skills.keys()].sort();
}

export type { SkillContext, SkillHandler, SkillResult, AnySkill } from "./types";
export { BASE_ADDRESSES } from "./types";
