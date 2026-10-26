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

export const ASK_PLAYER_DIRECTION = `Turn to ${PLAYER_REF} in your own voice and ask them one thing about what was just said or shown, or how they are taking it; `
  + `keep it short, then stop and leave the answer to ${PLAYER_REF}.`;

export const ASK_PLAYER_TAIL = `End by asking ${PLAYER_REF} one thing in your own voice, then stop and leave the answer to ${PLAYER_REF}.`;

export const ONE_SHOT_SCOPE = "This direction is for this one reply and wins over the general pacing notes where they differ, "
  + `but never narrate ${PLAYER_REF}'s acts, words or feelings, and never ask ${PLAYER_REF} what they do.`;

export const oneShotDirectionText = (reply: { instruction?: string; ask_player?: boolean }): string => {
  const instruction = reply.instruction?.trim() ?? "";
  if (!reply.ask_player) return instruction;
  return instruction ? `${instruction} ${ASK_PLAYER_TAIL}` : ASK_PLAYER_DIRECTION;
};

export const leadLengthLine = (name: string, words: number): string =>
  `Length for ${name} only: keep this reply near ${words} words; say what changed and what it looks like now, and skip what the chat already holds.`;

export const SPOTLIGHT_DIRECTION = "Speak up now with what you notice, know or feel about this moment, in your own voice and briefly; "
  + `then stop, and never speak or decide for ${PLAYER_REF}.`;

export const REACTION_DIRECTION = "React briefly, in your own voice, to what just happened: one or two sentences that add your view or what you notice; "
  + `then stop and leave the next move to ${PLAYER_REF}.`;

export const oneShotDirectionLine = (member: MemberGuidanceLine): string => `Direction for ${member.name} only, this reply: ${member.text.trim()} ${ONE_SHOT_SCOPE}`;

export const composeGuidanceBlock = (
  checkpoint: Checkpoint | null | undefined, policy: AgencyPolicy, withObjective = false, member: MemberGuidanceLine | null = null, stretch: string | null = null,
  oneShot: MemberGuidanceLine | null = null, length: string | null = null,
): string => {
  const guidance = guidanceShared(checkpoint?.guidance).trim();
  const directed = [
    guidance,
    stretch ?? "",
    member?.text.trim() ? memberGuidanceLine(member) : "",
    oneShot?.text.trim() ? oneShotDirectionLine(oneShot) : "",
    length ?? "",
    withObjective && checkpoint?.objective?.trim() ? objectiveLine(checkpoint, policy) : "",
  ].filter(Boolean);
  return [
    ...(directed.length ? [GUIDANCE_PREAMBLE, ...directed] : []),
    policy.player_attempts_only ? PLAYER_ATTEMPTS_CLAUSE : "",
  ].filter(Boolean).join("\n");
};
