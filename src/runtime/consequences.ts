import {
  checksById, evaluateGate, LIVING_PREFIX, milestoneEarned, questStatus, valueReader,
  type AppliedQueueEntry, type BoundaryLogEntry, type EngineState, type GateLeaf, type GateNode, type NormalizedStory, type NormalizedTransition,
  type Milestone, type PrimitiveValue, type Quest, type QuestStatus, type RecapText, type StoryCheck, type Transition,
} from "@engine/index";
import { gameLayer } from "@engine/validate/gameLayer";
import { playerRowRevision } from "@extraction/playerSpan";
import { questMoveText } from "@features/gameCopy";
import { recapBecauseText, recapCheckText, recapMilestoneText, recapReachedText, recapSectionLabel } from "./narrative";
import { playerCheckpointName, withheldNames } from "./playerProjection";
import { checkLabel, type CheckRecord } from "./storyCheckDraws";
import type { EffectRef, RecapRuntimeState, CauseRef } from "./recapPort";

export const RECAP_LINES = 5;
export const RECAP_RECENT_BOUNDARIES = 20;

export type RecapTier = "authored" | "evidenced" | "neutral";

export interface RecapLine {
  tier: RecapTier;
  text: string;
  because: boolean;
  boundary: number;
}

export interface RecapSection {
  label: string;
  lines: string[];
  personal: boolean;
}

export interface RecapView {
  story: NormalizedStory | null;
  state: EngineState | null;
  recap: RecapRuntimeState | undefined;
  chat: readonly unknown[];
}

type Values = Readonly<Record<string, PrimitiveValue>>;

interface StoryIndex {
  quests: Map<string, Quest>;
  milestones: Map<string, Milestone>;
  checks: Map<string, StoryCheck>;
  transitions: Map<string, Transition | null>;
}

const indexes = new WeakMap<NormalizedStory, StoryIndex>();

const indexOf = (story: NormalizedStory): StoryIndex => {
  const known = indexes.get(story);
  if (known) return known;
  const index = {
    quests: new Map((story.quests ?? []).map((quest) => [quest.id, quest])), milestones: new Map((story.milestones ?? []).map((milestone) => [milestone.id, milestone])),
    checks: checksById(story), transitions: new Map<string, Transition | null>(),
  };
  indexes.set(story, index);
  return index;
};

type Revisions = Map<number, string | null>;

const holds = (gate: GateNode | undefined, values: Values): boolean => !gate || evaluateGate(gate, valueReader(values));

export const chapterOf = (story: NormalizedStory, checkpointId: string): string | null =>
  story.chapterByCheckpoint?.[checkpointId] ?? story.checkpointById[checkpointId]?.chapter ?? null;

const flatLeaves = (gates: Array<GateNode | undefined>): GateLeaf[] | null => {
  const leaves: GateLeaf[] = [];
  const visit = (gate: GateNode): boolean => {
    if ("q" in gate) return leaves.push(gate) > 0;
    if ("all" in gate) return gate.all.every(visit);
    return false;
  };
  return gates.every((gate) => !gate || visit(gate)) ? leaves : null;
};

const okWrites = (applied: readonly AppliedQueueEntry[], key: string) => applied.flatMap((entry) => entry.deltas.flatMap((delta, index) =>
  (delta.q === key && entry.outcomes[index]?.ok ? [{ entry, delta }] : [])));

export function decidingCause(gates: Array<GateNode | undefined>, before: Values, now: Values, entry: Pick<BoundaryLogEntry, "queue">): CauseRef[] {
  const leaves = flatLeaves(gates);
  if (!leaves?.length) return [];
  const was = valueReader(before);
  const is = valueReader(now);
  if (leaves.every((leaf) => evaluateGate(leaf, was)) || !leaves.every((leaf) => evaluateGate(leaf, is))) return [];
  const keys = [...new Set(leaves.filter((leaf) => !evaluateGate(leaf, was)).map((leaf) => leaf.q))];
  if (keys.length !== 1) return [];
  const [key] = keys;
  const writes = okWrites(entry.queue.applied, key);
  const last = writes.at(-1);
  if (!last || new Set(writes.map((write) => String(write.delta.v))).size > 1) return [];
  const span = last.delta.playerSpan;
  if (!span || last.entry.source !== "extractor" || last.delta.source === "code") return [];
  if (now[key] !== last.delta.v || before[key] === last.delta.v) return [];
  return [{ key, value: last.delta.v, ...(last.entry.origin ? { origin: last.entry.origin } : {}), playerSpan: span }];
}

export const transitionId = (story: Pick<NormalizedStory, "transitions">, transition: Pick<NormalizedTransition, "from" | "to" | "declarationIndex">): string => {
  const occurrence = story.transitions.slice(0, transition.declarationIndex).filter((other) => other.from === transition.from && other.to === transition.to).length;
  return `${transition.from}->${transition.to}#${occurrence}`;
};

const transitionById = (story: NormalizedStory, id: string): Transition | null => {
  const cache = indexOf(story).transitions;
  if (cache.has(id)) return cache.get(id) ?? null;
  const match = /^(.*)->(.*)#(\d+)$/.exec(id);
  const found = match ? story.transitions.filter((transition) => transition.from === match[1] && transition.to === match[2])[Number(match[3])] ?? null : null;
  cache.set(id, found);
  return found;
};

const isLiving = (transition: Pick<Transition, "from" | "to">): boolean => transition.from.startsWith(LIVING_PREFIX) || transition.to.startsWith(LIVING_PREFIX);

const transitionCause = (story: NormalizedStory, entry: BoundaryLogEntry, fired: NormalizedTransition): CauseRef[] => {
  if (isLiving(fired) || !entry.evaluated) return [];
  const evaluated = valueReader(entry.evaluated);
  const rivals = (story.outgoingByCheckpoint[fired.from] ?? []).filter((transition) => transition.declarationIndex !== fired.declarationIndex && evaluateGate(transition.gate, evaluated));
  return rivals.length ? [] : decidingCause([fired.gate], entry.before.blackboard.values, entry.evaluated, entry);
};

const questGates = (quest: Quest, to: QuestStatus): Array<GateNode | undefined> | null => {
  if (to === "done") return [quest.visible_when, quest.done_when];
  if (to === "failed") return quest.failed_when ? [quest.visible_when, quest.failed_when] : null;
  if (to === "active") return quest.visible_when ? [quest.visible_when] : null;
  if (to === "offered") return quest.offered_when ? [quest.offered_when] : null;
  return null;
};

const questCause = (quest: Quest, to: QuestStatus, before: Values, after: Values, entry: BoundaryLogEntry): CauseRef[] => {
  const gates = questGates(quest, to);
  const steady = (gate: GateNode | undefined) => !gate || holds(gate, before) === holds(gate, after);
  const quiet = to === "offered" ? steady(quest.visible_when) : (to === "failed" || steady(quest.failed_when)) && (to === "done" || to === "failed" || steady(quest.done_when));
  return gates && quiet ? decidingCause(gates, before, after, entry) : [];
};

const transitionRef = (story: NormalizedStory, entry: BoundaryLogEntry, fired: NormalizedTransition) => {
  const target = story.checkpointById[fired.to];
  return {
    kind: "transition" as const, id: transitionId(story, fired), from: fired.from, to: fired.to,
    visible: Boolean(target && playerCheckpointName(target)), authored: holds(fired.recap_when, entry.after.blackboard.values), causes: transitionCause(story, entry, fired),
  };
};

const questRefs = (story: NormalizedStory, entry: BoundaryLogEntry) => {
  const before = entry.before.blackboard.values;
  const after = entry.after.blackboard.values;
  return (story.quests ?? []).flatMap((quest) => {
    const from = questStatus(quest, valueReader(before));
    const to = questStatus(quest, valueReader(after));
    if (from === to) return [];
    const causes = to === "hidden" ? [] : questCause(quest, to, before, after, entry);
    return [{ kind: "quest" as const, id: quest.id, from, to, visible: to !== "hidden", authored: holds(quest.recap_when, after), causes }];
  });
};

const milestoneRefs = (story: NormalizedStory, entry: BoundaryLogEntry) => {
  const before = entry.before.blackboard.values;
  const after = entry.after.blackboard.values;
  return (story.milestones ?? []).filter((milestone) => !milestoneEarned(milestone, valueReader(before)) && milestoneEarned(milestone, valueReader(after)))
    .map((milestone) => ({ kind: "milestone" as const, id: milestone.id, visible: true, authored: holds(milestone.recap_when, after), causes: decidingCause([milestone.when], before, after, entry) }));
};

const checkRefs = (story: NormalizedStory, entry: BoundaryLogEntry, records: readonly CheckRecord[]) => {
  const byId = checksById(story);
  return records.filter((record) => record.boundary === entry.boundary).map((record) => ({
    kind: "check" as const, id: record.checkId, to: record.outcome, visible: byId.get(record.checkId)?.narrate === "public", authored: false, causes: [],
  }));
};

const agendaRefs = (story: NormalizedStory, entry: BoundaryLogEntry) => (story.life
  ? gameLayer()?.life.landedSteps(story, entry.before.blackboard.values, entry.after.blackboard.values) ?? [] : [])
  .map((landed) => ({ kind: "agenda" as const, id: `${landed.memberId}:${landed.agendaId}:${landed.index}`, visible: landed.step.public === true, authored: false, causes: [] }));

export function deriveRefs(story: NormalizedStory, entry: BoundaryLogEntry, records: readonly CheckRecord[] = []): EffectRef[] {
  const at = { boundary: entry.boundary, messageId: entry.context.lastMessageId, chapterId: chapterOf(story, entry.before.activeCheckpointId) };
  const fired = entry.fired && entry.source === "gate" ? [transitionRef(story, entry, entry.fired)] : [];
  return [...fired, ...questRefs(story, entry), ...milestoneRefs(story, entry), ...checkRefs(story, entry, records), ...agendaRefs(story, entry)]
    .map((ref): EffectRef => ({ ...ref, ...at }));
}

export const recapWithheld = (story: NormalizedStory, state: EngineState): string[] => {
  const reader = valueReader(state.blackboard.values);
  const shownQuests = new Set((story.quests ?? []).filter((quest) => questStatus(quest, reader) !== "hidden").map((quest) => quest.title.trim()));
  const secret = (story.milestones ?? []).filter((milestone) => milestone.secret && !milestoneEarned(milestone, reader)).map((milestone) => milestone.title.trim());
  return [...withheldNames(story, state.visitedPath, state.activeCheckpointId).filter((name) => !shownQuests.has(name)), ...secret.filter((name) => name.length >= 4)];
};

const naming = (withheld: readonly string[]) => (text: string): boolean => {
  const lower = text.toLowerCase();
  return withheld.some((name) => lower.includes(name.toLowerCase()));
};

const agendaStep = (story: NormalizedStory, id: string) => {
  const [memberId, agendaId, index] = id.split(":");
  return story.life?.members.find((member) => member.id === memberId)?.agenda.find((agenda) => agenda.id === agendaId)?.steps[Number(index)] ?? null;
};

export function neutralText(story: NormalizedStory, ref: EffectRef): string | null {
  if (!ref.visible) return null;
  if (ref.kind === "transition") {
    const target = ref.to ? story.checkpointById[ref.to] : undefined;
    const name = target ? playerCheckpointName(target) : null;
    return name ? recapReachedText(name) : null;
  }
  if (ref.kind === "quest") {
    const quest = indexOf(story).quests.get(ref.id);
    return quest && ref.to && ref.to !== "hidden" ? questMoveText(ref.to as Exclude<QuestStatus, "hidden">, quest.title, quest.labels) : null;
  }
  if (ref.kind === "milestone") {
    const milestone = indexOf(story).milestones.get(ref.id);
    return milestone ? recapMilestoneText(milestone.title) : null;
  }
  if (ref.kind === "check") {
    const check = indexOf(story).checks.get(ref.id);
    return check?.narrate === "public" && ref.to ? recapCheckText(checkLabel(story, check), ref.to) : null;
  }
  const step = agendaStep(story, ref.id);
  return step?.public ? step.text : null;
}

const authoredOf = (story: NormalizedStory, ref: EffectRef): RecapText | null => {
  if (!ref.authored) return null;
  if (ref.kind === "transition") return transitionById(story, ref.id)?.recap ?? null;
  if (ref.kind === "milestone") return indexOf(story).milestones.get(ref.id)?.recap ?? null;
  if (ref.kind === "quest" && (ref.to === "done" || ref.to === "failed")) return indexOf(story).quests.get(ref.id)?.recap?.[ref.to] ?? null;
  return null;
};

const revisionAt = (chat: readonly unknown[], messageId: number, revisions: Revisions): string | null => {
  if (!revisions.has(messageId)) revisions.set(messageId, playerRowRevision(chat[messageId]));
  return revisions.get(messageId) ?? null;
};

export const evidencedCause = (ref: EffectRef, chat: readonly unknown[], revisions: Revisions = new Map()): CauseRef | null => {
  const cause = ref.causes[0];
  if (!cause || ref.causes.length !== 1 || (ref.kind === "transition" && (ref.to?.startsWith(LIVING_PREFIX) || ref.from?.startsWith(LIVING_PREFIX)))) return null;
  return revisionAt(chat, cause.playerSpan.messageId, revisions) === cause.playerSpan.revision ? cause : null;
};

export function lineFor(story: NormalizedStory, ref: EffectRef, chat: readonly unknown[], withheld: readonly string[], revisions: Revisions = new Map()): RecapLine | null {
  const neutral = neutralText(story, ref);
  if (!neutral) return null;
  const hides = naming(withheld);
  const line = (tier: RecapTier, text: string, because: boolean): RecapLine | null => (hides(text) ? null : { tier, text, because, boundary: ref.boundary });
  const authored = authoredOf(story, ref);
  const cause = evidencedCause(ref, chat, revisions);
  const clause = cause ? story.qualityByKey[cause.key]?.player_action?.[String(cause.value)] : undefined;
  const candidates: Array<RecapLine | null> = [
    cause && authored?.because ? line("authored", authored.because, true) : null,
    authored?.text ? line("authored", authored.text, false) : null,
    cause && clause ? line("evidenced", recapBecauseText(neutral, clause), true) : null,
    line("neutral", neutral, false),
  ];
  return candidates.find((candidate): candidate is RecapLine => candidate !== null) ?? null;
}

const TIER_RANK: Record<RecapTier, number> = { authored: 0, evidenced: 1, neutral: 2 };

export function composeLines(story: NormalizedStory, state: EngineState, refs: readonly EffectRef[], chat: readonly unknown[], limit = RECAP_LINES): RecapLine[] {
  const withheld = recapWithheld(story, state);
  const revisions: Revisions = new Map();
  const ranked = refs.flatMap((ref, order) => {
    const line = lineFor(story, ref, chat, withheld, revisions);
    return line ? [{ line, order }] : [];
  }).sort((left, right) => TIER_RANK[left.line.tier] - TIER_RANK[right.line.tier] || right.line.boundary - left.line.boundary || right.order - left.order);
  const seen = new Set<string>();
  return ranked.map(({ line }) => line).filter((line) => {
    if (seen.has(line.text)) return false;
    seen.add(line.text);
    return true;
  }).slice(0, limit);
}

const sectionOf = (lines: RecapLine[], recent: boolean): RecapSection | null => {
  if (!lines.length) return null;
  const personal = lines.some((line) => line.tier !== "neutral");
  return { label: recapSectionLabel(personal, recent), lines: lines.map((line) => line.text), personal };
};

const trailingRun = (refs: readonly EffectRef[], end: number, chapterId: string | null): EffectRef[] => {
  let start = end;
  while (start > 0 && refs[start - 1].chapterId === chapterId) start -= 1;
  return refs.slice(start, end);
};

export function currentRefs(story: NormalizedStory, state: EngineState, refs: readonly EffectRef[]): { refs: EffectRef[]; recent: boolean } {
  if (!story.chapters?.length) return { refs: refs.filter((ref) => ref.boundary > state.boundary - RECAP_RECENT_BOUNDARIES), recent: true };
  return { refs: trailingRun(refs, refs.length, chapterOf(story, state.activeCheckpointId)), recent: false };
}

export function currentSection(view: RecapView): RecapSection | null {
  const { story, state } = view;
  if (!story || !state || !view.recap?.refs.length) return null;
  const scoped = currentRefs(story, state, view.recap.refs);
  return sectionOf(composeLines(story, state, scoped.refs, view.chat), scoped.recent);
}

export function cardSections(view: RecapView): Record<number, RecapSection> {
  const { story, state } = view;
  const refs = view.recap?.refs ?? [];
  if (!story?.chapters?.length || !state || !refs.length) return {};
  const sections: Record<number, RecapSection> = {};
  refs.forEach((ref, index) => {
    if (ref.kind !== "transition" || !ref.to || chapterOf(story, ref.to) === ref.chapterId) return;
    let end = index + 1;
    while (end < refs.length && refs[end].boundary === ref.boundary) end += 1;
    const section = sectionOf(composeLines(story, state, trailingRun(refs, end, ref.chapterId), view.chat), false);
    if (section) sections[ref.messageId] = section;
  });
  return sections;
}
