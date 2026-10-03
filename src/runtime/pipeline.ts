import type { ExtractionHealth } from "@extraction/index";
import type { ExpansionRuntimeState } from "@generation/index";
import type { ExtractionRuntimeState } from "./types";

// What the machine is doing right now, in one derived value the player surface can render calmly
// (spec addendum §Stall surfacing). A dead pipeline (no model, paused, error) must never look
// like a slow one, and a stall re-check must read as "catching up", not as silence.
export type PipelineState = "working" | "reading" | "stalled-rechecking" | "idle" | "not-configured" | "error" | "complete";

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

export const HUD_COPY = {
  open: "Open the story",
  branchChip: "You went back: continue from here?",
  steppedBack: "stepped back",
  fallbackScene: "Current scene",
} as const;

const HUD_CHIP_LABELS: Partial<Record<PipelineState, string>> = {
  "stalled-rechecking": "catching up…",
  "not-configured": "needs setup",
  error: "not keeping up",
};

export const hudChipLabel = (state: PipelineState, steppedBack: boolean): string | null => (steppedBack ? HUD_COPY.steppedBack : HUD_CHIP_LABELS[state] ?? null);

export const hudTensionText = (level: string): string => `tension ${level}`;

export const playerPendingCount = (pending: ReadonlyArray<{ opening?: boolean }>): number => pending.filter((entry) => !entry.opening).length;

export const hudPendingText = (count: number): string => `${count} update${count === 1 ? "" : "s"} next turn`;

export const REPAIR_PLAYER_COPY = {
  memoryModel: "The story will not advance on its own until it is set up in the extension settings.",
  read: "The story will not advance on its own until this is fixed.",
  synthesis: "The story so far stops updating.",
  cast: "The story expects people who are not in this chat, so their scenes never arrive.",
  lore: "Background this story needs is not switched on in this chat, so it is not in play.",
  persona: "This story is written for a different player character than the one selected.",
  nothingMissing: "Nothing is missing.",
} as const;

export const mutedMembersText = (names: string[]): string =>
  `${names.join(", ")} ${names.length === 1 ? "is" : "are"} muted in this group, so the story cannot give them a turn.`;

export const TRANSPORT_PLAYER_TEXT ="The memory model is not answering — the story will catch up when it does.";

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

export const failoverDetail = (fallback: string): string => `Memory model unreachable, using ${fallback}`;

const lostPlace = (checkpointId: string): PipelineStatus =>
  ({ state: "error", text: "The story lost its place and cannot move on.", detail: `active checkpoint ${checkpointId} is not in the played graph`, needsSetup: false, nextAction: "wait" });

export function derivePipelineStatus(
  extraction: ExtractionRuntimeState, expansion?: ExpansionActivity, health: ExtractionHealth | null = null, ended = false, active: { id: string } | null = null,
  lostCheckpointId: string | null = null,
): PipelineStatus {
  if (lostCheckpointId) return lostPlace(lostCheckpointId);
  const status = baseStatus(extraction, expansion, health, ended, active);
  return health?.kind === "transport" && health.fallback && !status.detail ? { ...status, detail: failoverDetail(health.fallback) } : status;
}

function baseStatus(extraction: ExtractionRuntimeState, expansion: ExpansionActivity | undefined, health: ExtractionHealth | null, ended: boolean, active: { id: string } | null): PipelineStatus {
  if (ended) return { state: "complete", text: "The story has ended. You can keep playing on in the epilogue.", detail: null, needsSetup: false, nextAction: null };
  const problem = pipelineProblem(extraction, health, active?.id ?? null);
  if (problem) return problem;
  if (expansion?.generating) {
    return { state: "working", text: "Preparing the road ahead…", detail: null, needsSetup: false, nextAction: "wait" };
  }
  if (extraction.scheduler.inFlight) return { state: "reading", text: "Reading the last few messages…", detail: null, needsSetup: false, nextAction: "wait" };
  if (extraction.scheduler.queueDepth > 0) return { state: "working", text: "Working through what just happened…", detail: null, needsSetup: false, nextAction: "wait" };
  return { state: "idle", text: "Following along.", detail: null, needsSetup: false, nextAction: "wait" };
}

function pipelineProblem(extraction: ExtractionRuntimeState, health: ExtractionHealth | null, activeCheckpointId: string | null): PipelineStatus | null {
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
  if (health?.kind === "transport" && !health.fallback) {
    return { state: "stalled-rechecking", text: TRANSPORT_PLAYER_TEXT, detail: health.detail, needsSetup: false, nextAction: "retry", retryable: true };
  }
  const openHere = (event: { resolvedAt: string | null; checkpointId: string }) => event.resolvedAt === null && (activeCheckpointId === null || event.checkpointId === activeCheckpointId);
  if (reconciliationEvents.some(openHere)) {
    return { state: "stalled-rechecking", text: "Catching up — re-checking recent scenes.", detail: null, needsSetup: false, nextAction: "retry" };
  }
  return null;
}
