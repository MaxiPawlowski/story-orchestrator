import { parseStoryOrThrow, type BlackboardSnapshot, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import type { NeighbourRow } from "@memory/neighbours";
import { provenance } from "@memory/provenance";
import type { MemoryEntry } from "@memory/types";
import { readContext, renderSharedReadPrompt, runningTotals } from "./contract";
import { readMemoryParts, type ReadMemory } from "./readMemory";
import { deriveScopeWithSources } from "./scope";
import { SCOPE_SOURCES, type ScopeSource, type ScopeSourceContext } from "./scopeSources";
import { CLEANED_FORM, cleanWindowMessage } from "./windowHygiene";
import type { ReadLayout, ScopedQuality, SharedReadWindow } from "./types";

export interface FixtureTranscriptEntry {
  index: number;
  speaker: string;
  text: string;
  is_user?: boolean;
}

export type ReadMemoryFlags = Omit<ReadMemory, "entries">;

export type FixtureMemoryRow = Partial<MemoryEntry> & { id: string; text: string };

export type FixtureScopeCaps = Partial<Record<ScopeSource["kind"], number | null>>;

export interface ExtractionFixtureSpec {
  story: unknown;
  transcript: FixtureTranscriptEntry[];
  activeCheckpointId?: string;
  window?: { from: number; to: number };
  canon?: string;
  blackboard?: BlackboardSnapshot;
  openArcs?: string[];
  epistemicLedgerCapable?: boolean;
  entities?: string[];
  excludeKeys?: string[];
  scopeCaps?: FixtureScopeCaps;
  scopeContext?: ScopeSourceContext;
  showValues?: boolean;
  readLayout?: ReadLayout;
  memoryRows?: FixtureMemoryRow[];
  readMemory?: ReadMemoryFlags | null;
}

export interface FixtureSourceRead {
  kind: ScopeSource["kind"];
  cap: number | null;
  keys: string[];
  dropped: string[];
}

export interface FixtureRun {
  story: NormalizedStory;
  activeCheckpointId: string;
  scope: ScopedQuality[];
  prompt: string;
  sources: FixtureSourceRead[];
  window: SharedReadWindow;
  neighbours: NeighbourRow[] | null;
}

export const fixtureMemoryEntry = (row: FixtureMemoryRow): MemoryEntry => ({
  tier: "facts", type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: row.text,
  createdAt: 1, messageId: 1, recallCount: 0, provenance: provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }), ...row,
});

export const readMemoryFlags = (memory: ReadMemory | null): ReadMemoryFlags | null =>
  (memory ? { neighbours: memory.neighbours, keys: memory.keys, relations: memory.relations, acts: memory.acts } : null);

export const fixtureReadMemory = (flags: ReadMemoryFlags | null | undefined, rows: readonly FixtureMemoryRow[] = []): ReadMemory | null =>
  (flags ? { ...flags, entries: flags.neighbours ? rows.map(fixtureMemoryEntry) : [] } : null);

const emptyBlackboard = (): BlackboardSnapshot => ({ values: {}, versions: {}, latched: {} });

export const fixtureSources = (caps: FixtureScopeCaps = {}): ScopeSource[] =>
  SCOPE_SOURCES.map((source) => (source.kind in caps ? { ...source, cap: caps[source.kind] ?? null } : source));

export const CURRENT_VALUES_HEADER = "Current values (measurement arm, never in a shipped read):";

const showValue = (value: PrimitiveValue | undefined) => (value === undefined ? "unread" : JSON.stringify(value));

export const withCurrentValues = (prompt: string, scope: ScopedQuality[], values: Record<string, PrimitiveValue>): string => {
  const at = prompt.lastIndexOf("\nTranscript:\n");
  if (at < 0 || !scope.length) return prompt;
  const block = [CURRENT_VALUES_HEADER, ...scope.map((entry) => `- ${entry.key} = ${showValue(values[entry.key])}`), ""].join("\n");
  return `${prompt.slice(0, at + 1)}${block}${prompt.slice(at + 1)}`;
};

export function buildFixtureRun(spec: ExtractionFixtureSpec): FixtureRun {
  const story = parseStoryOrThrow(spec.story);
  const startId = story.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? story.checkpoints[0]?.id ?? "";
  const activeCheckpointId = spec.activeCheckpointId ?? startId;
  const blackboard = spec.blackboard ?? emptyBlackboard();
  const context = spec.scopeContext ?? {};
  const sourceList = fixtureSources(spec.scopeCaps);
  const derived = deriveScopeWithSources(story, activeCheckpointId, blackboard, [], context, sourceList);
  const scope = derived.scope
    .map(({ key, quality, hints }) => ({ key, quality, hints }))
    .filter((entry) => !spec.excludeKeys?.includes(entry.key));
  const sources = derived.sources;
  const from = spec.window?.from ?? spec.transcript[0]?.index ?? 0;
  const to = spec.window?.to ?? spec.transcript[spec.transcript.length - 1]?.index ?? 0;
  const messages = spec.transcript.flatMap((entry) => {
    const cleaned = cleanWindowMessage({ name: entry.speaker, mes: entry.text, is_user: entry.is_user === true });
    return cleaned.keep ? [{ index: entry.index, messageId: entry.index, speaker: entry.speaker, text: cleaned.text, isUser: cleaned.isUser }] : [];
  });
  const window: SharedReadWindow = { from, to, messages, form: CLEANED_FORM };
  const memoryParts = readMemoryParts(fixtureReadMemory(spec.readMemory, spec.memoryRows), window, scope, { capable: spec.epistemicLedgerCapable });
  const canon = spec.canon ?? `Anchor ${activeCheckpointId}: ${story.checkpointById[activeCheckpointId]?.objective ?? ""}`;
  const prompt = renderSharedReadPrompt({
    storyTitle: story.title,
    activeCheckpointId,
    qualities: scope,
    window,
    canon,
    ...(spec.openArcs ? { openArcs: spec.openArcs } : {}),
    ...(spec.epistemicLedgerCapable ? { epistemicLedgerCapable: true } : {}),
    ...(spec.entities ? { entities: spec.entities } : {}),
    ...readContext(story, activeCheckpointId),
    counted: runningTotals(scope, blackboard.values),
    ...(spec.readLayout ? { layout: spec.readLayout } : {}),
    ...memoryParts.contract,
  });
  const shown = spec.showValues ? withCurrentValues(prompt, scope, blackboard.values) : prompt;
  return { story, activeCheckpointId, scope, prompt: shown, sources, window, neighbours: memoryParts.rows };
}
