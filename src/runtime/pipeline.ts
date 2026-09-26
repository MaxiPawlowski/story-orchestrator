import type { ExtractionHealth } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import type { ExtractionRuntimeState } from "./types";

// What the machine is doing right now, in one derived value the player surface can render calmly
// (spec addendum §Stall surfacing). A dead pipeline (no model, paused, error) must never look
// like a slow one, and a stall re-check must read as "catching up", not as silence.
export type PipelineState = "working" | "reading" | "stalled-rechecking" | "idle" | "not-configured" | "error";

/**
 * What the player can actually do about the state, in their own words — or nothing.
 * The state sentence says what the machine is doing; this says whether the player is being asked for
 * something. Queue depth, retries and error text stay in `detail`, which is author-grade.
 */
export type PipelineNextAction = "wait" | "retry" | "repair";

export const PIPELINE_ACTION_COPY: Record<PipelineNextAction, string> = {
  wait: "Waiting for the next reply.",
  retry: "Retrying.",
  repair: "Paused — open Repair.",
};

export interface PipelineStatus {
  state: PipelineState;
  text: string;
  detail: string | null;
  needsSetup: boolean;
  /** Null when there is genuinely nothing to ask of the player. */
  nextAction: PipelineNextAction | null;
  retryable?: true;
}

export const TRANSPORT_PLAYER_TEXT = "The memory model is not answering — the story will catch up when it does.";

export const pipelineAction = (status: PipelineStatus): string | null => (status.nextAction ? PIPELINE_ACTION_COPY[status.nextAction] : null);

/**
 * A generated draft is in flight. It is the one thing the machine does that the player
 * cannot see in the chat yet, and the plan's wording for it is "preparing the road ahead" — said only
 * while it is true, never as a permanent line about the future.
 */
export interface ExpansionActivity {
  generating: boolean;
}

export const expansionInFlight = (expansion: ExpansionRuntimeState): boolean =>
  Boolean(expansion.scheduler.inFlight) || Object.values(expansion.entries).some((entry) => entry.status === "queued" || entry.status === "generating");

export function derivePipelineStatus(extraction: ExtractionRuntimeState, expansion?: ExpansionActivity, health: ExtractionHealth | null = null): PipelineStatus {
  const problem = pipelineProblem(extraction, health);
  if (problem) return problem;
  if (expansion?.generating) {
    return { state: "working", text: "Preparing the road ahead…", detail: null, needsSetup: false, nextAction: "wait" };
  }
  if (extraction.scheduler.inFlight) return { state: "reading", text: "Reading the last few messages…", detail: null, needsSetup: false, nextAction: "wait" };
  if (extraction.scheduler.queueDepth > 0) return { state: "working", text: "Working through what just happened…", detail: null, needsSetup: false, nextAction: "wait" };
  return { state: "idle", text: "Following along.", detail: null, needsSetup: false, nextAction: "wait" };
}

function pipelineProblem(extraction: ExtractionRuntimeState, health: ExtractionHealth | null): PipelineStatus | null {
  const { settings, scheduler, reconciliationEvents } = extraction;
  if (scheduler.lastError) {
    return { state: "error", text: "The story stopped keeping up — something went wrong reading the scene.", detail: scheduler.lastError, needsSetup: false, nextAction: "wait" };
  }
  if (!settings.enabled) {
    return { state: "not-configured", text: "The story will not move on its own — turn that on in the extension settings.", detail: null, needsSetup: true, nextAction: "repair" };
  }
  if (!settings.profileId) {
    return { state: "not-configured", text: "Nothing is following the story yet — choose a memory model in the extension settings.", detail: null, needsSetup: true, nextAction: "repair" };
  }
  if (health?.kind === "config") {
    return {
      state: "not-configured",
      text: "Nothing is following the story — the memory model it used cannot be reached. Choose one in the extension settings.",
      detail: health.detail,
      needsSetup: true,
      nextAction: "repair",
    };
  }
  if (health?.kind === "transport") {
    return { state: "stalled-rechecking", text: TRANSPORT_PLAYER_TEXT, detail: health.detail, needsSetup: false, nextAction: "retry", retryable: true };
  }
  if (reconciliationEvents.some((event) => event.resolvedAt === null)) {
    return { state: "stalled-rechecking", text: "Catching up — re-checking recent scenes.", detail: null, needsSetup: false, nextAction: "retry" };
  }
  return null;
}
