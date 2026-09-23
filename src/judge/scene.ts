import { HEADING_P, PRESENT_P, SCENE_FIELD_CONFIDENCE, SCENE_STALE_AFTER, SCENE_TRIGGER } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer } from "./questions";
import type { JudgeAnswer, JudgeOption, JudgeRequest } from "./types";

export const SCENE_TIMES = ["dawn", "morning", "midday", "afternoon", "evening", "night"] as const;
export const SCENE_LOCATION_ELSEWHERE = "elsewhere";
export const SCENE_UNCLEAR = "unclear";
export const SCENE_MAX_REACHABLE = 6;

export const SCENE_BREAK_QUESTION = "Does the latest message in `transcript` start a new scene compared with the messages before it?";
export const SCENE_BREAK_CRITERIA = {
  true: "The story cuts forward in time, moves to a different place, or passes an explicit scene divider",
  false: "The same scene continues: someone arrives, characters move around the same place, talk about other times or places, or pause",
} as const;
export const SCENE_BREAK_TYPES = {
  time_skip: "A jump forward in time",
  location: "A move to a different place",
  divider: "An explicit divider such as * * * or ---",
  none: "No scene break",
} as const;

export type SceneBreakType = keyof typeof SCENE_BREAK_TYPES;

export interface SceneFamilies {
  sceneBreak: boolean;
  tracker: boolean;
  lookahead: boolean;
}

export interface SceneReadInput {
  storyTitle: string;
  checkpointName: string;
  objective: string;
  cast: Array<{ rosterId: string; name: string; role?: string }>;
  player: string;
  locations?: string[];
  times?: string[];
  reachable?: Array<{ id: string; name: string; objective: string; hops?: number }>;
  window: Array<{ speaker: string; text: string }>;
  families: SceneFamilies;
}

export interface SceneField {
  value: string;
  confidence: number;
}

export interface SceneAnswers {
  sceneBreak?: { p: number; type: SceneBreakType | null };
  location?: SceneField;
  time?: SceneField;
  present?: Record<string, number>;
  headingTo?: Record<string, number>;
}

export interface SceneFacts {
  location: string | null;
  time: string | null;
  present: string[];
  headingTo: string[];
}

const timesOf = (input: SceneReadInput) => (input.times?.length ? input.times : [...SCENE_TIMES]);
const locationsOf = (input: SceneReadInput) => (input.locations ?? []).filter((place) => place && place !== SCENE_LOCATION_ELSEWHERE && place !== SCENE_UNCLEAR);
const reachableOf = (input: SceneReadInput) => (input.families.lookahead ? (input.reachable ?? []).slice(0, SCENE_MAX_REACHABLE) : []);
const asksLocation = (input: SceneReadInput) => input.families.tracker && locationsOf(input).length > 0;
const blankOptions = (values: string[]): Record<string, JudgeOption> => Object.fromEntries(values.map((value) => [value, null]));

// Spike shape (experiments/sceneRead.mts): one state, every family's questions fanned out over it.
export function buildSceneReadRequest(input: SceneReadInput): JudgeRequest {
  const reachable = reachableOf(input);
  const state: Record<string, unknown> = {
    story: { title: input.storyTitle },
    scene: { checkpoint: input.checkpointName, objective: input.objective },
    cast: input.cast.map((member) => (member.role ? { name: member.name, role: member.role } : { name: member.name })),
    player: input.player,
    ...(asksLocation(input) ? { locations: locationsOf(input) } : {}),
    ...(input.families.tracker ? { times: timesOf(input) } : {}),
    ...(reachable.length ? { reachable: reachable.map((entry) => ({ name: entry.name, objective: entry.objective })) } : {}),
    transcript: input.window.map((line, index) => ({ id: `msg_${index + 1}`, speaker: line.speaker, text: line.text })),
  };
  const questions: JudgeRequest["questions"] = {};
  if (input.families.sceneBreak) {
    questions.scene_break = noul(SCENE_BREAK_QUESTION, { ...SCENE_BREAK_CRITERIA });
    questions.scene_break_type = choice("If the latest message in `transcript` starts a new scene, what kind of break is it?", { ...SCENE_BREAK_TYPES });
  }
  if (asksLocation(input)) {
    questions.location = choice("Where is the scene taking place at the end of `transcript`? Pick one of `locations`.", {
      ...blankOptions(locationsOf(input)),
      [SCENE_LOCATION_ELSEWHERE]: "Somewhere not listed in `locations`",
      [SCENE_UNCLEAR]: "The transcript does not make the place clear",
    });
  }
  if (input.families.tracker) {
    questions.time = choice("What time of day is it in the scene at the end of `transcript`?", { ...blankOptions(timesOf(input)), [SCENE_UNCLEAR]: "The transcript gives no cue for the time of day" });
    input.cast.forEach((member) => {
      const who = member.role ? `${member.name} (${member.role})` : member.name;
      questions[`present:${member.rosterId}`] = noul(`Is ${who} physically present in the scene at the end of \`transcript\`?`);
    });
  }
  reachable.forEach((entry) => {
    questions[`heading:${entry.id}`] = noul(`Is the play in \`transcript\` moving toward: ${entry.name} — ${entry.objective}?`);
  });
  return { state, questions };
}

const field = (answers: Record<string, JudgeAnswer>, id: string): SceneField | undefined => {
  const answer = choiceAnswer(answers, id);
  return answer ? { value: answer.choice, confidence: answer.confidence } : undefined;
};

const probabilities = (answers: Record<string, JudgeAnswer>, prefix: string, ids: string[]): Record<string, number> | undefined => {
  const found = ids.flatMap((id) => {
    const p = noulAnswer(answers, `${prefix}:${id}`);
    return p === null ? [] : [[id, p] as const];
  });
  return found.length ? Object.fromEntries(found) : undefined;
};

export function readScene(answers: Record<string, JudgeAnswer>, input: SceneReadInput): SceneAnswers {
  const out: SceneAnswers = {};
  const breakP = noulAnswer(answers, "scene_break");
  if (input.families.sceneBreak && breakP !== null) {
    const type = choiceAnswer(answers, "scene_break_type")?.choice;
    out.sceneBreak = { p: breakP, type: type && type in SCENE_BREAK_TYPES ? (type as SceneBreakType) : null };
  }
  if (asksLocation(input)) out.location = field(answers, "location");
  if (input.families.tracker) {
    out.time = field(answers, "time");
    out.present = probabilities(answers, "present", input.cast.map((member) => member.rosterId));
  }
  if (input.families.lookahead) out.headingTo = probabilities(answers, "heading", reachableOf(input).map((entry) => entry.id));
  return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined)) as SceneAnswers;
}

export const sceneBreakTriggered = (read: SceneAnswers) => (read.sceneBreak?.p ?? 0) >= SCENE_TRIGGER;

const overFloor = (value: SceneField | undefined) =>
  value && value.confidence >= SCENE_FIELD_CONFIDENCE && value.value !== SCENE_UNCLEAR && value.value !== SCENE_LOCATION_ELSEWHERE ? value.value : null;

export function sceneFacts(read: SceneAnswers, cast: Array<{ rosterId: string; name: string }>): SceneFacts {
  return {
    location: overFloor(read.location),
    time: overFloor(read.time),
    present: cast.filter((member) => (read.present?.[member.rosterId] ?? 0) >= PRESENT_P).map((member) => member.name),
    headingTo: Object.entries(read.headingTo ?? {}).filter(([, p]) => p >= HEADING_P).sort((left, right) => right[1] - left[1]).map(([id]) => id),
  };
}

export function sceneTrackerText(facts: SceneFacts): string | null {
  const where = [facts.location, facts.time].filter(Boolean).join(", ");
  const parts = [where ? `Scene: ${where}.` : "", facts.present.length ? `Present: ${facts.present.join(", ")}.` : ""].filter(Boolean);
  return parts.length ? `[${parts.join(" ")}]` : null;
}

/**
 * C2 (v2.3 plan 03): how far the stored read can still be trusted. A read that does not answer —
 * a timeout, an error, an unreachable plugin — used to leave the previous record untouched, so a
 * tracker that had not worked for ten minutes looked exactly like one that answered a second ago.
 * `failures` counts consecutive misses; past `SCENE_STALE_AFTER` the tracker is withheld rather
 * than presented as current.
 */
export interface SceneFreshness {
  failures: number;
  /** ISO time of the first failure in the current run of them. */
  staleSince: string | null;
  /** The boundary the record was last confirmed at. */
  confirmedBoundary: number;
}

export interface SceneReadRecord {
  at: string;
  boundary: number;
  messageId: number;
  model: string | null;
  freshness?: SceneFreshness;
  /**
   * v2.3 plan 05. Where this read came from. It is the same envelope every derived record carries
   * (`@memory/provenance`), declared structurally here because the judge core is pure and may not
   * import the memory layer.
   */
  provenance?: {
    source: "extractor" | "judge" | "author" | "code" | "curator" | "blackboard" | "legacy";
    messageId: number;
    boundary: number;
    pass: string;
    sourceRevision?: number;
    inputs?: Array<{ store: "memory" | "ledger" | "epistemic" | "scene" | "blackboard"; id: string }>;
    confidence?: number;
    validity: "live" | "superseded" | "source-removed" | "conflicted" | "quarantined";
  };
  sceneBreak?: { p: number; type: SceneBreakType | null; triggered: boolean };
  location?: SceneField;
  time?: SceneField;
  present?: Array<{ id: string; name: string; p: number }>;
  headingTo?: Array<{ id: string; name: string; p: number; hops: number }>;
  facts: SceneFacts;
}

/**
 * C2 (v2.3 plan 03): has the judge failed to confirm this scene often enough to stop asserting it?
 *
 * It lives here, in the pure module, rather than on the coordinator, because four consumers have
 * to agree about it — the injected tracker block, the player's "where you are" line, the
 * look-ahead that reads `headingTo`, and the scene macros. Each deciding for itself is how a
 * withheld tracker ends up still being shown somewhere.
 */
export const isSceneStale = (record: SceneReadRecord | null | undefined): boolean =>
  (record?.freshness?.failures ?? 0) >= SCENE_STALE_AFTER;

/** The facts, or null once they can no longer be asserted. The one accessor every reader uses. */
export const confirmedSceneFacts = (record: SceneReadRecord | null | undefined): SceneFacts | null =>
  !record || isSceneStale(record) ? null : record.facts;

export function toSceneRecord(read: SceneAnswers, input: SceneReadInput, meta: { at: string; boundary: number; messageId: number; model: string | null }): SceneReadRecord {
  const facts = sceneFacts(read, input.cast);
  const reachable = input.reachable ?? [];
  const families = Object.entries(input.families).filter(([, on]) => on).map(([name]) => name);
  // The read describes the messages it was handed, so its inputs name that span: an edit inside it
  // invalidates the facts derived from it, and the confidence is the weakest answer it rested on.
  const confidences = [read.location?.confidence, read.time?.confidence].filter((value): value is number => typeof value === "number");
  return {
    ...meta,
    provenance: {
      source: "judge",
      messageId: meta.messageId,
      boundary: meta.boundary,
      pass: `scene:${families.join("+")}`,
      inputs: [{ store: "scene", id: `window:${meta.messageId}` }],
      ...(confidences.length ? { confidence: Math.min(...confidences) } : {}),
      validity: "live",
    },
    ...(read.sceneBreak ? { sceneBreak: { ...read.sceneBreak, triggered: sceneBreakTriggered(read) } } : {}),
    ...(read.location ? { location: read.location } : {}),
    ...(read.time ? { time: read.time } : {}),
    ...(read.present ? { present: input.cast.filter((member) => member.rosterId in read.present!).map((member) => ({ id: member.rosterId, name: member.name, p: read.present![member.rosterId] })) } : {}),
    ...(read.headingTo ? { headingTo: reachable.filter((entry) => entry.id in read.headingTo!).map((entry) => ({ id: entry.id, name: entry.name, p: read.headingTo![entry.id], hops: entry.hops ?? 1 })) } : {}),
    facts: { ...facts, headingTo: facts.headingTo.map((id) => reachable.find((entry) => entry.id === id)?.name ?? id) },
  };
}
