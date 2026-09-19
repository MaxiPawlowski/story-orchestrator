import { HEADING_P, PRESENT_P, SCENE_FIELD_CONFIDENCE, SCENE_TRIGGER } from "./policy";
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
  reachable?: Array<{ id: string; name: string; objective: string }>;
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
