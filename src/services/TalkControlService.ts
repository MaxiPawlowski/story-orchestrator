import type { NormalizedStory, NormalizedTalkControl } from "@utils/story-validator";
import { normalizeName } from "@utils/string";
import type { TalkControlTrigger } from "@utils/story-schema";
import { getContext } from "@services/STAPI";
import { subscribeToEventSource } from "@utils/event-source";
import { PLAYER_SPEAKER_ID } from "@constants/main";
import { storySessionStore } from "@store/storySessionStore";
import { CharacterResolver } from "./TalkControl/CharacterResolver";
import { MessageInjector } from "./TalkControl/MessageInjector";
import { ReplySelector, type PendingAction } from "./TalkControl/ReplySelector";

type TalkControlPhase = "before" | "after";

interface TalkControlEvent {
  id: number;
  type: TalkControlTrigger;
  checkpointId: string | null;
  metadata?: Record<string, unknown>;
}

interface TalkControlServiceOptions {
  story: NormalizedStory;
}

export class TalkControlService {
  private config: NormalizedTalkControl | undefined;
  private nextEventId = 1;
  private interceptSuppressDepth = 0;
  private selfDispatchDepth = 0;
  private generationActive = false;
  private flushScheduled = false;
  private lastChatId: string | null = null;
  private lastGroupSelected = false;
  private started = false;

  private readonly eventQueue: TalkControlEvent[] = [];
  private readonly listeners: Array<() => void> = [];
  private readonly characterResolver: CharacterResolver;
  private readonly messageInjector: MessageInjector;
  private readonly replySelector: ReplySelector;

  constructor(opts: TalkControlServiceOptions) {
    this.config = opts.story.talkControl;
    this.characterResolver = new CharacterResolver(opts.story);
    this.messageInjector = new MessageInjector();
    this.replySelector = new ReplySelector(this.config, this.characterResolver);
  }

  private beginInterceptSuppression = () => { this.interceptSuppressDepth += 1; };
  private endInterceptSuppression = () => { this.interceptSuppressDepth = Math.max(0, this.interceptSuppressDepth - 1); };
  private beginSelfDispatch = () => { this.selfDispatchDepth += 1; };
  private endSelfDispatch = () => { this.selfDispatchDepth = Math.max(0, this.selfDispatchDepth - 1); };
  private isStoryActive = () => Boolean(this.config);
  private isGroupActive = () => {
    const { groupId, characters } = getContext();
    return Boolean(groupId || (Array.isArray(characters) && characters.length > 0));
  };
  private isSuppressed = () => this.interceptSuppressDepth > 0;
  private isSelfDispatching = () => this.selfDispatchDepth > 0;
  private get activeCheckpointId(): string | null {
    return storySessionStore.getState().runtime.activeCheckpointKey ?? null;
  }

  private queueEvent(type: TalkControlTrigger, checkpointId: string | null, metadata?: Record<string, unknown>) {
    if (!this.config) return;
    this.eventQueue.push({ id: this.nextEventId++, type, checkpointId, metadata });
    console.log("[Story TalkControl] Queued event", { type, checkpointId, queueLength: this.eventQueue.length, metadata });
    this.scheduleFlush();
  }

  private nextPendingAction(): PendingAction | null {
    while (this.eventQueue.length) {
      const event = this.eventQueue.shift();
      if (!event) break;

      const action = this.replySelector.selectAction(event, this.activeCheckpointId);
      if (action) return action;
    }
    return null;
  }

  private async executeAction(action: PendingAction) {
    this.beginInterceptSuppression();
    this.beginSelfDispatch();

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
      if (!characterEntry) return;

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
      }
    } catch (err) {
      console.warn("[Story TalkControl] Action dispatch failed", err);
    } finally {
      this.endSelfDispatch();
      this.endInterceptSuppression();
    }
  }

  private async handleGenerateIntercept(_chat: unknown, _contextSize: number, abort: (immediate: boolean) => void, type: string) {
    console.log("[Story TalkControl] Intercept check", { type });

    if (!this.isStoryActive() || !this.isGroupActive() || this.isSuppressed() || type === "quiet") {
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
    if (this.flushScheduled) return;
    this.flushScheduled = true;

    const enqueue = typeof queueMicrotask === "function"
      ? queueMicrotask
      : (cb: () => void) => Promise.resolve().then(cb);

    enqueue(() => {
      this.flushScheduled = false;
      void this.flushPendingActions();
    });
  }

  private async flushPendingActions(): Promise<void> {
    if (!this.isStoryActive() || !this.isGroupActive() || this.generationActive || this.isSuppressed()) {
      return;
    }

    let guard = 0;
    let action = this.nextPendingAction();

    while (action && guard < 20) {
      guard += 1;

      try {
        console.log("[Story TalkControl] Dispatching queued action", {
          memberId: action.reply.memberId,
          trigger: action.event.type,
          checkpointId: action.checkpointId,
        });
        await this.executeAction(action);
      } catch (err) {
        console.warn("[Story TalkControl] Flush dispatch failed", err);
      }

      if (this.generationActive) {
        console.log("[Story TalkControl] Flush halted (generation restarted)", {
          pendingEvents: this.eventQueue.length
        });
        return;
      }

      action = this.nextPendingAction();
    }

    if (guard >= 20 && action) {
      console.warn("[Story TalkControl] Flush aborted after guard limit", {
        remainingEvents: this.eventQueue.length
      });
    }
  }

  private handleGenerationStarted = (type: string, _options: any, dryRun: boolean) => {
    const shouldIgnore = type === 'quiet' || dryRun === true || type === undefined;

    if (shouldIgnore) {
      console.log("[Story TalkControl] Ignoring generation start (quiet/dry run/undefined type)");
      return;
    }

    this.generationActive = true;
  };

  private handleGenerationSettled = () => {
    this.generationActive = false;
    this.scheduleFlush();
  };

  private onMessageReceived = (messageId: number, messageType?: string) => {
    if (!this.isStoryActive() || this.isSelfDispatching()) return;

    const { chat } = getContext();
    const message = chat[messageId];

    if (!message || message.is_system) return;
    if (message?.extra?.storyOrchestratorTalkControl) return;

    let speakerName: string;
    let speakerId: string;

    if (message.is_user) {
      speakerName = PLAYER_SPEAKER_ID;
      speakerId = PLAYER_SPEAKER_ID;
    } else {
      speakerName = message?.name ?? "";
      speakerId = normalizeName(speakerName);
    }

    this.queueEvent("afterSpeak", this.activeCheckpointId, { speakerId, speakerName, messageId, messageType });
  };

  private handleChatChanged = () => {
    const ctx = getContext();
    const chatId = ctx?.chatId?.toString().trim() || null;
    const groupSelected = Boolean(ctx?.groupId);

    if (this.lastChatId === chatId && this.lastGroupSelected === groupSelected) return;

    console.log("[Story TalkControl] Chat context changed", {
      from: { chatId: this.lastChatId, groupSelected: this.lastGroupSelected },
      to: { chatId, groupSelected },
    });

    this.lastChatId = chatId;
    this.lastGroupSelected = groupSelected;
    this.resetState();
  };

  private resetState() {
    console.log("[Story TalkControl] Resetting state");
    this.replySelector.resetStates();
    this.eventQueue.length = 0;
    this.generationActive = false;
    this.flushScheduled = false;
    this.interceptSuppressDepth = 0;
    this.selfDispatchDepth = 0;
    this.nextEventId = 1;
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

    const { eventSource, eventTypes } = getContext();
    this.started = true;

    this.listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: eventTypes.MESSAGE_RECEIVED,
      handler: this.onMessageReceived,
    }));

    this.listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: eventTypes.GENERATION_STARTED,
      handler: this.handleGenerationStarted,
    }));

    this.listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: eventTypes.GENERATION_STOPPED,
      handler: this.handleGenerationSettled,
    }));

    this.listeners.push(subscribeToEventSource({
      source: eventSource,
      eventName: eventTypes.GENERATION_ENDED,
      handler: this.handleGenerationSettled,
    }));

    const chatEvents = [
      eventTypes.CHAT_CHANGED,
      eventTypes.CHAT_CREATED,
      eventTypes.GROUP_CHAT_CREATED,
      eventTypes.CHAT_DELETED,
      eventTypes.GROUP_CHAT_DELETED,
    ].filter(Boolean);

    for (const ev of chatEvents) {
      this.listeners.push(subscribeToEventSource({
        source: eventSource,
        eventName: ev,
        handler: this.handleChatChanged,
      }));
    }

    this.handleChatChanged();
  }

  public dispose() {
    while (this.listeners.length) {
      const off = this.listeners.pop();
      try {
        off?.();
      } catch (err) {
        console.warn("[Story TalkControl] Failed to remove listener", err);
      }
    }

    this.started = false;
    this.resetState();
    this.config = undefined;
    this.lastChatId = null;
    this.lastGroupSelected = false;
  }
}
