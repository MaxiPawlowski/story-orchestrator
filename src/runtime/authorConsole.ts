import type { BoundaryLogEntry, EngineState, NormalizedStory } from "@engine/index";
import { gateKeys } from "@engine/index";
import { lastChanges, type KeyChange } from "./boundaryDigest";
import { railroadView, type RailroadView } from "./railroadView";
import { outgoingGateRows, qualityLabel, type GateRow } from "./gateReadout";
import { buildSecretGrid, type SecretGridInputs, type SecretGridView } from "./whoKnows";
import { buildStoryRecord, openItems, recordLabel, type StoryRecordRow } from "./storyRecord";
import type { RuntimeExtras } from "./types";

export const AUTHOR_SECTIONS = ["health", "state", "memory", "prompt", "proposals", "activity", "record", "pipeline"] as const;
export type AuthorSectionId = (typeof AUTHOR_SECTIONS)[number];

export const AUTHOR_SECTION_LABELS: Record<AuthorSectionId, string> = {
  health: "Health", state: "State", memory: "Memory", prompt: "Prompt", proposals: "Proposals", activity: "Activity", record: "Record", pipeline: "Pipeline",
};

export const AUTHOR_SECTION_QUESTIONS: Record<AuthorSectionId, string> = {
  health: "Is this chat set up to play the story?",
  state: "What does the story believe right now?",
  memory: "What does the story remember, and who knows what?",
  prompt: "What will the next reply receive?",
  proposals: "What is waiting for your decision?",
  activity: "What happened, message by message?",
  record: "What happened, why, who heard, and what is still open?",
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

export interface RecordView {
  rows: Array<StoryRecordRow & { label: string }>;
  open: string[];
}

export interface ConsoleAuthorView {
  gates: GateRow[];
  keys: Record<string, StateKeyMeta>;
  secrets: SecretGridView | null;
  railroad: RailroadView | null;
  record: RecordView | null;
}

export interface ConsoleSources {
  boundaryLog: readonly BoundaryLogEntry[];
  extras: { ui: { authorView: boolean } } & Partial<Pick<RuntimeExtras, "recap" | "effects" | "echoes" | "rumors">>;
  secretGrid?: SecretGridInputs | null;
  recordOn?: boolean;
}

const recordOf = (story: NormalizedStory, sources: ConsoleSources): RecordView | null => {
  if (sources.recordOn === false) return null;
  const rows = buildStoryRecord({
    story, log: sources.boundaryLog, refs: sources.extras.recap?.refs ?? [], ledger: sources.extras.effects?.ledger ?? [],
    echoes: sources.extras.echoes ?? null, rumors: sources.extras.rumors ?? null, roster: (story.roster ?? []).map((member) => member.id),
  });
  return { rows: rows.map((row) => ({ ...row, label: recordLabel(story, row) })), open: openItems(rows) };
};

const grid = (inputs: SecretGridInputs | null | undefined): SecretGridView | null =>
  (inputs ? buildSecretGrid(inputs.secrets, inputs.knowledge, inputs.members) : null);

export function consoleAuthorSlice(story: NormalizedStory | null, state: EngineState | null, sources: ConsoleSources): ConsoleAuthorView | null {
  if (!sources.extras.ui.authorView || !story || !state) return null;
  const values = state.blackboard.values;
  const active = state.activeCheckpointId;
  const gates = new Set((story.outgoingByCheckpoint[active] ?? []).flatMap((transition) => gateKeys(transition.gate)));
  const changes = lastChanges(sources.boundaryLog);
  const keys = Object.fromEntries([...new Set([...Object.keys(values), ...gates])].map((key) => [key, {
    label: qualityLabel(story, key), group: stateGroupOf(key, gates), ...(changes[key] ? { changedAt: changes[key] } : {}),
  }]));
  const railroad = railroadView(sources.boundaryLog);
  return {
    gates: outgoingGateRows(story, active, values), keys, secrets: grid(sources.secretGrid), railroad: railroad.living || railroad.quietRuns ? railroad : null,
    record: recordOf(story, sources),
  };
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
