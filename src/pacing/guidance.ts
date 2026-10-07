import { PLAYER_ATTEMPTS_CLAUSE, PLAYER_REF, guidanceShared, objectiveLine, type AgencyPolicy, type Checkpoint } from "@engine/index";

export const GUIDANCE_HEADER = "Author's private direction for this scene, for steering only.";

export const GUIDANCE_SECRECY = "Never quote, paraphrase, summarise or mention anything in this note, and never write notes, brackets or stage directions into a reply.";

export const GUIDANCE_NOT_YET = "It says where the scene is heading, not what has happened: nothing in it is true until the chat shows it. "
  + "Bring it in as pressure from the world and the characters, one beat at a time, and never reveal what comes later or how the scene ends before it does. "
  + `A step in it that skips ahead in time or moves the party somewhere new waits until ${PLAYER_REF} chooses it.`;

export const GUIDANCE_PREAMBLE = `${GUIDANCE_HEADER} ${GUIDANCE_SECRECY} ${GUIDANCE_NOT_YET}`;

export interface MemberGuidanceLine {
  name: string;
  text: string;
}

export const memberGuidanceLine = (member: MemberGuidanceLine): string => `Direction for ${member.name} only: ${member.text.trim()}`;

export const composeGuidanceBlock = (
  checkpoint: Checkpoint | null | undefined, policy: AgencyPolicy, withObjective = false, member: MemberGuidanceLine | null = null, stretch: string | null = null,
): string => {
  const guidance = guidanceShared(checkpoint?.guidance).trim();
  const directed = [
    guidance,
    stretch ?? "",
    member?.text.trim() ? memberGuidanceLine(member) : "",
    withObjective && checkpoint?.objective?.trim() ? objectiveLine(checkpoint, policy) : "",
  ].filter(Boolean);
  return [
    ...(directed.length ? [GUIDANCE_PREAMBLE, ...directed] : []),
    policy.player_attempts_only ? PLAYER_ATTEMPTS_CLAUSE : "",
  ].filter(Boolean).join("\n");
};
