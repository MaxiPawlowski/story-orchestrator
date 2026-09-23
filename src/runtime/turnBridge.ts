import { getContext, isHostGenerating, subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";
import { beginRun, type RunGuard } from "./runToken";

const FLUSH_POLL_MS = 300;
const FLUSH_POLL_MAX_MS = 60000;

export const NON_TURN_MESSAGE_TYPES: ReadonlySet<string> = new Set(["first_message", "extension"]);

export const CONTINUE_MESSAGE_TYPES: ReadonlySet<string> = new Set(["continue", "appendFinal"]);

export const isTurnMessageType = (type: unknown): boolean => typeof type !== "string" || !NON_TURN_MESSAGE_TYPES.has(type);

export const hostMessageId = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

const keyMessageId = (key: string) => Number(key.split(":")[0]);

const continueStamp = (messageId: number): string => {
  const message = (getContext().chat as Array<{ gen_finished?: unknown; mes?: unknown }> | undefined)?.[messageId];
  const finished = message?.gen_finished;
  if (finished !== undefined && finished !== null) return String(finished instanceof Date ? finished.getTime() : finished);
  return `len${typeof message?.mes === "string" ? message.mes.length : 0}`;
};

interface PendingBoundary {
  run: RunGuard;
  messageId: number | null;
  ready: boolean;
}

export class TurnBridge {
  private pending: PendingBoundary[] = [];
  private draining = false;
  private lastRenderedAt = 0;
  private readonly turnKeys = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly manager: RuntimeManager) {}

  start() {
    if (this.unsubscribe) return;
    const entries: HostSubscriptionEntry[] = [
      { eventName: "GENERATION_ENDED", handler: () => void this.flushPending() },
      { eventName: "GENERATION_STOPPED", handler: () => void this.flushPending() },
      { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => void this.onRenderedReply(type, messageId) },
      { eventName: "CHARACTER_MESSAGE_RENDERED", handler: (messageId, type) => void this.onRenderedReply(type, messageId) },
      { eventName: "MESSAGE_SWIPED", handler: (messageId) => void this.onMutation(messageId, "swipe") },
      { eventName: "MESSAGE_EDITED", handler: (messageId) => void this.onMutation(messageId, "edit") },
      { eventName: "MESSAGE_DELETED", handler: (messageId) => void this.onMutation(messageId, "delete") },
      { eventName: "MESSAGE_UPDATED", handler: (messageId) => void this.onMutation(messageId, "update") },
      { eventName: "CHAT_CHANGED", handler: () => void this.onChatChanged() },
      { eventName: "WORLDINFO_SETTINGS_UPDATED", handler: () => this.manager.notify() },
      { eventName: "GROUP_UPDATED", handler: () => this.manager.notify() },
    ];
    this.unsubscribe = subscribeToHostEvents(entries);
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.reset();
  }

  private reset() {
    this.cancelFlushPoll();
    this.pending = [];
    this.turnKeys.clear();
    this.lastRenderedAt = 0;
  }

  private async onRenderedReply(type: unknown, messageId?: unknown) {
    if (!isTurnMessageType(type)) return;
    const now = Date.now();
    const id = hostMessageId(messageId);

    if (id !== null) {
      const key = typeof type === "string" && CONTINUE_MESSAGE_TYPES.has(type) ? `${id}:${continueStamp(id)}` : String(id);
      if (this.turnKeys.has(key)) return;
      this.turnKeys.add(key);
    } else if (now - this.lastRenderedAt < 250) {
      return;
    }

    this.lastRenderedAt = now;
    const mine: PendingBoundary = { run: beginRun(this.manager.getOwnership()), messageId: id, ready: false };
    this.pending.push(mine);
    await this.manager.fireAfterSpeak();
    if (!mine.run.stillOwns()) {
      this.pending = this.pending.filter((entry) => entry !== mine);
      return;
    }
    mine.ready = true;
    await this.flushPending();
  }

  private async flushPending() {
    this.pending = this.pending.filter((entry) => entry.run.stillOwns());
    if (this.draining || !this.pending[0]?.ready) {
      if (this.pending.length === 0) this.cancelFlushPoll();
      return;
    }
    if (isHostGenerating()) {
      this.scheduleFlushPoll();
      return;
    }
    this.cancelFlushPoll();
    this.draining = true;
    try {
      while (this.pending[0]?.ready) {
        const next = this.pending.shift()!;
        if (!next.run.stillOwns()) continue;
        await this.manager.commitBoundary(next.messageId ?? undefined);
      }
    } finally {
      this.draining = false;
    }
  }

  private scheduleFlushPoll() {
    if (this.flushTimer !== null) return;
    const startedAt = Date.now();
    const tick = () => {
      this.flushTimer = null;
      if (this.pending.length === 0) return;
      if (!isHostGenerating() || !this.pending.every((entry) => entry.run.stillOwns())) {
        void this.flushPending();
        return;
      }
      if (Date.now() - startedAt >= FLUSH_POLL_MAX_MS) return;
      this.flushTimer = setTimeout(tick, FLUSH_POLL_MS);
    };
    this.flushTimer = setTimeout(tick, FLUSH_POLL_MS);
  }

  private cancelFlushPoll() {
    if (this.flushTimer === null) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private async onChatChanged() {
    this.reset();
    await this.manager.loadSelectedFromChat();
  }

  private async onMutation(value: unknown, kind: "swipe" | "edit" | "delete" | "update") {
    const messageId = hostMessageId(value);
    if (messageId === null) {
      this.turnKeys.clear();
      return;
    }
    for (const key of this.turnKeys) {
      const keyed = keyMessageId(key);
      if (kind === "delete" ? keyed >= messageId : keyed === messageId) this.turnKeys.delete(key);
    }
    await this.manager.rollbackFromMessage(messageId);
  }
}
