import { PLAYER_ATTEMPTS_CLAUSE, guidanceShared, objectiveLine, type AgencyPolicy, type Checkpoint } from "@engine/index";

export const GUIDANCE_HEADER = "Scene direction:";

export interface MemberGuidanceLine {
  name: string;
  text: string;
}

export const memberGuidanceLine = (member: MemberGuidanceLine): string => `Direction for ${member.name} only: ${member.text.trim()}`;

export const composeGuidanceBlock = (checkpoint: Checkpoint | null | undefined, policy: AgencyPolicy, withObjective = false, member: MemberGuidanceLine | null = null): string => {
  const guidance = guidanceShared(checkpoint?.guidance).trim();
  return [
    guidance ? `${GUIDANCE_HEADER} ${guidance}` : "",
    member?.text.trim() ? memberGuidanceLine(member) : "",
    withObjective && checkpoint?.objective?.trim() ? objectiveLine(checkpoint, policy) : "",
    policy.player_attempts_only ? PLAYER_ATTEMPTS_CLAUSE : "",
  ].filter(Boolean).join("\n");
};
