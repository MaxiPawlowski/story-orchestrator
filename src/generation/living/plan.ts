import {
  evaluateGate, gateLeaves, isLivingId, LIVING_OPENING_ID, parseStoryV2, progressQualityForAnchor,
  type Chapter, type Checkpoint, type GateNode, type NormalizedStoryV2, type PrimitiveValue, type Quality, type StoryLiving, type TensionLevel,
} from "@engine/index";
import { expectedTension, numericToLevel } from "@pacing/index";
import { livingChapterSize } from "@engine/validate/living";
import { foldOps } from "./fold";
import {
  LIVING_CHAPTER_CAP_WITHOUT_SEALS, LIVING_CHAPTER_PREFIX, LIVING_MAX_NEW_QUALITIES, LIVING_STUB_SUFFIX,
  type DirectorDraft, type LivingOpPayload,
} from "./types";

export interface LivingFrontier {
  frontierId: string;
  ahead: number;
}

export const livingHorizon = (living: StoryLiving): number => living.horizon ?? 1;

export const livingAutonomy = (story: NormalizedStoryV2): "suggest" | "auto" => {
  const living = story.living;
  if (!living) return "auto";
  if (living.autonomy) return living.autonomy;
  return living.authored_until ? "suggest" : "auto";
};

const isFinalAnchor = (story: NormalizedStoryV2, id: string): boolean => {
  const chapter = story.chapterByCheckpoint?.[id];
  return Boolean(chapter && story.chapterById?.[chapter]?.final);
};

export const isEligibleFrontier = (story: NormalizedStoryV2, id: string): boolean => {
  const living = story.living;
  const checkpoint = story.checkpointById[id];
  if (!living || checkpoint?.type !== "anchor") return false;
  if ((story.outgoingByCheckpoint[id] ?? []).length > 0 || isFinalAnchor(story, id)) return false;
  if (isLivingId(id)) return true;
  return living.authored_until ? id === living.authored_until : true;
};

export function findFrontier(story: NormalizedStoryV2, activeId: string): LivingFrontier | null {
  const living = story.living;
  if (!living || !story.checkpointById[activeId]) return null;
  const reachable = story.reachableByCheckpoint[activeId] ?? [];
  const ahead = reachable.filter((id) => id !== activeId && story.checkpointById[id]?.type === "anchor").length;
  if (ahead >= livingHorizon(living)) return null;
  const order = [activeId, ...reachable.filter((id) => id !== activeId)];
  const frontierId = order.find((id) => isEligibleFrontier(story, id));
  return frontierId ? { frontierId, ahead } : null;
}

export const generatedAnchorIds = (story: NormalizedStoryV2): string[] =>
  story.checkpoints.filter((checkpoint) => checkpoint.type === "anchor" && isLivingId(checkpoint.id) && checkpoint.id !== LIVING_OPENING_ID).map((checkpoint) => checkpoint.id);

export const nextLivingAnchorId = (story: NormalizedStoryV2): string => {
  const numbers = story.checkpoints.map((checkpoint) => /^liv_(\d+)$/.exec(checkpoint.id)?.[1]).filter((value): value is string => Boolean(value)).map(Number);
  return `liv_${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
};

export const usesLivingChapters = (story: NormalizedStoryV2): boolean => Boolean(story.chapters?.length) || !story.living?.authored_until;

export const livingChapters = (story: NormalizedStoryV2): Chapter[] => (story.chapters ?? []).filter((chapter) => chapter.id.startsWith(LIVING_CHAPTER_PREFIX));

export interface ChapterPlan {
  chapterId: string | null;
  create: Chapter | null;
  anchorsInChapter: number;
  capped: boolean;
}

export function planChapter(story: NormalizedStoryV2, frontierId: string, options: { sealsOn: boolean; final: boolean; newChapter: boolean; title?: string }): ChapterPlan {
  const living = story.living;
  if (!living) return { chapterId: null, create: null, anchorsInChapter: 0, capped: true };
  const [min, max] = livingChapterSize(living);
  const generated = generatedAnchorIds(story).length;
  const chapters = livingChapters(story);
  if (!usesLivingChapters(story)) {
    const capped = !options.sealsOn && generated >= LIVING_CHAPTER_CAP_WITHOUT_SEALS * max;
    return { chapterId: null, create: null, anchorsInChapter: generated, capped };
  }
  const current = story.chapterByCheckpoint?.[frontierId];
  const currentLiving = current?.startsWith(LIVING_CHAPTER_PREFIX) ? current : null;
  const inCurrent = currentLiving ? generatedAnchorIds(story).filter((id) => story.chapterByCheckpoint?.[id] === currentLiving).length : 0;
  const full = !currentLiving || inCurrent >= max || (options.newChapter && inCurrent >= min) || options.final;
  if (!full) return { chapterId: currentLiving, create: null, anchorsInChapter: inCurrent, capped: false };
  const capped = !options.final && !options.sealsOn && chapters.length >= LIVING_CHAPTER_CAP_WITHOUT_SEALS;
  const id = `${LIVING_CHAPTER_PREFIX}${chapters.length + 1}`;
  const title = options.title?.trim() || (options.final ? "The end" : `Chapter ${chapters.length + 1}`);
  return { chapterId: id, create: { id, title, ...(options.final ? { final: true } : {}) }, anchorsInChapter: 0, capped };
}

export const suggestedTension = (story: NormalizedStoryV2, anchorsInChapter: number): TensionLevel => {
  const [, max] = story.living ? livingChapterSize(story.living) : [3, 5];
  return numericToLevel(expectedTension(story.arc_template ?? "rising", (anchorsInChapter + 1) / max));
};

const slugKey = (key: string): string => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "turn";

export interface BuiltDirectorOps {
  anchorId: string;
  ops: LivingOpPayload[];
  openingGate: GateNode;
  issues: string[];
}

export function buildDirectorOps(story: NormalizedStoryV2, frontierId: string, draft: DirectorDraft, plan: ChapterPlan): BuiltDirectorOps {
  const anchorId = nextLivingAnchorId(story);
  const stubId = `${anchorId}${LIVING_STUB_SUFFIX}`;
  const issues: string[] = [];
  const rename = new Map<string, string>();
  const newQualities: Quality[] = [];
  const declare = (key: string, quality: Omit<Quality, "key">) => {
    const namespaced = `${anchorId}_${slugKey(key)}`;
    rename.set(key, namespaced);
    if (!newQualities.some((existing) => existing.key === namespaced)) newQualities.push({ key: namespaced, ...quality });
    return namespaced;
  };
  draft.newQualities.forEach((entry) => {
    if (story.qualityByKey[entry.key]) return void issues.push(`'${entry.key}' already exists: reuse it instead of declaring it again`);
    declare(entry.key, entry.type === "bool"
      ? { type: "bool", source: "extractor", latching: true, rubric: entry.rubric }
      : { type: "int", source: "extractor", rubric: entry.rubric });
  });
  const openingGate: GateNode = draft.opensWhen.kind === "reuse"
    ? draft.opensWhen.gate
    : { q: declare(draft.opensWhen.key, { type: "bool", source: "extractor", latching: true, rubric: draft.opensWhen.rubric }), op: "==", v: true };
  if (newQualities.length > LIVING_MAX_NEW_QUALITIES) issues.push(`at most ${LIVING_MAX_NEW_QUALITIES} new qualities per checkpoint (asked for ${newQualities.length})`);
  const renameGate = (gate: GateNode): GateNode => {
    if ("q" in gate) return { ...gate, q: rename.get(gate.q) ?? gate.q };
    if ("all" in gate) return { all: gate.all.map(renameGate) };
    if ("any" in gate) return { any: gate.any.map(renameGate) };
    return { not: renameGate(gate.not) };
  };
  const snapshot: Record<string, PrimitiveValue> = Object.fromEntries(Object.entries(draft.anchor.snapshot).map(([key, value]) => [rename.get(key) ?? key, value]));
  const chapter = plan.chapterId ? { chapter: plan.chapterId } : {};
  const anchor: Checkpoint = {
    id: anchorId,
    name: draft.anchor.name,
    objective: draft.anchor.objective,
    type: "anchor",
    tension_target: draft.anchor.tension,
    ...(Object.keys(snapshot).length ? { state_snapshot: snapshot } : {}),
    ...chapter,
  };
  const stub: Checkpoint = { id: stubId, name: `Toward ${draft.anchor.name}`, objective: draft.anchor.objective, type: "intermediate", ...chapter };
  const gate = renameGate(openingGate);
  const ops: LivingOpPayload[] = [
    ...(plan.create ? [{ kind: "add-chapter" as const, chapter: plan.create }] : []),
    ...newQualities.map((quality) => ({ kind: "add-quality" as const, quality })),
    { kind: "add-stub", checkpoint: stub },
    { kind: "add-checkpoint", checkpoint: anchor },
    { kind: "add-transition", transition: { from: frontierId, to: stubId, priority: 1, gate } },
    { kind: "add-transition", transition: { from: stubId, to: anchorId, priority: 1, gate: { q: progressQualityForAnchor(anchorId), op: ">=", v: 1 } } },
  ];
  return { anchorId, ops, openingGate: gate, issues };
}

export interface DirectorCheckInput {
  raw: Record<string, unknown>;
  story: NormalizedStoryV2;
  frontierId: string;
  ops: readonly LivingOpPayload[];
  values: Record<string, PrimitiveValue>;
  latched: Record<string, boolean>;
  convergeTo?: string;
}

const reader = (values: Record<string, PrimitiveValue>) => ({ get: (key: string) => values[key] });

export function gateImpossible(gate: GateNode, story: NormalizedStoryV2, values: Record<string, PrimitiveValue>, latched: Record<string, boolean>): string | null {
  if ("q" in gate) {
    const quality = story.qualityByKey[gate.q];
    if (!quality) return `reads '${gate.q}', which no quality declares`;
    if (quality.source !== "extractor") return `reads '${gate.q}', which play cannot move (it is set in code)`;
    if (latched[gate.q] && !evaluateGate(gate, reader(values))) return `reads '${gate.q}', which is locked at a value that never satisfies it`;
    return null;
  }
  if ("all" in gate) return gate.all.map((entry) => gateImpossible(entry, story, values, latched)).find(Boolean) ?? null;
  if ("any" in gate) {
    const reasons = gate.any.map((entry) => gateImpossible(entry, story, values, latched));
    return reasons.every(Boolean) ? reasons[0] ?? "an empty any" : null;
  }
  return null;
}

export function checkDirectorOps(input: DirectorCheckInput): { story: NormalizedStoryV2 | null; issues: string[] } {
  const issues: string[] = [];
  const existing = new Set([...input.story.checkpoints.map((checkpoint) => checkpoint.id), ...(input.story.chapters ?? []).map((chapter) => chapter.id)]);
  const keys = new Set(input.story.qualities.map((quality) => quality.key));
  const added = new Set<string>();
  let qualities = 0;
  input.ops.forEach((op) => {
    if (op.kind === "add-checkpoint" || op.kind === "add-stub" || op.kind === "add-chapter") {
      const id = op.kind === "add-chapter" ? op.chapter.id : op.checkpoint.id;
      if (!isLivingId(id)) issues.push(`'${id}' is not a generated id (it must start with liv_)`);
      if (existing.has(id) || added.has(id)) issues.push(`'${id}' already exists`);
      if (op.kind === "add-checkpoint" && op.checkpoint.start) issues.push(`'${id}' cannot be a start`);
      added.add(id);
    } else if (op.kind === "add-quality") {
      qualities += 1;
      if (!isLivingId(op.quality.key)) issues.push(`quality '${op.quality.key}' is not a generated key`);
      if (keys.has(op.quality.key)) issues.push(`quality '${op.quality.key}' already exists`);
      keys.add(op.quality.key);
    }
  });
  input.ops.forEach((op) => {
    if (op.kind !== "add-transition") return;
    const { from, to } = op.transition;
    if (from !== input.frontierId && !added.has(from)) issues.push(`a transition from '${from}' would write behind or beside the frontier`);
    const converges = Boolean(input.convergeTo) && to === input.convergeTo && added.has(from);
    if (!added.has(to) && !converges) issues.push(`a transition into '${to}' would point at a checkpoint the director did not write`);
  });
  if (qualities > LIVING_MAX_NEW_QUALITIES) issues.push(`at most ${LIVING_MAX_NEW_QUALITIES} new qualities per checkpoint`);
  if (!input.convergeTo && (input.story.outgoingByCheckpoint[input.frontierId] ?? []).length) issues.push(`'${input.frontierId}' already has exits`);
  if (input.convergeTo && input.story.checkpointById[input.convergeTo]?.type !== "anchor") issues.push(`'${input.convergeTo}' is not an anchor to converge on`);
  const parsed = parseStoryV2(foldOps(input.raw, input.ops));
  if (Array.isArray(parsed)) {
    issues.push(...parsed.slice(0, 4).map((error) => `${error.path}: ${error.message}`));
    return { story: null, issues };
  }
  (parsed.outgoingByCheckpoint[input.frontierId] ?? []).filter((transition) => added.has(transition.to)).forEach((transition) => {
    const values = { ...input.values };
    if (evaluateGate(transition.gate, reader(values))) issues.push(`the way into '${transition.to}' is already open on arrival`);
    const impossible = gateImpossible(transition.gate, parsed, values, input.latched);
    if (impossible) issues.push(`the way into '${transition.to}' can never open: it ${impossible}`);
  });
  const leaves = input.ops.flatMap((op) => (op.kind === "add-transition" ? gateLeaves(op.transition.gate) : []));
  leaves.forEach((leaf) => {
    if (!parsed.qualityByKey[leaf.q]) issues.push(`a gate reads unknown '${leaf.q}'`);
  });
  return { story: issues.length ? null : parsed, issues };
}

export interface BuiltBranchOps {
  stubId: string;
  ops: LivingOpPayload[];
  issues: string[];
}

export function buildBranchOps(story: NormalizedStoryV2, sourceId: string, targetId: string, branchId: string, draft: DirectorDraft): BuiltBranchOps {
  const issues: string[] = [];
  const target = story.checkpointById[targetId];
  if (draft.opensWhen.kind !== "new") issues.push("a branch opens on a new value that names what the player is doing");
  const key = draft.opensWhen.kind === "new" ? `${branchId}_${slugKey(draft.opensWhen.key)}` : `${branchId}_turn`;
  const rubric = draft.opensWhen.kind === "new" ? draft.opensWhen.rubric : draft.anchor.objective;
  const stubId = `${branchId}${LIVING_STUB_SUFFIX}`;
  const chapter = story.checkpointById[sourceId]?.chapter ?? story.chapterByCheckpoint?.[sourceId];
  const priorities = (story.outgoingByCheckpoint[sourceId] ?? []).map((transition) => transition.priority);
  const priority = priorities.length ? Math.min(...priorities) - 1 : 1;
  const threshold = target?.convergence_threshold ?? 1;
  const ops: LivingOpPayload[] = [
    { kind: "add-quality", quality: { key, type: "bool", source: "extractor", latching: true, rubric } },
    { kind: "add-stub", checkpoint: { id: stubId, name: draft.anchor.name, objective: draft.anchor.objective, type: "intermediate", ...(chapter ? { chapter } : {}) } },
    { kind: "add-transition", transition: { from: sourceId, to: stubId, priority, gate: { q: key, op: "==", v: true } } },
    { kind: "add-transition", transition: { from: stubId, to: targetId, priority: 1, gate: { q: progressQualityForAnchor(targetId), op: ">=", v: threshold } } },
  ];
  return { stubId, ops, issues };
}

