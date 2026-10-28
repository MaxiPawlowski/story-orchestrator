import { knownEntities, unknownEntityNames } from "@engine/codex";
import { LIVING_PREFIX, type EngineState, type NormalizedStory } from "@engine/index";
import {
  isPatternVar, PATTERN_BRANCH_CAP, PATTERN_HINT_BOUNDARIES, stepConditions, type PatternKind, type PatternStep, type StoryPattern,
} from "@engine/patternSchema";
import { checksById } from "@engine/storyChecks";
import { isRecord } from "@utils/guards";
import { chapterOf, recapWithheld, type RecapLine } from "./consequences";
import { fnv1a, stableStringify } from "./hash";
import type { EffectRef } from "./recapPort";
import {
  PATTERN_COMPLETED_CAP, PATTERN_GAPS_CAP, PATTERN_RING_CAP,
  type PatternAuthorSlice, type PatternBranch, type PatternCompletion, type PatternCursor, type PatternDelta, type PatternKill, type PatternRef, type PatternResting,
  type PatternsState, type PatternTombstone, type PublicPattern, type PatternGap,
} from "./patternsPort";

const KINDS: readonly string[] = ["transition", "quest", "milestone", "check"];

export const patternRev = (pattern: StoryPattern): string =>
  fnv1a(stableStringify({ steps: pattern.steps, unless: pattern.unless ?? [], within: pattern.within ?? null, repeat: pattern.repeat ?? "once" }));

interface Indexed {
  pattern: StoryPattern;
  rev: string;
  order: number;
}

interface PatternIndex {
  story: NormalizedStory;
  checks: ReturnType<typeof checksById>;
  byId: Map<string, Indexed>;
  list: Indexed[];
  attrs: Map<string, Record<string, string>>;
}

const indexes = new WeakMap<NormalizedStory, PatternIndex>();

const indexOf = (story: NormalizedStory): PatternIndex => {
  const known = indexes.get(story);
  if (known) return known;
  const list = (story.patterns ?? []).map((pattern, order) => ({ pattern, rev: patternRev(pattern), order }));
  const index = { story, checks: checksById(story), byId: new Map(list.map((entry) => [entry.pattern.id, entry])), list, attrs: new Map<string, Record<string, string>>() };
  indexes.set(story, index);
  return index;
};

const refKey = (ref: PatternCursor) => `${ref.boundary}.${ref.index}`;

const attrsOf = (index: PatternIndex, ref: PatternRef & { to?: string; from?: string }): Record<string, string> => {
  const story = index.story;
  const put = (values: Record<string, string | undefined>) => Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  if (ref.kind === "transition") return put({ to: ref.to, from: ref.from, chapter: ref.to ? chapterOf(story, ref.to) ?? undefined : undefined });
  if (ref.kind === "quest") return put({ id: ref.id, to: ref.to, giver: (story.quests ?? []).find((quest) => quest.id === ref.id)?.giver });
  if (ref.kind === "milestone") return { id: ref.id };
  return put({ id: ref.id, outcome: ref.to, quality: index.checks.get(ref.id)?.quality });
};

export interface MatchRef extends PatternRef {
  attrs: Record<string, string>;
}

const eligible = (index: PatternIndex, ref: EffectRef): boolean => {
  const story = index.story;
  if (!ref.visible || !KINDS.includes(ref.kind)) return false;
  if (ref.kind === "transition") return !(ref.to?.startsWith(LIVING_PREFIX) || ref.from?.startsWith(LIVING_PREFIX));
  if (ref.kind === "milestone") return !(story.milestones ?? []).find((milestone) => milestone.id === ref.id)?.secret;
  if (ref.kind === "check") return index.checks.get(ref.id)?.narrate === "public";
  return ref.to !== "hidden";
};

export const toMatchRefs = (story: NormalizedStory, derived: readonly EffectRef[]): MatchRef[] => {
  const index = indexOf(story);
  return derived.flatMap((ref, at) => {
    if (!eligible(index, ref)) return [];
    const base: PatternRef = { kind: ref.kind as PatternKind, id: ref.id, boundary: ref.boundary, index: at, messageId: ref.messageId };
    return [{ ...base, attrs: attrsOf(index, { ...base, to: ref.to, from: ref.from }) }];
  });
};

const conditionCache = new WeakMap<PatternStep, Array<[string, string]>>();

const conditionsOf = (step: PatternStep): Array<[string, string]> => {
  const known = conditionCache.get(step);
  if (known) return known;
  const entries = Object.entries(stepConditions(step));
  conditionCache.set(step, entries);
  return entries;
};

const bind = (step: PatternStep, attrs: Record<string, string>, bindings: Record<string, string>): Record<string, string> | null => {
  let next: Record<string, string> | null = null;
  for (const [attr, want] of conditionsOf(step)) {
    const have = attrs[attr];
    if (have === undefined) return null;
    if (!isPatternVar(want)) {
      if (want !== have) return null;
      continue;
    }
    const bound: string | undefined = next?.[want] ?? bindings[want];
    if (bound !== undefined && bound !== have) return null;
    if (bound === undefined) next = { ...(next ?? bindings), [want]: have };
  }
  return next ?? bindings;
};

const matches = (step: PatternStep, ref: MatchRef, bindings: Record<string, string>) => step.kind === ref.kind ? bind(step, ref.attrs, bindings) : null;

const compareCursor = (left: PatternCursor, right: PatternCursor) => left.boundary - right.boundary || left.index - right.index;

const keys = new WeakMap<object, string>();

export const branchKey = (branch: Pick<PatternBranch, "patternId" | "rev" | "refs">): string => {
  const known = keys.get(branch);
  if (known !== undefined) return known;
  const key = `${branch.patternId}|${branch.rev}|${branch.refs.map(refKey).join(",")}`;
  keys.set(branch, key);
  return key;
};

const byKey = (left: PatternBranch, right: PatternBranch) => {
  const one = branchKey(left);
  const two = branchKey(right);
  return one < two ? -1 : one > two ? 1 : 0;
};

const bindingKeys = new WeakMap<object, string>();

const bindingKey = (bindings: Record<string, string>): string => {
  const known = bindingKeys.get(bindings);
  if (known !== undefined) return known;
  const key = JSON.stringify(bindings);
  bindingKeys.set(bindings, key);
  return key;
};

const plain = ({ kind, id, boundary, index, messageId }: PatternRef): PatternRef => ({ kind, id, boundary, index, messageId });

const sortBranches = (index: PatternIndex, branches: PatternBranch[]): PatternBranch[] => branches
  .map((branch) => ({ branch, order: index.byId.get(branch.patternId)?.order ?? 0 }))
  .sort((left, right) => left.order - right.order
    || compareCursor(left.branch.refs[0], right.branch.refs[0]) || compareCursor(left.branch.refs[left.branch.refs.length - 1], right.branch.refs[right.branch.refs.length - 1])
    || left.branch.next - right.branch.next || byKey(left.branch, right.branch))
  .map((entry) => entry.branch);

const occurrenceOf = (branch: PatternBranch) => `${branch.patternId}:${branch.rev}:${branch.refs.map((ref) => `${ref.kind}:${ref.id}:${ref.boundary}:${ref.index}`).join("|")}`;

export interface StepResult {
  branches: PatternBranch[];
  completions: PatternCompletion[];
  tombstones: PatternTombstone[];
  kills: PatternKill[];
  overflow: number;
}

const kill = (branch: PatternBranch, reason: PatternKill["reason"], ref: PatternCursor, boundary: number): PatternKill =>
  ({ patternId: branch.patternId, rev: branch.rev, reason, ref, next: branch.next, boundary });

const shares = (left: Pick<PatternBranch, "refs">, right: Pick<PatternBranch, "refs">) => left.refs.some((ref) => right.refs.some((other) => refKey(other) === refKey(ref)));

const killedBy = (pattern: StoryPattern, branch: PatternBranch, ref: MatchRef) => (pattern.unless ?? []).some((entry) =>
  branch.next >= entry.between[0] && branch.next < entry.between[1] && matches(entry, ref, branch.bindings) !== null);

const dedupe = (index: PatternIndex, branches: PatternBranch[], boundary: number, ref: PatternCursor): { branches: PatternBranch[]; kills: PatternKill[]; overflow: number } => {
  const sorted = sortBranches(index, branches);
  const latest = new Map<string, PatternCursor>();
  const survivors = new Set<PatternBranch>();
  for (let at = sorted.length - 1; at >= 0; at -= 1) {
    const candidate = sorted[at];
    const key = `${candidate.patternId}|${candidate.rev}|${candidate.next}|${bindingKey(candidate.bindings)}`;
    const last = candidate.refs[candidate.refs.length - 1];
    const reach = latest.get(key);
    if (reach && compareCursor(last, reach) <= 0) continue;
    latest.set(key, last);
    survivors.add(candidate);
  }
  const kept = sorted.filter((branch) => survivors.has(branch));
  const counts = new Map<string, number>();
  kept.forEach((branch) => counts.set(branch.patternId, (counts.get(branch.patternId) ?? 0) + 1));
  const kills: PatternKill[] = [];
  let overflow = 0;
  const dropped = new Map([...counts].map(([id, count]) => [id, Math.max(0, count - PATTERN_BRANCH_CAP)]));
  const capped = kept.filter((branch) => {
    const drop = dropped.get(branch.patternId) ?? 0;
    if (!drop) return true;
    dropped.set(branch.patternId, drop - 1);
    overflow += 1;
    kills.push(kill(branch, "overflow", ref, boundary));
    return false;
  });
  return { branches: capped, kills, overflow };
};

export const stepRef = (index: PatternIndex, branches: PatternBranch[], blocked: ReadonlySet<string>, ref: MatchRef): StepResult => {
  const kills: PatternKill[] = [];
  const spawned: PatternBranch[] = [];
  const own = plain(ref);
  branches.forEach((branch) => {
    const entry = index.byId.get(branch.patternId);
    const step = entry?.pattern.steps[branch.next];
    const bindings = step ? matches(step, ref, branch.bindings) : null;
    if (bindings) spawned.push({ ...branch, next: branch.next + 1, bindings, refs: [...branch.refs, own] });
  });
  index.list.forEach(({ pattern, rev }) => {
    if (blocked.has(pattern.id)) return;
    const bindings = matches(pattern.steps[0], ref, {});
    if (bindings) spawned.push({ patternId: pattern.id, rev, next: 1, bindings, refs: [own] });
  });
  const survivors = branches.filter((branch) => {
    const entry = index.byId.get(branch.patternId);
    if (!entry || !killedBy(entry.pattern, branch, ref)) return true;
    kills.push(kill(branch, "unless", ref, ref.boundary));
    return false;
  });
  const completions: PatternCompletion[] = [];
  const tombstones: PatternTombstone[] = [];
  const done = new Set<string>();
  let open = [...survivors, ...spawned.filter((branch) => branch.next < (index.byId.get(branch.patternId)?.pattern.steps.length ?? 0))];
  sortBranches(index, spawned.filter((branch) => branch.next >= (index.byId.get(branch.patternId)?.pattern.steps.length ?? Infinity))).forEach((branch) => {
    const entry = index.byId.get(branch.patternId);
    if (!entry || done.has(branch.patternId) && (entry.pattern.repeat ?? "once") === "once") return;
    if (blocked.has(branch.patternId) || completions.some((other) => other.patternId === branch.patternId && shares(other, branch))) return;
    const last = branch.refs[branch.refs.length - 1];
    const occurrence = occurrenceOf(branch);
    completions.push({
      patternId: branch.patternId, rev: branch.rev, occurrence, refs: branch.refs,
      boundary: last.boundary, messageId: last.messageId,
      ...(entry.pattern.label?.text ? { label: entry.pattern.label.text } : {}), ...(entry.pattern.hint ? { hint: entry.pattern.hint } : {}),
    });
    done.add(branch.patternId);
    if ((entry.pattern.repeat ?? "once") === "once") {
      tombstones.push({ patternId: branch.patternId, rev: branch.rev, occurrence, boundary: last.boundary });
      open = open.filter((other) => other.patternId !== branch.patternId);
    } else {
      open = open.filter((other) => other.patternId !== branch.patternId || !shares(other, branch));
    }
  });
  const cleaned = dedupe(index, open, ref.boundary, own);
  return { branches: cleaned.branches, completions, tombstones, kills: [...kills, ...cleaned.kills], overflow: cleaned.overflow };
};

const expire = (index: PatternIndex, branches: PatternBranch[], boundary: number): { branches: PatternBranch[]; kills: PatternKill[] } => {
  const kills: PatternKill[] = [];
  const kept = branches.filter((branch) => {
    const within = index.byId.get(branch.patternId)?.pattern.within;
    if (within === undefined || boundary - branch.refs[0].boundary <= within) return true;
    kills.push(kill(branch, "expired", { boundary, index: 0 }, boundary));
    return false;
  });
  return { branches: kept, kills };
};

const known = (index: PatternIndex, branch: PatternBranch) => index.byId.get(branch.patternId)?.rev === branch.rev;

export const runBoundary = (story: NormalizedStory, branches: PatternBranch[], blocked: ReadonlySet<string>, boundary: number, refs: readonly MatchRef[]): StepResult => {
  const index = indexOf(story);
  const expired = expire(index, branches.filter((branch) => known(index, branch)), boundary);
  const result: StepResult = { branches: sortBranches(index, expired.branches), completions: [], tombstones: [], kills: expired.kills, overflow: 0 };
  const stopped = new Set(blocked);
  return refs.reduce<StepResult>((acc, ref) => {
    const step = stepRef(index, acc.branches, stopped, ref);
    step.tombstones.forEach((tombstone) => stopped.add(tombstone.patternId));
    return {
      branches: step.branches, completions: [...acc.completions, ...step.completions], tombstones: [...acc.tombstones, ...step.tombstones],
      kills: [...acc.kills, ...step.kills], overflow: acc.overflow + step.overflow,
    };
  }, result);
};

const liveCache = new WeakMap<PatternsState, PatternBranch[]>();

export const currentBranches = (state: PatternsState): PatternBranch[] => {
  const cached = liveCache.get(state);
  if (cached) return cached;
  const live = new Map(state.base.branches.map((branch) => [branchKey(branch), branch]));
  state.deltas.forEach((delta) => {
    delta.removed.forEach((key) => live.delete(key));
    delta.added.forEach((branch) => live.set(branchKey(branch), branch));
  });
  const branches = [...live.values()];
  liveCache.set(state, branches);
  return branches;
};

export const currentRing = (state: PatternsState): PatternKill[] => [...state.base.ring, ...state.deltas.flatMap((delta) => delta.killed)].slice(-PATTERN_RING_CAP);

const blockedOf = (story: NormalizedStory, state: PatternsState): Set<string> => {
  const once = new Set((story.patterns ?? []).filter((pattern) => (pattern.repeat ?? "once") === "once").map((pattern) => pattern.id));
  return new Set(state.tombstones.map((tombstone) => tombstone.patternId).filter((id) => once.has(id)));
};

export const trimFrom = (state: PatternsState, boundary: number): PatternsState => {
  const later = (entry: { boundary: number }) => entry.boundary >= boundary;
  if (!state.deltas.some(later) && !state.completed.some(later) && !state.tombstones.some(later)) return state;
  return {
    ...state, deltas: state.deltas.filter((entry) => !later(entry)), completed: state.completed.filter((entry) => !later(entry)),
    tombstones: state.tombstones.filter((entry) => !later(entry)),
  };
};

export const applyBoundary = (story: NormalizedStory, input: PatternsState, at: { boundary: number; messageId: number }, derived: readonly EffectRef[]): PatternsState => {
  const state = trimFrom(input, at.boundary);
  const before = currentBranches(state);
  const result = runBoundary(story, before, blockedOf(story, state), at.boundary, toMatchRefs(story, derived));
  const beforeKeys = new Set(before.map(branchKey));
  const afterKeys = new Set(result.branches.map(branchKey));
  const delta: PatternDelta = {
    boundary: at.boundary, added: result.branches.filter((branch) => !beforeKeys.has(branchKey(branch))),
    removed: [...beforeKeys].filter((key) => !afterKeys.has(key)), killed: result.kills, overflow: result.overflow,
  };
  const changed = delta.added.length || delta.removed.length || delta.killed.length || delta.overflow;
  if (!changed && !result.completions.length && state === input) return input;
  const next = {
    ...state,
    deltas: changed ? [...state.deltas, delta] : state.deltas,
    completed: result.completions.length ? [...state.completed, ...result.completions].slice(-PATTERN_COMPLETED_CAP) : state.completed,
    tombstones: result.tombstones.length ? [...state.tombstones, ...result.tombstones] : state.tombstones,
  };
  liveCache.set(next, result.branches);
  return next;
};

export const foldFloor = (state: PatternsState, floor: number): PatternsState => {
  const folded = state.deltas.filter((delta) => delta.boundary <= floor);
  if (!folded.length) return state;
  const base = { ...state, deltas: folded };
  const next = {
    ...state,
    base: {
      at: { boundary: floor + 1, index: 0 }, branches: currentBranches(base), ring: currentRing(base),
      overflow: state.base.overflow + folded.reduce((sum, delta) => sum + delta.overflow, 0),
    },
    deltas: state.deltas.filter((delta) => delta.boundary > floor),
  };
  liveCache.set(next, currentBranches(state));
  return next;
};

export const reconcilePatterns = (state: PatternsState, next: NormalizedStory): PatternsState => {
  const index = indexOf(next);
  const keeps = (branch: PatternBranch) => known(index, branch);
  const edited = [...new Set(currentBranches(state).filter((branch) => index.byId.has(branch.patternId) && !keeps(branch)).map((branch) => branch.patternId))];
  const dropped = currentBranches(state).filter((branch) => !keeps(branch)).map(branchKey);
  if (!dropped.length) return state;
  const gone = new Set(dropped);
  return {
    ...state,
    base: { ...state.base, branches: state.base.branches.filter(keeps) },
    deltas: state.deltas.map((delta) => ({ ...delta, added: delta.added.filter(keeps), removed: delta.removed.filter((key) => !gone.has(key)) })),
    partial: [...new Set([...state.partial, ...edited])],
  };
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, name: string): boolean => name.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(name)}($|[^\\p{L}\\p{N}])`, "iu").test(text);

export type PublicCheck = (text: string) => "ok" | "withheld-name" | "withheld-secret";

export const publicCheck = (story: NormalizedStory, state: EngineState, resting: PatternResting): PublicCheck => {
  const withheld = recapWithheld(story, state).map((name) => name.toLowerCase());
  const unknown = unknownEntityNames(story, knownEntities(story, state.blackboard.values, resting.enabled));
  return (text) => {
    const lower = text.toLowerCase();
    if (withheld.some((name) => lower.includes(name)) || unknown.some((name) => mentions(text, name))) return "withheld-name";
    return resting.restates(text) ? "withheld-secret" : "ok";
  };
};

const evidence = (refs: readonly PatternRef[]) => refs.map(({ kind, id, boundary, index, messageId }) => ({ kind, id, boundary, index, messageId }));

const recent = (state: EngineState, completion: PatternCompletion) => completion.boundary > state.boundary - PATTERN_HINT_BOUNDARIES;

export const patternProjection = (story: NormalizedStory, patterns: PatternsState, state: EngineState, resting: PatternResting): PublicPattern[] => {
  const index = indexOf(story);
  const check = publicCheck(story, state, resting);
  const branches = sortBranches(index, currentBranches(patterns).filter((branch) => known(index, branch)));
  const pending = index.list.flatMap(({ pattern, rev }): PublicPattern[] => {
    const branch = branches.find((entry) => entry.patternId === pattern.id && entry.next === pattern.steps.length - 1);
    if (!branch || !pattern.pending || check(pattern.pending) !== "ok") return [];
    return [{ patternId: pattern.id, rev, phase: "pending", text: pattern.pending, evidence: evidence(branch.refs), boundary: branch.refs[branch.refs.length - 1].boundary }];
  });
  const completed = patterns.completed.filter((completion) => recent(state, completion) && completion.label && check(completion.label) === "ok")
    .map((completion): PublicPattern => ({
      patternId: completion.patternId, rev: completion.rev, phase: "completed", text: completion.label as string, evidence: evidence(completion.refs), boundary: completion.boundary,
    }));
  return [...pending, ...completed];
};

export const callbackLines = (story: NormalizedStory, patterns: PatternsState, state: EngineState, resting: PatternResting): RecapLine[] => {
  const check = publicCheck(story, state, resting);
  return patterns.completed.filter((completion) => completion.label && check(completion.label) === "ok")
    .map((completion) => ({ tier: "authored" as const, text: completion.label as string, because: false, boundary: completion.boundary }));
};

export const hintLines = (story: NormalizedStory, patterns: PatternsState, state: EngineState, resting: PatternResting): string[] => {
  const check = publicCheck(story, state, resting);
  return [...new Set(patterns.completed.filter((completion) => recent(state, completion) && completion.hint && check(completion.hint) === "ok")
    .map((completion) => completion.hint as string))];
};

const describeStep = (step: PatternStep | undefined): string => {
  if (!step) return "complete";
  const conditions = Object.entries(stepConditions(step)).map(([key, value]) => `${key} ${value}`).join(", ");
  return conditions ? `${step.kind}: ${conditions}` : step.kind;
};

const refLabel = (ref: PatternRef) => `${ref.kind} ${ref.id} @${ref.boundary}.${ref.index}`;

export const authorSlice = (story: NormalizedStory, patterns: PatternsState, state: EngineState, resting: PatternResting): PatternAuthorSlice => {
  const index = indexOf(story);
  const check = publicCheck(story, state, resting);
  const live = sortBranches(index, currentBranches(patterns).filter((branch) => known(index, branch))).map((branch) => {
    const pattern = index.byId.get(branch.patternId)?.pattern;
    return {
      patternId: branch.patternId, rev: branch.rev, next: branch.next, of: pattern?.steps.length ?? branch.next, nextStep: describeStep(pattern?.steps[branch.next]),
      refs: branch.refs.map(refLabel), bindings: Object.entries(branch.bindings).map(([name, value]) => `${name}=${value}`).join(", "),
    };
  });
  const texts = patterns.completed.flatMap((completion) => [completion.label, completion.hint].filter((text): text is string => Boolean(text)));
  return {
    live,
    ended: currentRing(patterns).map((entry) => ({ patternId: entry.patternId, reason: entry.reason, at: `${entry.ref.boundary}.${entry.ref.index}`, next: entry.next })),
    completed: [...patterns.completed].reverse().map((completion) => ({
      patternId: completion.patternId, boundary: completion.boundary, messageId: completion.messageId, refs: completion.refs.map(refLabel), text: completion.label ?? null,
      withheld: Boolean(completion.label && check(completion.label) !== "ok"),
    })),
    overflow: patterns.base.overflow + patterns.deltas.reduce((sum, delta) => sum + delta.overflow, 0),
    withheldSecret: texts.filter((text) => check(text) === "withheld-secret").length,
    gaps: patterns.gaps,
    partial: patterns.partial,
  };
};

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const list = <T,>(value: unknown, keep: (entry: unknown) => entry is T): T[] => (Array.isArray(value) ? value.filter(keep) : []);
const isCursor = (value: unknown): value is PatternCursor => isRecord(value) && isInt(value.boundary) && isInt(value.index);
const isRef = (value: unknown): value is PatternRef => isRecord(value) && isInt(value.boundary) && isInt(value.index) && typeof value.id === "string"
  && typeof value.kind === "string" && isInt(value.messageId);
const isBranch = (value: unknown): value is PatternBranch => isRecord(value) && typeof value.patternId === "string" && typeof value.rev === "string"
  && isInt(value.next) && isRecord(value.bindings) && Array.isArray(value.refs) && value.refs.every(isRef);
const isKill = (value: unknown): value is PatternKill => isRecord(value) && typeof value.patternId === "string" && typeof value.reason === "string"
  && isCursor(value.ref) && isInt(value.boundary);
const isCompletion = (value: unknown): value is PatternCompletion => isRecord(value) && typeof value.patternId === "string" && typeof value.occurrence === "string"
  && isInt(value.boundary) && Array.isArray(value.refs) && value.refs.every(isRef);
const isTombstone = (value: unknown): value is PatternTombstone => isRecord(value) && typeof value.patternId === "string" && isInt(value.boundary);
const isDelta = (value: unknown): value is PatternDelta => isRecord(value) && isInt(value.boundary) && Array.isArray(value.added) && value.added.every(isBranch)
  && Array.isArray(value.removed) && Array.isArray(value.killed);
const isGap = (value: unknown): value is PatternGap => isRecord(value) && isInt(value.from) && isInt(value.to) && typeof value.reason === "string";

export const sanitizeState = (value: unknown): PatternsState | undefined => {
  if (!isRecord(value) || !isRecord(value.base) || !isCursor(value.base.at)) return undefined;
  const base = value.base;
  return {
    base: { at: base.at as PatternCursor, branches: list(base.branches, isBranch), ring: list(base.ring, isKill).slice(-PATTERN_RING_CAP), overflow: isInt(base.overflow) ? base.overflow : 0 },
    deltas: list(value.deltas, isDelta).map((delta) => ({ ...delta, overflow: isInt(delta.overflow) ? delta.overflow : 0 })),
    tombstones: list(value.tombstones, isTombstone),
    completed: list(value.completed, isCompletion).slice(-PATTERN_COMPLETED_CAP),
    gaps: list(value.gaps, isGap).slice(-PATTERN_GAPS_CAP),
    partial: list(value.partial, (entry): entry is string => typeof entry === "string"),
  };
};
