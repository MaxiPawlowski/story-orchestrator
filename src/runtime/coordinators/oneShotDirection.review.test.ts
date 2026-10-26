import { parseStoryOrThrow, type EngineState, type NormalizedStory } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { PromptHost } from "../hostPorts";
import type { TensionRuntimeState } from "../types";
import { ASK_PLAYER_DIRECTION, ASK_PLAYER_TAIL, ONE_SHOT_SCOPE, oneShotDirectionText } from "@pacing/guidance";
import { NO_CLOSING_QUESTION_CLAUSE } from "@engine/agency";
import { PacingCoordinator } from "./pacingCoordinator";

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;

const story = parseStoryOrThrow({
  id: "gate", title: "Gate", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "", type: "anchor", start: true },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [{ id: "mara", name: "Mara" }, { id: "narrator", name: "Narrator" }],
});

function harness(loaded: NormalizedStory) {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => loaded,
    getState: () => ({ activeCheckpointId: "a" } as EngineState),
    getStateLog: () => [],
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }),
    hosts: { prompt },
  });
  return { pacing, block: () => blocks.get(KEY) ?? "" };
}

describe("v3.0 19 P1: an llm reply's instruction is a one-shot private direction", () => {
  it("reaches only the named member's draft, for as long as it is armed", () => {
    const { pacing, block } = harness(story);
    const release = pacing.armDirection("Mara", "Ask the stranger where they slept.");
    expect(release).not.toBeNull();
    expect(block()).toBe("");
    pacing.draftGuidance("narrator");
    expect(block()).not.toContain("Ask the stranger");
    pacing.draftGuidance("mara");
    expect(block()).toContain(`Direction for Mara only, this reply: Ask the stranger where they slept. ${ONE_SHOT_SCOPE}`);
    release?.();
    expect(block()).not.toContain("Ask the stranger");
  });

  it("matches the member by roster id too, and is withheld from quiet and impersonate runs with the rest of the block", () => {
    const { pacing, block } = harness(story);
    pacing.armDirection("mara", "Say hello.");
    pacing.draftGuidance("mara");
    expect(block()).toContain("Direction for Mara only, this reply: Say hello.");
    pacing.withholdGuidance();
    expect(block()).toBe("");
  });

  it("a stale release never clears a newer direction, and a story reset drops it", () => {
    const { pacing, block } = harness(story);
    const first = pacing.armDirection("Mara", "First.");
    pacing.armDirection("Mara", "Second.");
    pacing.draftGuidance("mara");
    first?.();
    expect(block()).toContain("this reply: Second.");
    pacing.reset();
    pacing.updateSteering();
    expect(block()).not.toContain("Second.");
  });

  it("refuses a member outside the cast or an empty direction", () => {
    const { pacing } = harness(story);
    expect(pacing.armDirection("Zed", "Hi.")).toBeNull();
    expect(pacing.armDirection("Mara", "  ")).toBeNull();
  });

  it("ask_player supplies a default direction or a closing tail, and the scope keeps the agency rule for its one reply", () => {
    expect(oneShotDirectionText({ ask_player: true })).toBe(ASK_PLAYER_DIRECTION);
    expect(oneShotDirectionText({ instruction: "Mention the toll.", ask_player: true })).toBe(`Mention the toll. ${ASK_PLAYER_TAIL}`);
    expect(oneShotDirectionText({ instruction: " Mention the toll. " })).toBe("Mention the toll.");
    expect(oneShotDirectionText({})).toBe("");
    expect(ONE_SHOT_SCOPE).toContain("never ask {{user}} what they do");
    expect(NO_CLOSING_QUESTION_CLAUSE).toBe("End on something that just happened or a character's move, not on scenery or mood, and never on a question asking {{user}} what they do.");
  });
});
