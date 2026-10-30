import type { BoundaryLogEntry, EngineState, NormalizedStory } from "@engine/index";
import { gateKeys } from "@engine/index";
import { lastChanges, type KeyChange } from "./boundaryDigest";
import { outgoingGateRows, qualityLabel, type GateRow } from "./gateReadout";
import type { SecretGridView } from "./whoKnows";

export const AUTHOR_SECTIONS = ["health", "state", "memory", "prompt", "proposals", "activity", "pipeline"] as const;
export type AuthorSectionId = (typeof AUTHOR_SECTIONS)[number];

export const AUTHOR_SECTION_LABELS: Record<AuthorSectionId, string> = {
  health: "Health", state: "State", memory: "Memory", prompt: "Prompt", proposals: "Proposals", activity: "Activity", pipeline: "Pipeline",
};

export const AUTHOR_SECTION_QUESTIONS: Record<AuthorSectionId, string> = {
  health: "Is this chat set up to play the story?",
  state: "What does the story believe right now?",
  memory: "What does the story remember, and who knows what?",
  prompt: "What will the next reply receive?",
  proposals: "What is waiting for your decision?",
  activity: "What happened, message by message?",
  pipeline: "What are the background workers doing?",
};

export const STATE_GROUPS = ["gates", "authored", "life", "clock", "faction", "compiled"] as const;
export type StateGroup = (typeof STATE_GROUPS)[number];

export const STATE_GROUP_LABELS: Record<StateGroup, string> = {
  gates: "Gates", authored: "Authored", life: "Character life", clock: "Clock", faction: "Factions", compiled: "Compiled",
};

const CLOCK_KEYS = new Set(["story_time", "story_day", "time_of_day", "time_part", "is_night"]);

export const stateGroupOf = (key: string, gates: ReadonlySet<string>): StateGroup => {
  if (gates.has(key)) return "gates";
  if (CLOCK_KEYS.has(key) || /^(cal|time_reached)_/.test(key)) return "clock";
  if (/^rep_/.test(key)) return "faction";
  if (/^(rel|mood|agenda|life)_/.test(key)) return "life";
  if (/^(codex|check|quest|heritage|liv|obs)_/.test(key)) return "compiled";
  return "authored";
};

export interface StateKeyMeta {
  label: string;
  group: StateGroup;
  changedAt?: KeyChange;
}

export interface ConsoleAuthorView {
  gates: GateRow[];
  keys: Record<string, StateKeyMeta>;
  secrets: SecretGridView | null;
}

export function consoleAuthorSlice(input: {
  story: NormalizedStory | null;
  state: EngineState | null;
  boundaryLog: readonly BoundaryLogEntry[];
  authorView: boolean;
  secrets?: SecretGridView | null;
}): ConsoleAuthorView | null {
  const { story, state } = input;
  if (!input.authorView || !story || !state) return null;
  const values = state.blackboard.values;
  const active = state.activeCheckpointId;
  const gates = new Set((story.outgoingByCheckpoint[active] ?? []).flatMap((transition) => gateKeys(transition.gate)));
  const changes = lastChanges(input.boundaryLog);
  const keys = Object.fromEntries([...new Set([...Object.keys(values), ...gates])].map((key) => [key, {
    label: qualityLabel(story, key), group: stateGroupOf(key, gates), ...(changes[key] ? { changedAt: changes[key] } : {}),
  }]));
  return { gates: outgoingGateRows(story, active, values), keys, secrets: input.secrets ?? null };
}

export interface ProposalCounts {
  curator: number;
  living: number;
  total: number;
}

export function pendingProposals(snapshot: {
  stagecraft?: { proposals?: ReadonlyArray<{ ops: ReadonlyArray<{ status?: string }> }> };
  living?: { author?: { proposals?: ReadonlyArray<{ status: string }> } | null } | null;
}): ProposalCounts {
  const curator = (snapshot.stagecraft?.proposals ?? []).filter((proposal) => proposal.ops.some((op) => op.status === "pending")).length;
  const living = (snapshot.living?.author?.proposals ?? []).filter((proposal) => proposal.status === "proposed").length;
  return { curator, living, total: curator + living };
}
