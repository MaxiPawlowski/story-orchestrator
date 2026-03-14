import type { TalkControlTrigger } from "@utils/story-schema";
import type { PendingAction } from "./ReplySelector";

export interface TalkControlEvent {
  id: number;
  type: TalkControlTrigger;
  checkpointId: string | null;
  metadata?: Record<string, unknown>;
}

type FlushState = "idle" | "scheduled" | "running";

export class DispatchPipeline {
  private nextEventId = 1;
  private suppressDepth = 0;
  private selfDispatchDepth = 0;
  private generationState: "idle" | "host-generating" = "idle";
  private flushState: FlushState = "idle";
  private readonly eventQueue: TalkControlEvent[] = [];

  enqueue(type: TalkControlTrigger, checkpointId: string | null, metadata?: Record<string, unknown>) {
    const event: TalkControlEvent = {
      id: this.nextEventId++,
      type,
      checkpointId,
      metadata,
    };
    this.eventQueue.push(event);
    return event;
  }

  shiftPending(selectAction: (event: TalkControlEvent) => PendingAction | null): PendingAction | null {
    while (this.eventQueue.length) {
      const event = this.eventQueue.shift();
      if (!event) break;
      const action = selectAction(event);
      if (action) return action;
    }
    return null;
  }

  markGenerationStarted() {
    this.generationState = "host-generating";
  }

  markGenerationSettled() {
    this.generationState = "idle";
  }

  isGenerationActive() {
    return this.generationState === "host-generating";
  }

  hasQueuedEvents() {
    return this.eventQueue.length > 0;
  }

  beginDispatch() {
    this.suppressDepth += 1;
    this.selfDispatchDepth += 1;
  }

  endDispatch() {
    this.selfDispatchDepth = Math.max(0, this.selfDispatchDepth - 1);
    this.suppressDepth = Math.max(0, this.suppressDepth - 1);
  }

  isInterceptSuppressed() {
    return this.suppressDepth > 0;
  }

  isSelfDispatching() {
    return this.selfDispatchDepth > 0;
  }

  canIntercept(type: string) {
    return type !== "quiet" && !this.isInterceptSuppressed();
  }

  canFlush() {
    return !this.isGenerationActive() && !this.isInterceptSuppressed();
  }

  scheduleFlush(run: () => void) {
    if (this.flushState !== "idle") return;
    this.flushState = "scheduled";
    queueMicrotask(() => {
      if (this.flushState !== "scheduled") return;
      this.flushState = "running";
      run();
    });
  }

  completeFlush() {
    this.flushState = "idle";
  }

  reset() {
    this.nextEventId = 1;
    this.suppressDepth = 0;
    this.selfDispatchDepth = 0;
    this.generationState = "idle";
    this.flushState = "idle";
    this.eventQueue.length = 0;
  }
}
