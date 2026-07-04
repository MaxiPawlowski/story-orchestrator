import { subscribeToHostEvents, type HostSubscriptionEntry } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";

export class TurnBridge {
  private generationDepth = 0;
  private pendingBoundary = false;
  private lastRenderedAt = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly manager: RuntimeManager) {}

  start() {
    if (this.unsubscribe) return;
    const entries: HostSubscriptionEntry[] = [
      { eventName: "generation_started", handler: () => this.onGenerationStarted() },
      { eventName: "generation_ended", handler: () => void this.onGenerationFinished() },
      { eventName: "generation_stopped", handler: () => void this.onGenerationFinished() },
      { eventName: "message_received", handler: () => void this.onRenderedReply() },
      { eventName: "character_message_rendered", handler: () => void this.onRenderedReply() },
      { eventName: "message_swiped", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "message_edited", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "message_deleted", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "message_updated", handler: (messageId) => void this.onMutation(messageId) },
      { eventName: "chat_id_changed", handler: () => void this.manager.loadSelectedFromChat() },
      { eventName: "worldinfo_settings_updated", handler: () => this.manager.notify() },
      { eventName: "group_updated", handler: () => this.manager.notify() },
    ];
    this.unsubscribe = subscribeToHostEvents(entries);
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private onGenerationStarted() {
    this.generationDepth += 1;
  }

  private async onGenerationFinished() {
    this.generationDepth = Math.max(0, this.generationDepth - 1);
    if (!this.pendingBoundary || this.generationDepth > 0) return;
    this.pendingBoundary = false;
    await this.manager.commitBoundary();
  }

  private async onRenderedReply() {
    const now = Date.now();
    if (now - this.lastRenderedAt < 250) return;
    this.lastRenderedAt = now;
    this.pendingBoundary = true;
    await this.manager.fireAfterSpeak();
    if (this.generationDepth > 0) return;
    this.pendingBoundary = false;
    await this.manager.commitBoundary();
  }

  private async onMutation(value: unknown) {
    const messageId = typeof value === "number" ? value : Number(value);
    await this.manager.rollbackFromMessage(messageId);
  }
}
