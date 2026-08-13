import type { ExtractionRuntimeState } from "./types";

// What the machine is doing right now, in one derived value the player surface can render calmly
// (spec addendum §Stall surfacing). A dead pipeline (no model, paused, error) must never look
// like a slow one, and a stall re-check must read as "catching up", not as silence.
export type PipelineState = "working" | "reading" | "stalled-rechecking" | "idle" | "not-configured" | "error";

export interface PipelineStatus {
  state: PipelineState;
  text: string;
  detail: string | null;
  needsSetup: boolean;
}

export const PIPELINE_LIVE_STATES: PipelineState[] = ["working", "reading", "stalled-rechecking"];

export function derivePipelineStatus(extraction: ExtractionRuntimeState): PipelineStatus {
  const { settings, scheduler, reconciliationEvents } = extraction;
  if (scheduler.lastError) {
    return { state: "error", text: "The story stopped keeping up — something went wrong reading the scene.", detail: scheduler.lastError, needsSetup: true };
  }
  if (!settings.enabled) {
    return { state: "not-configured", text: "The story will not move on its own — turn that on in the extension settings.", detail: null, needsSetup: true };
  }
  if (!settings.profileId) {
    return { state: "not-configured", text: "Nothing is following the story yet — choose a memory model in the extension settings.", detail: null, needsSetup: true };
  }
  if (reconciliationEvents.some((event) => event.resolvedAt === null)) {
    return { state: "stalled-rechecking", text: "Catching up — re-checking recent scenes.", detail: null, needsSetup: false };
  }
  if (scheduler.inFlight) {
    return { state: "reading", text: "Reading the last few messages…", detail: null, needsSetup: false };
  }
  if (scheduler.queueDepth > 0) {
    return { state: "working", text: "Working through what just happened…", detail: null, needsSetup: false };
  }
  return { state: "idle", text: "Following along.", detail: null, needsSetup: false };
}
