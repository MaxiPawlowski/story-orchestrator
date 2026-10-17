import { unitDraw, type ChancePart } from "@engine/chance";
import { LIVING_OPENING_ID, TENSION_LEVELS, type NormalizedStoryV2, type TensionLevel } from "@engine/index";
import { focusPick, focusSafe, type FocusCandidate } from "@pacing/focus";
import { isEligibleFrontier } from "./frontier";
import type { LivingRuntimeState } from "./types";

export const SCENE_OUTCOMES = ["expected", "altered", "interrupt"] as const;
export type SceneOutcome = (typeof SCENE_OUTCOMES)[number];
export const SCENE_CHANGES = ["place", "cast", "timing", "obstacle"] as const;
export const SCENE_MIN_GAP_DEFAULT = 2;
export const SCENE_INTERRUPT_SHARE = 0.4;
export const SCENE_CHAOS_STEPS = 7;
export const SCENE_DRAW_TAG = "scene-test";

export interface SceneIds {
  chatId: string;
  storyId: string;
}

export interface SceneExpected {
  from: string;
  thread: string | null;
}

export interface SceneTestRecord {
  frontierId: string;
  plannedAt: number;
  messageId: number;
  chaos: number;
  p: number;
  unit: number;
  drawn: SceneOutcome;
  applied: SceneOutcome;
  focus?: string;
  expected: SceneExpected;
}

export interface SceneSignal {
  applied: Exclude<SceneOutcome, "expected">;
  focus?: string;
  expected: SceneExpected;
}

export interface SceneAnswer {
  changed?: string[];
  advances?: string;
}

export interface ScenePlanInput {
  story: Pick<NormalizedStoryV2, "living">;
  ids: SceneIds;
  frontierId: string;
  frontierName: string;
  plannedAt: number;
  messageId: number;
  tension: TensionLevel | null;
  candidates: readonly FocusCandidate[];
  prior: readonly SceneTestRecord[];
}

export const sceneChaos = (tension: TensionLevel | null): number => Math.max(0, tension ? TENSION_LEVELS.indexOf(tension) : 0);

export const sceneProbability = (chaos: number): number => (chaos + 1) / SCENE_CHAOS_STEPS;

export const sceneDrawParts = (ids: SceneIds, frontierId: string, plannedAt: number, tag: string): ChancePart[] => [ids.chatId, ids.storyId, frontierId, plannedAt, tag];

export const drawSceneOutcome = (p: number, unit: number, kind: number): SceneOutcome =>
  (unit >= p ? "expected" : kind < SCENE_INTERRUPT_SHARE ? "interrupt" : "altered");

export const sceneTestApplies = (story: Pick<NormalizedStoryV2, "living">, frontierId: string): boolean =>
  Boolean(story.living?.scene_test) && frontierId !== LIVING_OPENING_ID;

export const sceneMinGap = (story: Pick<NormalizedStoryV2, "living">): number => story.living?.scene_test?.min_gap ?? SCENE_MIN_GAP_DEFAULT;

export const spacedOutcome = (drawn: SceneOutcome, prior: readonly SceneTestRecord[], minGap: number): SceneOutcome =>
  (drawn === "interrupt" && minGap > 0 && [...prior].sort((left, right) => left.plannedAt - right.plannedAt).slice(-minGap).some((record) => record.applied === "interrupt")
    ? "altered"
    : drawn);

export function planSceneTest(input: ScenePlanInput): SceneTestRecord | null {
  if (!sceneTestApplies(input.story, input.frontierId)) return null;
  const parts = (tag: string) => sceneDrawParts(input.ids, input.frontierId, input.plannedAt, tag);
  const chaos = sceneChaos(input.tension);
  const p = sceneProbability(chaos);
  const unit = unitDraw(parts(SCENE_DRAW_TAG));
  const drawn = drawSceneOutcome(p, unit, unitDraw(parts(`${SCENE_DRAW_TAG}:kind`)));
  const threads = input.candidates.filter((candidate) => candidate.kind === "arc");
  const spaced = spacedOutcome(drawn, input.prior, sceneMinGap(input.story));
  const applied = spaced === "interrupt" && !threads.length ? "altered" : spaced;
  const focus = applied === "interrupt" ? focusPick(threads, unitDraw(parts(`${SCENE_DRAW_TAG}:focus`)))?.text : undefined;
  return {
    frontierId: input.frontierId, plannedAt: input.plannedAt, messageId: input.messageId, chaos, p, unit, drawn, applied,
    ...(focus ? { focus } : {}), expected: { from: input.frontierName, thread: threads.at(-1)?.text ?? null },
  };
}

export const sceneTestFor = (records: readonly SceneTestRecord[] | undefined, frontierId: string): SceneTestRecord | null =>
  records?.find((record) => record.frontierId === frontierId) ?? null;

export const sceneTextsSafe = (record: SceneTestRecord, unknownNames: readonly string[], resting: (text: string) => string): boolean =>
  record.applied === "expected" || [record.focus, record.expected.thread].every((text) => !text || focusSafe(text, unknownNames, resting));

export const sceneSignal = (record: SceneTestRecord | null): SceneSignal | undefined =>
  (record && record.applied !== "expected" ? { applied: record.applied, ...(record.focus ? { focus: record.focus } : {}), expected: record.expected } : undefined);

const expectedText = (expected: SceneExpected): string => (expected.thread
  ? `the expected next turning point, which continues the thread "${expected.thread}" on from "${expected.from}"`
  : `the expected next turning point, which continues on from "${expected.from}"`);

export function sceneSignalLine(signal: SceneSignal): string {
  if (signal.applied === "altered") {
    return `Scene signal: altered. Write ${expectedText(signal.expected)}, keeping that destination and that thread, but change exactly one of: the place, who is present, `
      + `the timing, or an obstacle; the world changed it, not the player. Add "changed": "${SCENE_CHANGES.join("|")}" to your JSON (exactly one).`;
  }
  const thread = signal.focus ? `the open thread "${signal.focus}"` : "one of the open threads above";
  return `Scene signal: interrupt. Before ${expectedText(signal.expected)}, a world event first advances ${thread}; then the way to that destination resumes. `
    + `World pressure only, never the player's act, and no new compulsory detour. Add "advances": "<that open thread, copied exactly>" to your JSON.`;
}

const same = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

export function sceneAnswerIssues(signal: SceneSignal | undefined, answer: SceneAnswer, threads: readonly string[]): string[] {
  if (!signal) return [];
  if (signal.applied === "altered") {
    const changed = answer.changed ?? [];
    if (changed.length !== 1) return [`the scene signal asks for exactly one change ("changed": one of ${SCENE_CHANGES.join(", ")}); the answer named ${changed.length}`];
    return (SCENE_CHANGES as readonly string[]).includes(changed[0]) ? [] : [`"changed" must be one of ${SCENE_CHANGES.join(", ")} (got '${changed[0]}')`];
  }
  const advances = answer.advances?.trim();
  if (!advances) return [`the scene signal asks for an interrupt that advances an existing open thread ("advances")`];
  const existing = [...threads, ...(signal.focus ? [signal.focus] : []), ...(signal.expected.thread ? [signal.expected.thread] : [])];
  return existing.some((thread) => same(thread, advances)) ? [] : [`"advances" must copy an existing open thread exactly (got '${advances}')`];
}

export const dropSceneTestsAfter = (records: readonly SceneTestRecord[], boundary: number): SceneTestRecord[] => records.filter((record) => record.plannedAt <= boundary);

export function retainSceneTests(living: Pick<LivingRuntimeState, "sceneTests" | "proposals" | "ops">, story: NormalizedStoryV2, floor: number): SceneTestRecord[] {
  const records = living.sceneTests ?? [];
  const from = new Map(living.proposals.map((proposal) => [proposal.id, proposal.frontierId]));
  const replannable = (frontierId: string) => isEligibleFrontier(story, frontierId) || living.ops.some((op) => (from.get(op.proposalId) ?? frontierId) === frontierId);
  const minGap = sceneMinGap(story);
  const spacing = new Set(minGap > 0 ? [...records].sort((left, right) => left.plannedAt - right.plannedAt).slice(-minGap) : []);
  return records.filter((record) => record.plannedAt >= floor || spacing.has(record) || replannable(record.frontierId));
}
