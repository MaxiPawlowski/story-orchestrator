import {
  OPENING_MAX_TURNS, anchorOpening, isOpenStretch, isValidationErrorList, objectiveLineApplies, openPhase, parseStory, parseStoryOrThrow, type EngineState, type NormalizedStory,
} from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { GUIDANCE_PREAMBLE, OPENING_LINE, composeGuidanceBlock } from "@pacing/index";
import { planReconciliation } from "@extraction/reconcile";
import type { PromptHost } from "../hostPorts";
import type { TensionRuntimeState } from "../types";
import { agencyRecovery } from "../agencyRecovery";
import { currentCheckpointText } from "../stretchTurns";
import { playedProjection, startProjection } from "../playerProjection";
import { PacingCoordinator } from "./pacingCoordinator";

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;
const OBJECTIVE = "Persuade the harbour master to open the gate.";

const raw = (opening: Record<string, unknown> | null, extra: { camp?: Record<string, unknown> } = {}) => ({
  id: "opening",
  title: "Opening",
  description: "",
  qualities: [
    { key: "gate_open", type: "bool", source: "extractor", rubric: "The harbour gate is open." },
    { key: "left_camp", type: "bool", source: "extractor", rubric: "The party left." },
  ],
  checkpoints: [
    { id: "harbour", name: "The harbour", objective: OBJECTIVE, type: "anchor", start: true, ...(opening ? { stretch: opening } : {}), ...(extra.camp ?? {}) },
    { id: "town", name: "The town", objective: "Find a bed.", type: "anchor" },
  ],
  transitions: [{ from: "harbour", to: "town", priority: 1, gate: { q: "gate_open", op: "==", v: true } }],
  roster: [],
});

const OPEN = { mode: "open", pace: "brief" };
const story = parseStoryOrThrow(raw(OPEN));
const plain = parseStoryOrThrow(raw(null));
const errorsOf = (value: unknown) => {
  const parsed = parseStory(value);
  return isValidationErrorList(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

const state = (overrides: Partial<EngineState> = {}): EngineState => ({
  blackboard: { values: {}, versions: {}, latched: {} } as unknown as EngineState["blackboard"],
  activeCheckpointId: "harbour", visitedAnchors: ["harbour"], visitedPath: ["harbour"], boundary: 12, checkpointStartedBoundary: 0,
  checkpointStartedAt: 0, checkpointStartedMessageId: -1, lastMessageId: 30, chatLength: 31, ...overrides,
});

const chatWithTurns = (turns: number, replies = 3): Array<{ is_user: boolean }> =>
  Array.from({ length: turns }, () => [{ is_user: true }, ...Array.from({ length: replies }, () => ({ is_user: false }))]).flat();

function block(loaded: NormalizedStory, turns: number, replies = 3) {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  const chat = chatWithTurns(turns, replies);
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  new PacingCoordinator({
    getStory: () => loaded,
    getState: () => state({ lastMessageId: chat.length - 1 }),
    getStateLog: () => [],
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }),
    hosts: { prompt, chat: { chatRows: () => chat } },
  }).updateSteering();
  return blocks.get(KEY) ?? "";
}

describe("v2.8 19: the open opening of an anchor, the format", () => {
  it("is a stretch with only a mode, a pace and the turns; pace sets the turns and an explicit count wins", () => {
    expect(story.checkpointById.harbour.stretch).toEqual({ mode: "open", pace: "brief", pull_after: 3 });
    expect(parseStoryOrThrow(raw({ mode: "open" })).checkpointById.harbour.stretch?.pull_after).toBe(6);
    expect(parseStoryOrThrow(raw({ mode: "open", pace: "long" })).checkpointById.harbour.stretch?.pull_after).toBe(OPENING_MAX_TURNS);
    expect(parseStoryOrThrow(raw({ mode: "open", pace: "long", pull_after: 4 })).checkpointById.harbour.stretch?.pull_after).toBe(4);
    expect(errorsOf(raw(OPEN))).toEqual([]);
  });

  it("is bounded: at most ten player turns, so the objective always arrives", () => {
    expect(OPENING_MAX_TURNS).toBe(10);
    expect(errorsOf(raw({ mode: "open", pull_after: 10 }))).toEqual([]);
    expect(errorsOf(raw({ mode: "open", pull_after: 11 }))).toContain("checkpoints.0.stretch.pull_after: on an anchor pull_after is the open opening in player turns, at most 10");
  });

  it("has no arrival, no plain pull and no offer: the anchor's own exits end it", () => {
    const errors = errorsOf(raw({ ...OPEN, arrive_when: { q: "gate_open", op: "==", v: true }, max_turns: 5, offer: ["encounters"] }));
    ["arrive_when", "max_turns", "offer"].forEach((key) => {
      expect(errors).toContain(`checkpoints.0.stretch.${key}: an anchor's open opening has no ${key}: the anchor's own exits end it`);
    });
  });

  it("refuses pressure and trigger like a stretch", () => {
    expect(errorsOf(raw({ ...OPEN, pressure: "complications", trigger: "quiet" })).filter((error) => error.includes("is not built yet"))).toHaveLength(2);
  });

  it("keeps the anchor's authored player_text: it validates, and survives parsing", () => {
    const authored = raw(OPEN, { camp: { player_name: "The Harbour", player_text: "Gulls over the quay." } });
    expect(errorsOf(authored)).toEqual([]);
    const parsed = parseStoryOrThrow(authored);
    expect(parsed.checkpointById.harbour.player_text).toBe("Gulls over the quay.");
    expect(parsed.checkpointById.harbour.stretch).toEqual({ mode: "open", pace: "brief", pull_after: 3 });
  });

  it("still refuses player_text on an intermediate open stretch", () => {
    const road = {
      ...raw(null),
      qualities: [...raw(null).qualities, { key: "reached_walls", type: "bool", source: "extractor", rubric: "Arrived?" }],
      checkpoints: [
        { id: "harbour", name: "The harbour", objective: OBJECTIVE, type: "anchor", start: true },
        { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", player_text: "Dusty road.", stretch: { mode: "open", pace: "brief", arrive_when: { q: "reached_walls", op: "==", v: true } } },
        { id: "town", name: "The town", objective: "Find a bed.", type: "anchor" },
      ],
      transitions: [
        { from: "harbour", to: "road", priority: 1, gate: { q: "gate_open", op: "==", v: true } },
        { from: "road", to: "town", priority: 1, gate: { q: "reached_walls", op: "==", v: true } },
      ],
    };
    expect(errorsOf(road)).toContain("checkpoints.1.player_text: an open stretch shows its name, never a task: leave player_text out");
  });

  it("leaves the anchor's exits alone: any gate, a progress counter or a turn count is still allowed", () => {
    const value = raw(OPEN);
    const withExits = { ...value, qualities: [...value.qualities, { key: "player_turns_in_checkpoint", type: "int", source: "code", rubric: "turns" }],
      transitions: [...value.transitions, { from: "harbour", to: "town", priority: 0, gate: { q: "player_turns_in_checkpoint", op: ">=", v: 8 } }] };
    expect(errorsOf(withExits)).toEqual([]);
  });

  it("an opening is not a stretch: it is no stub blocker, no destination and no pull, and a stretch on an anchor is only ever an opening", () => {
    expect(anchorOpening(story.checkpointById.harbour)).toEqual({ mode: "open", pace: "brief", pull_after: 3 });
    expect(isOpenStretch(story.checkpointById.harbour)).toBe(false);
    expect(anchorOpening(plain.checkpointById.harbour)).toBeNull();
  });
});

describe("v2.8 19: the opening ends at its player-turn boundary", () => {
  it("is open for the first pull_after player turns and ordinary from then on, whatever the checkpoint says elsewhere", () => {
    const harbour = story.checkpointById.harbour;
    expect([0, 1, 2, 3, 4, 40].map((turns) => openPhase(harbour, turns) !== null)).toEqual([true, true, true, false, false, false]);
    expect([0, 2, 3].map((turns) => objectiveLineApplies(story, harbour, turns))).toEqual([false, false, true]);
    expect(objectiveLineApplies(plain, plain.checkpointById.harbour, 0)).toBe(true);
  });

  it("the guidance block carries the opening line and no task for turns 0 to 2, then the ordinary objective line alone", () => {
    [0, 1, 2].forEach((turns) => {
      const text = block(story, turns);
      expect(text).toBe([GUIDANCE_PREAMBLE, OPENING_LINE].join("\n"));
      expect(text).not.toContain(OBJECTIVE);
      expect(text).not.toContain("Objective:");
    });
    const after = block(story, 3);
    expect(after).toContain(`Objective: ${OBJECTIVE}`);
    expect(after).not.toContain("Open start");
    expect(after).not.toContain("next place");
  });

  it("a group round counts one turn: three replies to each of two sends is still inside a three-turn opening", () => {
    expect(block(story, 2, 3)).toContain(OPENING_LINE);
    expect(block(story, 3, 3)).not.toContain(OPENING_LINE);
    expect(block(story, 2, 6)).toContain(OPENING_LINE);
  });

  it("payload invariance: an anchor without an opening gets the block byte-identical to before", () => {
    const text = block(plain, 0);
    expect(text).toBe(composeGuidanceBlock(plain.checkpointById.harbour, { protect_player_choice: true, never_narrate_player_action: true, objective_kind: "world_pressure" }, true));
    expect(text).toContain(`Objective: ${OBJECTIVE}`);
  });

  it("an anchor that also authors player_text gets the same narrator block: no objective at turns 1 and 2, the objective at 3", () => {
    const authored = parseStoryOrThrow(raw(OPEN, { camp: { player_name: "The Harbour", player_text: "Gulls over the quay." } }));
    [1, 2].forEach((turns) => {
      const text = block(authored, turns);
      expect(text).toBe([GUIDANCE_PREAMBLE, OPENING_LINE].join("\n"));
      expect(text).not.toContain(OBJECTIVE);
      expect(text).not.toContain("Gulls over the quay.");
    });
    expect(block(authored, 3)).toContain(`Objective: ${OBJECTIVE}`);
    expect(block(authored, 3)).not.toContain(OPENING_LINE);
  });

  it("{{story_current_checkpoint}} names the scene only while the opening lasts", () => {
    const snapshot = { activeCheckpointId: "harbour", activeCheckpointName: "The harbour", activeObjective: OBJECTIVE };
    expect(currentCheckpointText(story, snapshot, 2)).toBe("The harbour");
    expect(currentCheckpointText(story, snapshot, 3)).toBe(`The harbour — ${OBJECTIVE}`);
    expect(currentCheckpointText(plain, snapshot, 0)).toBe(`The harbour — ${OBJECTIVE}`);
  });

  it("a refusal is not recovered while the opening is open, and is again afterwards", () => {
    const log = Array.from({ length: 4 }, (_, index) => ({
      at: 0, boundary: index + 1, before: state(), after: state(), fired: null, source: "gate" as const,
      context: { lastMessageId: index * 2 + 3, chatLength: index * 2 + 4 }, queue: { applied: [], discarded: [] }, evaluated: null,
    }));
    const audits = [{ window: { from: 0, to: 40 }, acceptedDeltas: [] }] as unknown as Parameters<typeof agencyRecovery>[3];
    const at = (loaded: NormalizedStory, turns: number[]) => agencyRecovery(loaded, state({ lastMessageId: 12 }), log, audits, turns);
    expect(at(plain, [2, 4])).not.toBeNull();
    expect(at(story, [2, 4])).toBeNull();
    expect(at(story, [2, 4, 6])).not.toBeNull();
  });

  it("the stall re-read is untouched: it is a read, never narration", () => {
    const quiet = state({ boundary: 18 });
    const read = () => ({ from: 0, to: 0, messages: [] });
    expect(planReconciliation(plain, quiet, 1, read)).not.toBeNull();
    expect(planReconciliation(story, quiet, 1, read)).not.toBeNull();
  });
});

describe("v2.8 19: what the player sees of an opening", () => {
  const projectionInput = (loaded: NormalizedStory) => ({
    story: loaded, narrative: { sections: [], text: "", title: "Opening" }, visitedPath: [] as string[], activeCheckpointId: "harbour", cast: [], chat: [], playerName: "Max",
  } as unknown as Parameters<typeof playedProjection>[0]);

  it("shows no objective and no internal name (a scene without a public name reads Current scene), since the objective was never player copy", () => {
    const projection = JSON.stringify([playedProjection(projectionInput(story)), startProjection(story, "Max", [])]);
    expect(projection).not.toContain(OBJECTIVE);
    expect(projection).not.toContain("The harbour");
    expect(projection).toContain("Current scene");
  });

  it("there is no control that ends an opening: it ends in the fiction, or by the story's own exits", () => {
    expect(story.outgoingByCheckpoint.harbour).toHaveLength(1);
    expect(story.checkpointById.harbour.stretch).not.toHaveProperty("arrive_when");
  });
});
