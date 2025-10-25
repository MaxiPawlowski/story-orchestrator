import type { NormalizedTalkControlReply } from "@utils/story-validator";
import type { TalkControlTrigger } from "@utils/story-schema";
import { getMessageTimeStamp, getContext } from "@services/STAPI";

interface MessageInjectionContext {
  reply: NormalizedTalkControlReply;
  checkpointId: string;
  eventType: TalkControlTrigger;
  charId: number;
  character: any;
  text: string;
  kind: "static" | "llm";
}

export class MessageInjector {
  async injectMessage(ctx: MessageInjectionContext): Promise<boolean> {
    const { chatMetadata, getThumbnailUrl, addOneMessage, saveChat, groupId, chat, eventSource, eventTypes } = getContext();

    const content = typeof ctx.text === "string" ? ctx.text.trim() : "";
    if (!content) {
      console.warn("[Story TalkControl] Reply text empty after generation", {
        memberId: ctx.reply.memberId,
        checkpointId: ctx.checkpointId,
        trigger: ctx.eventType,
      });
      return false;
    }

    const timestamp = getMessageTimeStamp();

    const message: Record<string, any> = {
      name: ctx.character.name ?? ctx.reply.memberId,
      is_user: false,
      is_system: false,
      send_date: timestamp,
      character_id: ctx.charId,
      force_avatar: `/thumbnail?type=avatar&file=${encodeURIComponent(ctx.character.avatar || "none")}`,
      mes: content,
      original_avatar: ctx.character.avatar,
      extra: {
        api: "storyOrchestrator",
        model: "talkControl",
        reason: `talkControl:${ctx.eventType}`,
        storyOrchestratorTalkControl: {
          kind: ctx.kind,
          checkpointId: ctx.checkpointId,
          event: ctx.eventType
        },
      },
      swipe_id: 0,
      swipes: [content],
      swipe_info: [
        {
          send_date: timestamp,
          gen_started: timestamp,
          gen_finished: timestamp,
          extra: {},
        },
      ],
    };

    if (groupId && ctx.character.avatar && ctx.character.avatar !== "none") {
      try {
        message.force_avatar = getThumbnailUrl("avatar", ctx.character.avatar);
      } catch (err) {
        console.warn("[Story TalkControl] Failed to resolve avatar thumbnail", err);
      }
    }

    chat.push(message);
    const messageId = chat.length - 1;
    (chatMetadata as any)["tainted"] = true;

    await eventSource.emit(eventTypes.MESSAGE_RECEIVED, messageId, "talkControl");
    addOneMessage(message);
    await eventSource.emit(eventTypes.CHARACTER_MESSAGE_RENDERED, messageId, "talkControl");
    await saveChat();

    console.log("[Story TalkControl] Injected reply", {
      memberId: ctx.reply.memberId,
      checkpointId: ctx.checkpointId,
      trigger: ctx.eventType,
      kind: ctx.kind,
    });

    return true;
  }

  pickStaticReplyText(reply: NormalizedTalkControlReply): string {
    const { substituteParams } = getContext();
    if (reply.content.kind !== "static") return "";

    const text = reply.content.text ?? "";
    const expanded = substituteParams(text);
    return (typeof expanded === "string" ? expanded : text).trim();
  }

  async generateLlmReply(reply: NormalizedTalkControlReply, charId: number): Promise<string> {
    const instruction = reply.content.kind === "llm" ? reply.content.instruction : undefined;
    if (!instruction) {
      console.warn("[Story TalkControl] LLM instruction missing", {
        memberId: reply.memberId,
      });
      return "";
    }

    const { generateQuietPrompt } = getContext();
    console.log("[Story TalkControl] Generating quiet prompt for reply", {
      memberId: reply.memberId,
    });

    try {
      const result = await generateQuietPrompt({
        quietPrompt: instruction,
        quietToLoud: false,
        quietName: reply.memberId,
        forceChId: charId,
        removeReasoning: true,
      });

      return result;
    } catch (err) {
      console.warn("[Story TalkControl] Quiet prompt generation failed", err);
      return "";
    }
  }
}
