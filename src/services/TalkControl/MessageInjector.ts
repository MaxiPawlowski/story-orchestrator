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

interface GenerateQuietPromptOptions {
  quietPrompt: string;
  quietToLoud?: boolean;
  quietName?: string;
  forceChId?: number;
  removeReasoning?: boolean;
}

export class MessageInjector {
  private enableContinuation = true;
  private maxContinuationAttempts = 2;
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
      messageId,
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
      let result = await generateQuietPrompt({
        quietPrompt: instruction,
        quietToLoud: false,
        quietName: reply.memberId,
        forceChId: charId,
        removeReasoning: true,
      });

      if (result && this.enableContinuation && this.isTruncatedText(result)) {
        const continuation = await this.continueQuietGeneration(
          result,
          generateQuietPrompt,
          reply,
          charId
        );
        if (continuation) {
          result = result + continuation;
        }
      }

      return result;
    } catch (err) {
      console.warn("[Story TalkControl] Quiet prompt generation failed", err);
      return "";
    }
  }

  private isTruncatedText(text: string): boolean {
    if (!text || !text.trim()) return false;

    const trimmed = text.trim();

    const endsWithPunctuation = /[.!?:;][\s"'`]*$/.test(trimmed);
    if (!endsWithPunctuation) {
      return true;
    }

    if (trimmed.length < 20) {
      return true;
    }

    const quoteCount = (trimmed.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      return true;
    }

    return false;
  }

  private async continueQuietGeneration(
    previousResponse: string,
    generateQuietPrompt: (options: GenerateQuietPromptOptions) => Promise<string>,
    reply: NormalizedTalkControlReply,
    charId: number
  ): Promise<string> {
    let fullResponse = "";

    for (let attempt = 0; attempt < this.maxContinuationAttempts; attempt++) {
      try {
        const continuationInstruction = `Continue your previous response. Complete it naturally without repeating what was already said:\n\nPrevious: ${previousResponse + fullResponse}`;

        const continued = await generateQuietPrompt({
          quietPrompt: continuationInstruction,
          quietToLoud: false,
          quietName: reply.memberId,
          forceChId: charId,
          removeReasoning: true,
        });

        if (!continued || !continued.trim()) {
          break;
        }

        fullResponse += continued;

        if (!this.isTruncatedText(previousResponse + fullResponse)) {
          break;
        }
      } catch (err) {
        break;
      }
    }

    return fullResponse;
  }

  public setContinuationOptions(enabled: boolean, maxAttempts?: number): void {
    this.enableContinuation = enabled;
    if (maxAttempts !== undefined) {
      this.maxContinuationAttempts = maxAttempts;
    }
  }
}
