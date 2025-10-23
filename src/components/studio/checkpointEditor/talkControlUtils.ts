import {
  type TalkControlReplyDraft,
  type TalkControlCheckpointDraft,
} from "@utils/checkpoint-studio";

export const cloneTalkControlReply = (reply: TalkControlReplyDraft): TalkControlReplyDraft => ({
  memberId: reply.memberId,
  speakerId: reply.speakerId,
  enabled: reply.enabled,
  trigger: reply.trigger,
  probability: reply.probability,
  content: reply.content.kind === "static"
    ? { kind: "static", text: reply.content.text }
    : { kind: "llm", instruction: reply.content.instruction },
});

export const cloneTalkControlCheckpoint = (checkpoint?: TalkControlCheckpointDraft): TalkControlCheckpointDraft => ({
  replies: (checkpoint?.replies ?? []).map(cloneTalkControlReply),
});

