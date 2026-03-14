import {
  type TalkControlReplyDraft,
} from "@utils/checkpoint-studio";

export const cloneTalkControlReply = (reply: TalkControlReplyDraft): TalkControlReplyDraft => ({
  ...reply,
  content: { ...reply.content },
});
