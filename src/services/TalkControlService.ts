import type { NormalizedStory, NormalizedTalkControl } from "@utils/story-validator";
import { normalizeName } from "@utils/string";
import type { TalkControlTrigger } from "@utils/story-schema";
import { getContext } from "@services/STAPI";
import { storySessionStore } from "@store/storySessionStore";
import { CharacterResolver } from "./TalkControl/CharacterResolver";
import { DispatchPipeline } from "./TalkControl/DispatchPipeline";
import { MessageInjector } from "./TalkControl/MessageInjector";
import { ReplySelector, type PendingAction } from "./TalkControl/ReplySelector";
import { subscribeWithRetainedChatSessionBridge } from "./runtime/chatSessionSubscription";
import {
  type ChatSessionBridgeEvent,
  type ChatSessionContextSnapshot,
  type ChatSessionGenerationSnapshot,
  type ChatSessionReceivedMessageEvent,
  getChatSessionBridgeSnapshot,
} from "@controllers/chatSessionBridge";

type TalkControlPhase = "before" | "after";

interface TalkControlServiceOptions {
  story: NormalizedStory;
}

export class TalkControlService {
  private config: NormalizedTalkControl | undefined;
  private lastChatId: string | null = null;
  private lastGroupSelected = false;
  private started = false;
  private unsubscribeBridge: (() => void) | null = null;

  private readonly pipeline = new DispatchPipeline();
  private readonly characterResolver: CharacterResolver;
  private readonly messageInjector: MessageInjector;
  private readonly replySelector: ReplySelector;

  constructor(opts: TalkControlServiceOptions) {
    this.config = opts.story.talkControl;
    this.characterResolver = new CharacterResolver(opts.story);
    this.messageInjector = new MessageInjector();
    this.replySelector = new ReplySelector(this.config, this.characterResolver);
  }

  private isStoryActive = () => Boolean(this.config);
  private isGroupActive = () => {
    const { groupId, characters } = getContext();
    return Boolean(groupId || characters.length > 0);
  };
  private get activeCheckpointId(): string | null {
    return storySessionStore.getState().runtime.activeCheckpointKey ?? null;
  }

  private queueEvent(type: TalkControlTrigger, checkpointId: string | null, metadata?: Record<string, unknown>) {
    if (!this.config) return;
    this.pipeline.enqueue(type, checkpointId, metadata);
    this.scheduleFlush();
  }

  private nextPendingAction(): PendingAction | null {
    return this.pipeline.shiftPending((event) => this.replySelector.selectAction(event, this.activeCheckpointId));
  }

  private async executeAction(action: PendingAction) {
    this.pipeline.beginDispatch();

    try {
      if (!this.isGroupActive()) {
        console.warn("[Story TalkControl] Skipped action (group not active)", {
          memberId: action.reply.memberId,
          checkpointId: action.checkpointId,
          trigger: action.event.type,
        });
        return;
      }

      console.log("[Story TalkControl] Executing action", {
        memberId: action.reply.memberId,
        checkpointId: action.checkpointId,
        trigger: action.event.type,
      });

      const characterEntry = this.characterResolver.resolveCharacter(action.reply);
      if (!characterEntry) {
        return;
      }

      let text = "";
      let kind: "static" | "llm" = "static";

      if (action.reply.content.kind === "static") {
        text = this.messageInjector.pickStaticReplyText(action.reply);
        kind = "static";
      } else {
        text = await this.messageInjector.generateLlmReply(action.reply, characterEntry.id);
        kind = "llm";
      }

      if (!text) {
        console.warn("[Story TalkControl] Reply text empty", {
          memberId: action.reply.memberId,
          checkpointId: action.checkpointId,
        });
        return;
      }

      const dispatched = await this.messageInjector.injectMessage({
        reply: action.reply,
        checkpointId: action.checkpointId,
        eventType: action.event.type,
        charId: characterEntry.id,
        character: characterEntry.character,
        text,
        kind,
      });

      if (dispatched) {
        action.state.lastActionTurn = action.state.actionTurnStamp;
        action.state.actionsThisTurn += 1;
        action.state.totalTriggerCount += 1;

        const speakerName = characterEntry.character?.name ?? action.reply.memberId;
        const speakerId = normalizeName(speakerName);

        this.queueEvent("afterSpeak", action.checkpointId, {
          speakerId,
          speakerName,
          isSelfDispatched: true
        });
      }
    } catch (err) {
      console.warn("[Story TalkControl] Action dispatch failed", err);
    } finally {
      this.pipeline.endDispatch();
    }
  }

  private async handleGenerateIntercept(_chat: unknown, _contextSize: number, abort: (immediate: boolean) => void, type: string) {
    console.log("[Story TalkControl] Intercept check", { type });

    if (!this.isStoryActive() || !this.isGroupActive() || !this.pipeline.canIntercept(type)) {
      return;
    }

    const action = this.nextPendingAction();
    if (!action) return;

    console.log("[Story TalkControl] Intercept aborting host generation", {
      memberId: action.reply.memberId,
      trigger: action.event.type,
      checkpointId: action.checkpointId,
    });

    try {
      abort(true);
    } catch (err) {
      console.warn("[Story TalkControl] Abort threw", err);
    }

    await this.executeAction(action);
  }

  private scheduleFlush(): void {
    this.pipeline.scheduleFlush(() => {
      void this.flushPendingActions();
    });
  }

  private async flushPendingActions(): Promise<void> {
    try {
      if (!this.isStoryActive() || !this.isGroupActive() || !this.pipeline.canFlush()) {
        return;
      }

      let guard = 0;
      let action = this.nextPendingAction();

      while (action && guard < 20) {
        guard += 1;

        try {
          await this.executeAction(action);
        } catch (err) {
          console.warn("[Story TalkControl] Flush dispatch failed", err);
        }

        if (this.pipeline.isGenerationActive()) {
          return;
        }

        action = this.nextPendingAction();
      }

      if (guard >= 20 && action) {
        console.warn("[Story TalkControl] Flush aborted after guard limit");
      }
    } finally {
      this.pipeline.completeFlush();
      if (this.isStoryActive() && this.isGroupActive() && this.pipeline.canFlush() && this.pipeline.hasQueuedEvents()) {
        this.scheduleFlush();
      }
    }
  }

  private handleGenerationStarted = (generation: ChatSessionGenerationSnapshot) => {
    const shouldIgnore = generation.type === "quiet" || generation.dryRun === true || generation.type == null;

    if (shouldIgnore) {
      return;
    }

    this.pipeline.markGenerationStarted();
  };

  private handleGenerationSettled = () => {
    this.pipeline.markGenerationSettled();
    this.scheduleFlush();
  };

  private onMessageReceived = (message: ChatSessionReceivedMessageEvent) => {
    if (!this.isStoryActive()) {
      return;
    }

    if (message.isSystem) {
      return;
    }

    if (this.pipeline.isSelfDispatching()) {
      return;
    }

    this.queueEvent("afterSpeak", this.activeCheckpointId, {
      speakerId: message.speakerId,
      speakerName: message.speakerName,
      messageId: message.messageId,
      messageType: message.messageType,
      isSelfDispatched: message.isSelfDispatched,
    });
  };

  private handleChatChanged = (chat: ChatSessionContextSnapshot) => {
    if (this.lastChatId === chat.chatId && this.lastGroupSelected === chat.groupChatSelected) return;

    this.lastChatId = chat.chatId;
    this.lastGroupSelected = chat.groupChatSelected;
    this.resetState();
  };

  private handleBridgeEvent = (event: ChatSessionBridgeEvent) => {
    switch (event.type) {
      case "message-received":
        this.onMessageReceived(event.message);
        break;
      case "generation-started":
        this.handleGenerationStarted(event.generation);
        break;
      case "generation-stopped":
      case "generation-ended":
        this.handleGenerationSettled();
        break;
      case "chat":
        this.handleChatChanged(event.chat);
        break;
      default:
        break;
    }
  };

  private stopBridgeSubscription() {
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = null;
  }

  private resetState() {
    this.replySelector.resetStates();
    this.pipeline.reset();
  }

  public getInterceptor() {
    return this.handleGenerateIntercept.bind(this);
  }

  public setCheckpoint(checkpointId: string | null, options?: { emitEnter?: boolean }) {
    if (checkpointId && options?.emitEnter !== false) {
      this.queueEvent("onEnter", checkpointId);
    }
  }

  public notifyArbiterPhase(phase: TalkControlPhase) {
    if (!this.activeCheckpointId) return;
    const type = phase === "before" ? "beforeArbiter" : "afterArbiter";
    this.queueEvent(type, this.activeCheckpointId);
  }

  public notifyAfterSpeak(speakerName?: string) {
    if (!this.activeCheckpointId) return;
    const norm = speakerName ? normalizeName(speakerName) : "";
    this.queueEvent("afterSpeak", this.activeCheckpointId, { speakerId: norm, speakerName });
  }

  public updateTurn(turn: number) {
    if (!Number.isFinite(turn)) return;
    this.replySelector.updateTurn(turn);
  }

  public start() {
    if (this.started) return;
    this.started = true;
    this.unsubscribeBridge = subscribeWithRetainedChatSessionBridge(this.handleBridgeEvent, "[Story TalkControl]");
    this.handleChatChanged(getChatSessionBridgeSnapshot().chat);
  }

  public dispose() {
    this.stopBridgeSubscription();

    this.started = false;
    this.resetState();
    this.config = undefined;
    this.lastChatId = null;
    this.lastGroupSelected = false;
  }
}
