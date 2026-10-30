import { unitDraw } from "@engine/chance";
import { knownEntities, unknownEntityNames } from "@engine/codex";
import {
  checkAttempted, checkRolledKey, checksAt, evaluateGate, isClosed, questStatus, stepStatus, valueReader,
  type CheckpointOffer, type EngineState, type NormalizedStory, type PrimitiveValue,
} from "@engine/index";
import { arcDeferred, openArcs, withoutExcludedThreads, type ArcEntry, type DerivedRecord } from "@memory/index";
import type { PlayerPromise } from "@memory/promises/types";
import { termPresent } from "@utils/termPresent";
import type { GameView } from "./gameTypes";
import type { PublicPattern } from "./patternsPort";
import type { PlayedProjection } from "./playerProjection";
import { currentThreads } from "./recapCurrent";
import { checkLabel } from "./storyCheckDraws";
import { namesIn } from "./suggestions";

export const ANCHOR_KINDS = ["objective", "quest-step", "quest", "thread", "dormant-thread", "promise", "clue-action", "check-help", "offer", "pattern"] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export const ANCHOR_WEIGHTS: Readonly<Record<AnchorKind, number>> = {
  objective: 3, "quest-step": 3, pattern: 3, promise: 2, thread: 2, "check-help": 2, offer: 2, quest: 1.5, "dormant-thread": 1, "clue-action": 1,
};

export const RESURFACE_BONUS = 1.5;
export const RESURFACE_BOUNDARIES = 4;
export const ANCHOR_LIMIT = 3;
export const ANCHOR_BLOCK_CHARS = 600;
const UNKNOWN_NAME_MIN = 3;

export interface SuggestionAnchor {
  id: string;
  kind: AnchorKind;
  text: string;
  weight: number;
  evidence: string[];
}

export type Screen = (text: string) => boolean;

export interface ScreenSources {
  story: NormalizedStory;
  values: Readonly<Record<string, unknown>>;
  enabled: readonly string[];
  resting: (text: string) => string;
  unseen: readonly string[];
}

export const makeScreen = (sources: ScreenSources): Screen => {
  const unknown = unknownEntityNames(sources.story, knownEntities(sources.story, sources.values as Record<string, PrimitiveValue>, sources.enabled))
    .filter((name) => name.length >= UNKNOWN_NAME_MIN);
  return (text) => {
    const line = text.trim();
    if (!line || sources.resting(line).trim() !== line) return false;
    return !namesIn(line, sources.unseen) && !namesIn(line, unknown);
  };
};

export interface StakesHint {
  text: string;
  have: boolean;
}

export interface StakesLine {
  checkId: string;
  label: string;
  hints: StakesHint[];
}

export interface GreyedOffer {
  id: string;
  text: string;
  reason: string;
}

type Values = Readonly<Record<string, PrimitiveValue>>;

const pendingHere = (story: NormalizedStory, state: EngineState) => {
  const values = state.blackboard.values as Values;
  const reader = valueReader(values);
  return checksAt(story, state.activeCheckpointId).filter((active) => {
    if (active.check.narrate !== "public") return false;
    if (active.check.hint_when && !evaluateGate(active.check.hint_when, reader)) return false;
    if (active.transition) return !checkAttempted(active, reader);
    const rolled = values[checkRolledKey(active.check.id)];
    return Boolean(active.check.when) && !(typeof rolled === "number" && rolled > state.checkpointStartedBoundary);
  });
};

export const stakesLines = (story: NormalizedStory, state: EngineState, screen: Screen): StakesLine[] => {
  const values = state.blackboard.values as Values;
  return pendingHere(story, state).flatMap(({ check }) => {
    const label = checkLabel(story, check);
    if (!screen(label)) return [];
    const hints = (check.modifiers ?? []).filter((modifier) => modifier.hint && modifier.add > 0 && screen(modifier.hint))
      .map((modifier) => ({ text: modifier.hint as string, have: Boolean(story.qualityByKey[modifier.q]?.display) && values[modifier.q] === modifier.v }));
    return hints.length ? [{ checkId: check.id, label, hints }] : [];
  });
};

export interface OfferRows {
  available: CheckpointOffer[];
  unavailable: GreyedOffer[];
}

export const offerRows = (story: NormalizedStory, state: EngineState, screen: Screen): OfferRows => {
  const reader = valueReader(state.blackboard.values as Values);
  const shown = (story.checkpointById[state.activeCheckpointId]?.offers ?? [])
    .filter((offer) => (!offer.visible_when || evaluateGate(offer.visible_when, reader)) && screen(offer.text));
  return {
    available: shown.filter((offer) => !offer.needs || evaluateGate(offer.needs.when, reader)),
    unavailable: shown.flatMap((offer) => (offer.needs && !evaluateGate(offer.needs.when, reader) && screen(offer.needs.reason)
      ? [{ id: offer.id, text: offer.text, reason: offer.needs.reason }] : [])),
  };
};

export interface AnchorSources {
  story: NormalizedStory;
  state: EngineState;
  projection: PlayedProjection;
  arcs: readonly ArcEntry[];
  derived?: readonly DerivedRecord[];
  promises: readonly PlayerPromise[];
  patterns: readonly PublicPattern[];
  game: GameView | null;
  valuesThen: Readonly<Record<string, unknown>> | null;
}

const anchor = (kind: AnchorKind, id: string, text: string, evidence: string[], weight = ANCHOR_WEIGHTS[kind]): SuggestionAnchor =>
  ({ id: `${kind}:${id}`, kind, text: text.trim(), weight, evidence });

const questAnchors = (story: NormalizedStory, values: Values): SuggestionAnchor[] => {
  const reader = valueReader(values);
  return (story.quests ?? []).filter((quest) => questStatus(quest, reader) === "active").map((quest) => {
    const at = quest.steps.findIndex((step) => stepStatus(step, reader) === "open");
    return at >= 0 ? anchor("quest-step", `${quest.id}.${at}`, quest.steps[at].text, [`quest ${quest.id} step ${at + 1}`]) : anchor("quest", quest.id, quest.title, [`quest ${quest.id}`]);
  });
};

const closedSince = (story: NormalizedStory, then: Readonly<Record<string, unknown>> | null, now: Values): boolean => {
  if (!then) return false;
  const before = valueReader(then as Values);
  const after = valueReader(now);
  return (story.quests ?? []).some((quest) => (!isClosed(questStatus(quest, before)) && isClosed(questStatus(quest, after)))
    || quest.steps.some((step) => stepStatus(step, before) === "open" && ["done", "failed"].includes(stepStatus(step, after))));
};

const threadAnchors = (sources: AnchorSources): SuggestionAnchor[] => {
  const { state } = sources;
  const kept = withoutExcludedThreads([...sources.arcs], sources.derived ? [...sources.derived] : undefined);
  const current = new Set(currentThreads(kept, state.checkpointStartedBoundary, state.boundary));
  const resurfaced = sources.arcs.some((arc) => arc.status === "resolved" && (arc.resolvedAt ?? -1) > state.boundary - RESURFACE_BOUNDARIES)
    || closedSince(sources.story, sources.valuesThen, state.blackboard.values as Values);
  return openArcs(kept).filter((arc) => !arc.foldedInto).map((arc) => (current.has(arc.text) && !arcDeferred(arc)
    ? anchor("thread", arc.id, arc.text, [`arc ${arc.id}`])
    : anchor("dormant-thread", arc.id, arc.text, [`arc ${arc.id}, opened at boundary ${arc.openedAt}`], ANCHOR_WEIGHTS["dormant-thread"] + (resurfaced ? RESURFACE_BONUS : 0))));
};

const clueAnchors = (game: GameView | null): SuggestionAnchor[] => (game?.widgets ?? []).filter((widget) => widget.audience === "player").flatMap((widget) => {
  const body = widget.body;
  const actions = body.kind === "clues" ? body.clues.map((clue) => clue.action) : body.kind === "map" ? body.pins.map((pin) => pin.action) : [];
  return actions.flatMap((action, at) => (action ? [anchor("clue-action", `${widget.id}.${at}`, action, [`panel ${widget.id}`])] : []));
});

export const anchorCandidates = (sources: AnchorSources, screen: Screen): SuggestionAnchor[] => {
  const { story, state, projection } = sources;
  const values = state.blackboard.values as Values;
  const objective = projection.current?.text ? [anchor("objective", state.activeCheckpointId, projection.current.text, [`checkpoint ${state.activeCheckpointId}`])] : [];
  const promises = sources.promises.filter((row) => screen(row.quote) && screen(row.promisee))
    .map((row) => anchor("promise", row.id, `your promise to ${row.promisee}: "${row.quote}"`, [`promise ${row.id}`]));
  const patterns = sources.patterns.filter((row) => row.phase === "pending")
    .map((row) => anchor("pattern", `${row.patternId}@${row.rev}`, row.text, row.evidence.map((ref) => `${ref.kind} ${ref.id} at boundary ${ref.boundary}`)));
  const stakes = stakesLines(story, state, screen)
    .map((line) => anchor("check-help", line.checkId, `${line.label}: ${line.hints.map((hint) => hint.text).join(", ")} could help`, [`check ${line.checkId}`]));
  const offers = offerRows(story, state, screen).available.map((offer) => anchor("offer", offer.id, offer.text, [`offer ${offer.id}`]));
  return [...objective, ...questAnchors(story, values), ...threadAnchors(sources), ...promises, ...clueAnchors(sources.game), ...stakes, ...offers, ...patterns]
    .filter((entry) => screen(entry.text));
};

export interface RotationSeed {
  chatId: string;
  storyId: string;
  boundary: number;
  again: number;
}

export const rankAnchors = (candidates: readonly SuggestionAnchor[], seed: RotationSeed): SuggestionAnchor[] => {
  const draw = new Map(candidates.map((entry) => [entry.id, unitDraw([seed.chatId, seed.storyId, seed.boundary, `suggest:${entry.id}`, seed.again])]));
  return [...candidates].sort((left, right) => right.weight - left.weight || (draw.get(left.id) ?? 0) - (draw.get(right.id) ?? 0) || left.id.localeCompare(right.id));
};

export const selectAnchors = (ranked: readonly SuggestionAnchor[], limit = ANCHOR_LIMIT): SuggestionAnchor[] => {
  const picked: SuggestionAnchor[] = [];
  let chars = 0;
  for (const entry of ranked) {
    if (picked.length >= limit) break;
    if (entry.kind !== "quest-step" && picked.some((chosen) => chosen.kind === entry.kind)) continue;
    if (picked.some((chosen) => chosen.text.toLowerCase() === entry.text.toLowerCase())) continue;
    const cost = entry.text.length + 5;
    if (chars + cost > ANCHOR_BLOCK_CHARS) continue;
    chars += cost;
    picked.push(entry);
  }
  return picked;
};

const CONTENT_FILLER = new Set(["your", "with", "from", "that", "this", "what", "have", "will", "could", "help", "promise", "about", "into", "their", "there", "them", "then"]);

export const contentTerms = (text: string): string[] =>
  [...new Set((text.toLowerCase().match(/[\p{L}']+/gu) ?? []).map((word) => word.replace(/'s$/, "")).filter((word) => word.length >= 4 && !CONTENT_FILLER.has(word)))];

export const groundedIn = (line: string, entry: Pick<SuggestionAnchor, "text">): boolean =>
  contentTerms(entry.text).some((term) => termPresent(line, term.length > 5 ? term.slice(0, term.length - 1) : term, "prefix"));
