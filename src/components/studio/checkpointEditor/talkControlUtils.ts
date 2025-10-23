import {
  type TalkControlMemberDraft,
  type TalkControlCheckpointDraft,
} from "@utils/checkpoint-studio";

export const cloneTalkControlMember = (member: TalkControlMemberDraft): TalkControlMemberDraft => ({
  memberId: member.memberId,
  enabled: member.enabled,
  probabilities: { ...(member.probabilities ?? {}) },
  cooldownTurns: member.cooldownTurns,
  maxPerTurn: member.maxPerTurn,
  maxCharsPerAuto: member.maxCharsPerAuto,
  sendAsQuiet: member.sendAsQuiet,
  forceSpeaker: member.forceSpeaker,
  autoReplies: member.autoReplies.map((reply) => ({ ...reply })),
});

export const cloneTalkControlCheckpoint = (checkpoint?: TalkControlCheckpointDraft): TalkControlCheckpointDraft => ({
  members: (checkpoint?.members ?? []).map(cloneTalkControlMember),
});

