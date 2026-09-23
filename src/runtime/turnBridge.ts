import { isHostGenerating, subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";
import { beginRun, type RunGuard } from "./runToken";

const FLUSH_POLL_MS = 300;
const FLUSH_POLL_MAX_MS = 60000;

export const NON_TURN_MESSAGE_TYPES: ReadonlySet<string> = new Set(["first_message", "extension"]);

export const isTurnMessageType = (type: unknown): boolean => typeof type !== "string" || !NON_TURN_MESSAGE_TYPES.has(type);

interface PendingBoundary {
  run: RunGuard;
}

export class TurnBridge {
  private pendingBoundary: PendingBoundary | null = null;
  private lastRenderedAt = 0;
  private readonly turnKeys = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly manager: RuntimeManager) {}

  start() {
    if (this.unsubscribe) return;
    const entries: HostSubscriptionEntry[] = [
      { eventName: "GENERATION_ENDED", handler: () => void this.flushPendingBoundary() },
      { eventName: "GENERATION_STOPPED", handler: () => void this.flushPendingBoundary() },
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
    this.cancelFlushPoll();
    this.pendingBoundary = null;
    this.turnKeys.clear();
    this.lastRenderedAt = 0;
  }

  private async onRenderedReply(type: unknown, messageId?: unknown) {
    if (!isTurnMessageType(type)) return;
    const now = Date.now();
    const id = typeof messageId === "number" ? messageId : Number(messageId);

    if (Number.isFinite(id)) {
      const key = String(id);
      if (this.turnKeys.has(key)) return;
      this.turnKeys.add(key);
    } else if (now - this.lastRenderedAt < 250) {
      return;
    }

    this.lastRenderedAt = now;
    const mine: PendingBoundary = { run: beginRun(this.manager.getOwnership()) };
    this.pendingBoundary = mine;
    await this.manager.fireAfterSpeak();
    if (!mine.run.stillOwns()) return;
    await this.flushPendingBoundary(mine);
  }

  private async flushPendingBoundary(expected?: PendingBoundary) {
    const mine = expected ?? this.pendingBoundary;
    if (!mine || this.pendingBoundary !== mine) return;
    if (!mine.run.stillOwns()) {
      this.pendingBoundary = null;
      this.cancelFlushPoll();
      return;
    }
    if (isHostGenerating()) {
      this.scheduleFlushPoll();
      return;
    }
    this.pendingBoundary = null;
    this.cancelFlushPoll();
    await this.manager.commitBoundary();
  }

  private scheduleFlushPoll() {
    if (this.flushTimer !== null) return;
    const startedAt = Date.now();
    const tick = () => {
      this.flushTimer = null;
      const mine = this.pendingBoundary;
      if (!mine) return;
      if (!mine.run.stillOwns() || !isHostGenerating()) {
        void this.flushPendingBoundary(mine);
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
    this.pendingBoundary = null;
    this.turnKeys.clear();
    this.lastRenderedAt = 0;
    await this.manager.loadSelectedFromChat();
  }

  private async onMutation(value: unknown, kind: "swipe" | "edit" | "delete" | "update") {
    const messageId = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(messageId)) {
      if (kind === "delete") {
        for (const key of this.turnKeys) {
          if (Number(key) >= messageId) this.turnKeys.delete(key);
        }
      } else {
        this.turnKeys.delete(String(messageId));
      }
    } else {
      this.turnKeys.clear();
    }
    await this.manager.rollbackFromMessage(messageId);
  }
}
