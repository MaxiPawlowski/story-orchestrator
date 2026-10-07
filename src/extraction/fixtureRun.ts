import { parseStoryV2OrThrow, type BlackboardSnapshot, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { readContext, renderSharedReadPrompt } from "./contract";
import { deriveScopeExplained } from "./scope";
import { readScopeSource, SCOPE_SOURCES, type ScopeSource, type ScopeSourceContext } from "./scopeSources";
import { CLEANED_FORM, cleanWindowMessage } from "./windowHygiene";
import type { ScopedQuality } from "./types";

export interface FixtureTranscriptEntry {
  index: number;
  speaker: string;
  text: string;
  is_user?: boolean;
}

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
}

export interface FixtureSourceRead {
  kind: ScopeSource["kind"];
  cap: number | null;
  keys: string[];
  dropped: string[];
}

export interface FixtureRun {
  story: NormalizedStoryV2;
  activeCheckpointId: string;
  scope: ScopedQuality[];
  prompt: string;
  sources: FixtureSourceRead[];
}

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
  const story = parseStoryV2OrThrow(spec.story);
  const startId = story.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? story.checkpoints[0]?.id ?? "";
  const activeCheckpointId = spec.activeCheckpointId ?? startId;
  const blackboard = spec.blackboard ?? emptyBlackboard();
  const context = spec.scopeContext ?? {};
  const sourceList = fixtureSources(spec.scopeCaps);
  const scope = deriveScopeExplained(story, activeCheckpointId, blackboard, [], context, sourceList)
    .map(({ key, quality, hints }) => ({ key, quality, hints }))
    .filter((entry) => !spec.excludeKeys?.includes(entry.key));
  const sources = sourceList.map((source) => ({ kind: source.kind, cap: source.cap, ...readScopeSource(source, story, blackboard, context) }));
  const from = spec.window?.from ?? spec.transcript[0]?.index ?? 0;
  const to = spec.window?.to ?? spec.transcript[spec.transcript.length - 1]?.index ?? 0;
  const messages = spec.transcript.flatMap((entry) => {
    const cleaned = cleanWindowMessage({ name: entry.speaker, mes: entry.text, is_user: entry.is_user === true });
    return cleaned.keep ? [{ index: entry.index, messageId: entry.index, speaker: entry.speaker, text: cleaned.text, isUser: cleaned.isUser }] : [];
  });
  const canon = spec.canon ?? `Anchor ${activeCheckpointId}: ${story.checkpointById[activeCheckpointId]?.objective ?? ""}`;
  const prompt = renderSharedReadPrompt({
    storyTitle: story.title,
    activeCheckpointId,
    qualities: scope,
    window: { from, to, messages, form: CLEANED_FORM },
    canon,
    ...(spec.openArcs ? { openArcs: spec.openArcs } : {}),
    ...(spec.epistemicLedgerCapable ? { epistemicLedgerCapable: true } : {}),
    ...(spec.entities ? { entities: spec.entities } : {}),
    ...readContext(story, activeCheckpointId),
  });
  return { story, activeCheckpointId, scope, prompt: spec.showValues ? withCurrentValues(prompt, scope, blackboard.values) : prompt, sources };
}
