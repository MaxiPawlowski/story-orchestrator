import { isHostGenerating, subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";

const FLUSH_POLL_MS = 300;
const FLUSH_POLL_MAX_MS = 60000;

export class TurnBridge {
  private pendingBoundary = false;
  private lastRenderedAt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly manager: RuntimeManager) {}

  start() {
    if (this.unsubscribe) return;
    const entries: HostSubscriptionEntry[] = [
      { eventName: "GENERATION_ENDED", handler: () => void this.flushPendingBoundary() },
      { eventName: "GENERATION_STOPPED", handler: () => void this.flushPendingBoundary() },
      { eventName: "MESSAGE_RECEIVED", handler: () => void this.onRenderedReply() },
      { eventName: "CHARACTER_MESSAGE_RENDERED", handler: () => void this.onRenderedReply() },
      { eventName: "MESSAGE_SWIPED", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "MESSAGE_EDITED", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "MESSAGE_DELETED", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "MESSAGE_UPDATED", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "CHAT_CHANGED", handler: () => void this.onChatChanged() },
      { eventName: "WORLDINFO_SETTINGS_UPDATED", handler: () => this.manager.notify() },
      { eventName: "GROUP_UPDATED", handler: () => this.manager.notify() },
    ];
    this.unsubscribe = subscribeToHostEvents(entries);
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelFlushPoll();
    this.pendingBoundary = false;
  }

  private async onRenderedReply() {
    const now = Date.now();
    if (now - this.lastRenderedAt < 250) return;
    this.lastRenderedAt = now;
    this.pendingBoundary = true;
    await this.manager.fireAfterSpeak();
    await this.flushPendingBoundary();
  }

  private async flushPendingBoundary() {
    if (!this.pendingBoundary) return;
    if (isHostGenerating()) {
      this.scheduleFlushPoll();
      return;
    }
    this.pendingBoundary = false;
    this.cancelFlushPoll();
    await this.manager.commitBoundary();
  }

  private scheduleFlushPoll() {
    if (this.flushTimer !== null) return;
    const startedAt = Date.now();
    const tick = () => {
      this.flushTimer = null;
      if (!this.pendingBoundary) return;
      if (!isHostGenerating()) {
        void this.flushPendingBoundary();
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
    this.cancelFlushPoll();
    this.pendingBoundary = false;
    await this.manager.loadSelectedFromChat();
  }

  private async onMutation(value: unknown) {
    const messageId = typeof value === "number" ? value : Number(value);
    await this.manager.rollbackFromMessage(messageId);
  }
}
