import {
  gateKeys, isLivingId, LIVING_OPENING_ID, parseStoryV2, progressQualityForAnchor, slugifyStoryId,
  type Chapter, type Checkpoint, type NormalizedStoryV2, type Quality, type StoryV2, type Transition, type ValidationError,
} from "@engine/index";
import { LIVING_STUB_SUFFIX } from "./types";

export interface LivingExportOptions {
  reached: ReadonlySet<string>;
  includeUnreached: boolean;
  id: string;
  title: string;
  scrub?: (text: string) => string;
}

export type LivingExport = { ok: true; raw: StoryV2; excluded: string[]; stubbed: string[] } | { ok: false; reason: string; errors: ValidationError[] };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const NEXT_TURN_NAME = "What comes next";
export const NEXT_TURN_OBJECTIVE = "The story goes on from here; nothing about it is decided yet.";
export const NEXT_TURN_RUBRIC = "Has the current scene come to a natural turning point?";

const anchorOfStub = (id: string): string | null => (id.endsWith(LIVING_STUB_SUFFIX) ? id.slice(0, -LIVING_STUB_SUFFIX.length) : null);

const isGenerated = (id: string) => isLivingId(id) && id !== LIVING_OPENING_ID;

export function excludedCheckpoints(story: NormalizedStoryV2, reached: ReadonlySet<string>, includeUnreached: boolean): Set<string> {
  if (includeUnreached) return new Set();
  const excluded = new Set(story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor" && isGenerated(checkpoint.id) && !reached.has(checkpoint.id)).map((checkpoint) => checkpoint.id));
  story.checkpoints.forEach((checkpoint) => {
    if (checkpoint.type !== "intermediate" || !isGenerated(checkpoint.id) || reached.has(checkpoint.id)) return;
    const target = anchorOfStub(checkpoint.id);
    const anchorsAhead = (story.reachableByCheckpoint[checkpoint.id] ?? []).filter((id) => story.checkpointById[id]?.type === "anchor");
    if ((target && excluded.has(target)) || anchorsAhead.every((id) => excluded.has(id))) excluded.add(checkpoint.id);
  });
  return excluded;
}

const NEXT_PREFIX = "liv_next_";

const nextPlaceholderNumber = (checkpoints: readonly Checkpoint[]): number =>
  Math.max(0, ...checkpoints.map((checkpoint) => Number(/^liv_next_(\d+)$/.exec(checkpoint.id)?.[1] ?? 0))) + 1;

const scrubbed = (checkpoint: Checkpoint, scrub: (text: string) => string): Checkpoint => {
  if (!isGenerated(checkpoint.id)) return checkpoint;
  const name = scrub(checkpoint.name).trim() || "Untitled turn";
  const objective = scrub(checkpoint.objective).trim() || NEXT_TURN_OBJECTIVE;
  return { ...checkpoint, name, objective, ...(checkpoint.player_name ? { player_name: scrub(checkpoint.player_name).trim() || name } : {}) };
};

const qualityReferences = (checkpoints: readonly Checkpoint[], transitions: readonly Transition[]): Set<string> => new Set([
  ...transitions.flatMap((transition) => gateKeys(transition.gate)),
  ...checkpoints.flatMap((checkpoint) => Object.keys(checkpoint.state_snapshot ?? {})),
]);

export function projectLivingExport(raw: Record<string, unknown>, story: NormalizedStoryV2, options: LivingExportOptions): LivingExport {
  const scrub = options.scrub ?? ((text: string) => text);
  const excluded = excludedCheckpoints(story, options.reached, options.includeUnreached);
  const source: Partial<StoryV2> = clone(raw);
  const opening = story.checkpointById[LIVING_OPENING_ID];
  const authoredHasOpening = (source.checkpoints ?? []).some((checkpoint) => checkpoint.id === LIVING_OPENING_ID);
  const checkpoints: Checkpoint[] = [...(opening && !authoredHasOpening ? [clone(opening)] : []), ...(source.checkpoints ?? [])]
    .filter((checkpoint) => !excluded.has(checkpoint.id))
    .map((checkpoint) => scrubbed(checkpoint, scrub));
  const kept = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  const transitions: Transition[] = (source.transitions ?? []).filter((transition) => kept.has(transition.from) && kept.has(transition.to)
    && (!transition.effects?.progress || kept.has(transition.effects.progress.anchor)));
  const stubbed: string[] = [];
  let next = nextPlaceholderNumber(checkpoints);
  const added: Quality[] = [];
  checkpoints.filter((checkpoint) => checkpoint.type === "anchor").forEach((checkpoint) => {
    const hadExits = (story.outgoingByCheckpoint[checkpoint.id] ?? []).length > 0;
    const keepsExit = transitions.some((transition) => transition.from === checkpoint.id);
    if (!hadExits || keepsExit) return;
    const anchorId = `${NEXT_PREFIX}${next}`;
    next += 1;
    const stubId = `${anchorId}${LIVING_STUB_SUFFIX}`;
    const turnKey = `${anchorId}_moves_on`;
    const chapter = checkpoint.chapter ? { chapter: checkpoint.chapter } : {};
    added.push({ key: turnKey, type: "bool", source: "extractor", latching: true, rubric: NEXT_TURN_RUBRIC });
    checkpoints.push({ id: stubId, name: NEXT_TURN_NAME, objective: NEXT_TURN_OBJECTIVE, type: "intermediate", ...chapter });
    checkpoints.push({ id: anchorId, name: NEXT_TURN_NAME, objective: NEXT_TURN_OBJECTIVE, type: "anchor", ...chapter });
    transitions.push({ from: checkpoint.id, to: stubId, priority: 1, gate: { q: turnKey, op: "==", v: true } });
    transitions.push({ from: stubId, to: anchorId, priority: 1, gate: { q: progressQualityForAnchor(anchorId), op: ">=", v: 1 } });
    stubbed.push(checkpoint.id);
  });
  const referenced = qualityReferences(checkpoints, transitions);
  const qualities: Quality[] = [...(source.qualities ?? []).filter((quality) => !isGenerated(quality.key) || referenced.has(quality.key))
    .map((quality) => (isGenerated(quality.key) ? { ...quality, rubric: scrub(quality.rubric).trim() || NEXT_TURN_RUBRIC } : quality)), ...added];
  const usedChapters = new Set(checkpoints.map((checkpoint) => checkpoint.chapter).filter(Boolean));
  const chapters: Chapter[] | undefined = source.chapters?.filter((chapter) => !isGenerated(chapter.id) || usedChapters.has(chapter.id));
  const arcBridges = source.arc_bridges?.filter((bridge) => kept.has(bridge.anchor));
  const out: StoryV2 = {
    ...source,
    format: 2,
    id: options.id,
    title: options.title,
    description: source.description ?? "",
    roster: source.roster ?? [],
    qualities,
    checkpoints,
    transitions,
    ...(chapters?.length ? { chapters } : {}),
    ...(arcBridges?.length ? { arc_bridges: arcBridges } : {}),
  };
  if (!chapters?.length) delete out.chapters;
  if (!arcBridges?.length) delete out.arc_bridges;
  const parsed = parseStoryV2(out);
  if (Array.isArray(parsed)) return { ok: false, reason: `the saved story would not load: ${parsed[0]?.message ?? "invalid"}`, errors: parsed };
  const defined = new Set(parsed.checkpoints.map((checkpoint) => checkpoint.id));
  const dangling = out.transitions.flatMap((transition) => [transition.from, transition.to]).filter((id) => !defined.has(id));
  if (dangling.length) return { ok: false, reason: `the saved story names checkpoints it does not define: ${dangling.join(", ")}`, errors: [] };
  return { ok: true, raw: out, excluded: [...excluded], stubbed };
}

export const livingExportId = (baseId: string, taken: (id: string) => boolean): string => {
  const base = slugifyStoryId(`${baseId}-run`).slice(0, 56);
  for (let index = 1; index < 1000; index += 1) {
    const candidate = index === 1 ? base : `${base}-${index}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
};
