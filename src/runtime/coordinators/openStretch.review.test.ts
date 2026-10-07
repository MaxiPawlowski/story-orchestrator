import {
  PLAYER_TURNS_KEY, isValidationErrorList, objectiveLineApplies, parseStoryV2, parseStoryV2OrThrow, pullStage, type EngineState, type NormalizedStoryV2,
} from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { GUIDANCE_PREAMBLE, OPEN_STRETCH_LINE, composeGuidanceBlock, pullLine } from "@pacing/index";
import { findStubExpansionCandidate, isStubCheckpoint } from "@generation/planner";
import { planReconciliation } from "@extraction/reconcile";
import type { PromptHost } from "../hostPorts";
import type { TensionRuntimeState } from "../types";
import { agencyRecovery } from "../agencyRecovery";
import { PacingCoordinator } from "./pacingCoordinator";

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;
const ARRIVE = { q: "reached_walls", op: "==", v: true };

const raw = (stretch: Record<string, unknown> | null, extra: { checkpoint?: Record<string, unknown>; transitions?: unknown[] } = {}) => ({
  format: 2,
  id: "road",
  title: "Road",
  description: "",
  qualities: [
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "The party reached the walls." },
    { key: "left_camp", type: "bool", source: "extractor", rubric: "The party left camp." },
  ],
  checkpoints: [
    { id: "camp", name: "Camp", objective: "Break camp.", type: "anchor", start: true },
    { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", ...(stretch ? { stretch } : {}), ...(extra.checkpoint ?? {}) },
    { id: "walls", name: "The walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [
    { from: "camp", to: "road", priority: 1, gate: { q: "left_camp", op: "==", v: true } },
    ...(extra.transitions ?? [{ from: "road", to: "walls", priority: 1, gate: ARRIVE }]),
  ],
  roster: [],
});

const OPEN = { mode: "open", pace: "brief", arrive_when: ARRIVE };
const story = parseStoryV2OrThrow(raw(OPEN));
const closed = parseStoryV2OrThrow(raw(null));
const errorsOf = (value: unknown) => {
  const parsed = parseStoryV2(value);
  return isValidationErrorList(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

const state = (overrides: Partial<EngineState> = {}): EngineState => ({
  blackboard: { values: {}, versions: {}, latched: {} } as unknown as EngineState["blackboard"],
  activeCheckpointId: "road", visitedAnchors: ["camp"], visitedPath: ["camp", "road"], boundary: 12, checkpointStartedBoundary: 0,
  checkpointStartedAt: 0, checkpointStartedMessageId: 1, lastMessageId: 30, chatLength: 31, ...overrides,
});

const chatWithTurns = (turns: number): Array<{ is_user: boolean }> =>
  [{ is_user: true }, { is_user: false }, ...Array.from({ length: turns }, () => [{ is_user: true }, { is_user: false }, { is_user: false }]).flat()];

function harness(loaded: NormalizedStoryV2, turns: number) {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  const chat = chatWithTurns(turns);
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => loaded,
    getState: () => state({ lastMessageId: chat.length - 1 }),
    getStateLog: () => [],
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }),
    hosts: { prompt, chat: { chatRows: () => chat } },
  });
  pacing.updateSteering();
  return blocks.get(KEY) ?? "";
}

describe("v2.7 35 Phase 2: the open stretch format", () => {
  it("normalizes pace into pull_after and keeps arrive_when as a gate", () => {
    expect(story.checkpointById.road.stretch).toEqual({ mode: "open", pace: "brief", pull_after: 3, arrive_when: ARRIVE });
    expect(parseStoryV2OrThrow(raw({ mode: "open", arrive_when: ARRIVE })).checkpointById.road.stretch?.pull_after).toBe(6);
    expect(parseStoryV2OrThrow(raw({ mode: "open", pace: "long", pull_after: 4, max_turns: 9, arrive_when: ARRIVE })).checkpointById.road.stretch)
      .toEqual({ mode: "open", pace: "long", pull_after: 4, max_turns: 9, arrive_when: ARRIVE });
  });

  it("refuses pressure, offer and trigger as not built, and an unknown key with its nearest name", () => {
    const errors = errorsOf(raw({ ...OPEN, pressure: "complications", offer: ["encounters"], trigger: "quiet", pul_after: 2 }));
    expect(errors.some((error) => error.startsWith("checkpoints.1.stretch.pressure: pressure is not built yet"))).toBe(true);
    expect(errors.some((error) => error.startsWith("checkpoints.1.stretch.offer: offer is not built yet"))).toBe(true);
    expect(errors.some((error) => error.startsWith("checkpoints.1.stretch.trigger:"))).toBe(true);
    expect(errors).toContain('checkpoints.1.stretch.pul_after: unknown key (did you mean "pull_after"?)');
  });

  it("requires arrive_when, and that it is the gate of one of the stretch's exits", () => {
    expect(errorsOf(raw({ mode: "open" }))).toContain("checkpoints.1.stretch.arrive_when: an open stretch needs arrive_when, the arrival that lets the player leave");
    expect(errorsOf(raw({ ...OPEN, arrive_when: { q: "left_camp", op: "==", v: true } })))
      .toContain("checkpoints.1.stretch.arrive_when: arrive_when must be the gate of one of the stretch's exits");
    expect(errorsOf(raw({ ...OPEN, arrive_when: { q: "nowhere", op: "==", v: true } })).some((error) => error.includes("nowhere"))).toBe(true);
  });

  it("refuses a progress exit, a stretch on an anchor, player_text, a bad pace and max_turns at or below pull_after", () => {
    const progress = errorsOf(raw(OPEN, { transitions: [
      { from: "road", to: "walls", priority: 1, gate: ARRIVE },
      { from: "road", to: "walls", priority: 2, gate: { q: "progress_toward_walls", op: ">=", v: 1 } },
    ] }));
    expect(progress).toContain("transitions.2: an open stretch ends by the player's move, never a progress counter");
    const effect = errorsOf(raw(OPEN, { transitions: [{ from: "road", to: "walls", priority: 1, gate: ARRIVE, effects: { progress: { anchor: "walls", amount: 1 } } }] }));
    expect(effect).toContain("transitions.1: an open stretch ends by the player's move, never a progress counter");
    const anchor = { ...raw(null), checkpoints: raw(null).checkpoints.map((checkpoint) => (checkpoint.id === "camp" ? { ...checkpoint, stretch: { ...OPEN, arrive_when: { q: "left_camp", op: "==", v: true } } } : checkpoint)) };
    expect(errorsOf(anchor)).toContain("checkpoints.0.stretch: only an intermediate can be an open stretch");
    expect(errorsOf(raw(OPEN, { checkpoint: { player_text: "Find the road." } }))).toContain("checkpoints.1.player_text: an open stretch shows its name, never a task: leave player_text out");
    expect(errorsOf(raw({ ...OPEN, pace: "slow" }))).toContain("checkpoints.1.stretch.pace: pace must be brief, unhurried or long");
    expect(errorsOf(raw({ ...OPEN, max_turns: 3 })).some((error) => error.startsWith("checkpoints.1.stretch.max_turns"))).toBe(true);
    expect(errorsOf(raw({ ...OPEN, mode: "closed" }))).toContain("checkpoints.1.stretch.mode: mode must be open");
  });

  it("refuses a declared player_turns_in_checkpoint that the runtime cannot write", () => {
    const value = raw(OPEN);
    expect(errorsOf({ ...value, qualities: [...value.qualities, { key: PLAYER_TURNS_KEY, type: "int", source: "extractor", rubric: "x" }] }))
      .toContain(`qualities: ${PLAYER_TURNS_KEY} must be an int with source code`);
  });
});

describe("v2.7 35 Phase 2: what an open stretch changes", () => {
  it("skips the objective line only in the open stretch; the story's objective_block still governs the rest", () => {
    expect(objectiveLineApplies(story, story.checkpointById.road)).toBe(false);
    expect(objectiveLineApplies(closed, closed.checkpointById.road)).toBe(true);
    expect(objectiveLineApplies(story, story.checkpointById.walls)).toBe(true);
  });

  it("is never expanded into a beat chain", () => {
    expect(isStubCheckpoint(closed, "road")).toBe(true);
    expect(isStubCheckpoint(story, "road")).toBe(false);
    expect(findStubExpansionCandidate(story, "camp")).toBeNull();
  });

  it("a long quiet run is not a stall, and not a refusal", () => {
    const quiet = state({ boundary: 18 });
    expect(planReconciliation(closed, quiet, 1, () => ({ from: 0, to: 0, messages: [] }))).not.toBeNull();
    expect(planReconciliation(story, quiet, 1, () => ({ from: 0, to: 0, messages: [] }))).toBeNull();
    const log = Array.from({ length: 4 }, (_, index) => ({
      at: 0, boundary: index + 1, before: state(), after: state(), fired: null, source: "gate" as const,
      context: { lastMessageId: index * 2 + 3, chatLength: index * 2 + 4 }, queue: { applied: [], discarded: [] }, evaluated: null,
    }));
    const audits = [{ window: { from: 0, to: 40 }, acceptedDeltas: [] }] as unknown as Parameters<typeof agencyRecovery>[3];
    expect(agencyRecovery(closed, state(), log, audits, [2, 4, 6, 8, 10])).not.toBeNull();
    expect(agencyRecovery(story, state(), log, audits, [2, 4, 6, 8, 10])).toBeNull();
  });

  it("the pull curve: free until pull_after player turns, then gentle, steady, and strong at max_turns", () => {
    const stretch = parseStoryV2OrThrow(raw({ ...OPEN, max_turns: 9 })).checkpointById.road.stretch!;
    expect([0, 2, 3, 5, 6, 8, 9, 20].map((turns) => pullStage(stretch, turns))).toEqual([null, null, "gentle", "gentle", "steady", "steady", "strong", "strong"]);
    expect(pullStage(story.checkpointById.road.stretch!, 40)).toBe("steady");
  });

  it("the guidance block carries the open-stretch line, no objective, and a hook past pull_after", () => {
    const early = harness(story, 1);
    expect(early).toBe([GUIDANCE_PREAMBLE, OPEN_STRETCH_LINE].join("\n"));
    expect(early).not.toContain("Reach the walls.");
    const late = harness(story, 4);
    expect(late).toBe([GUIDANCE_PREAMBLE, pullLine("gentle")].join("\n"));
    expect(late).toContain("never a push");
    expect(late).toContain("Never move the party there or narrate the decision to go.");
  });

  it("payload invariance: a story without a stretch gets the guidance block byte-identical to before", () => {
    const block = harness(closed, 4);
    expect(block).toBe(composeGuidanceBlock(closed.checkpointById.road, { protect_player_choice: true, never_narrate_player_action: true, objective_kind: "world_pressure" }, true));
    expect(block).toContain("Objective: Reach the walls.");
    expect(block).not.toContain("Open stretch");
  });
});
