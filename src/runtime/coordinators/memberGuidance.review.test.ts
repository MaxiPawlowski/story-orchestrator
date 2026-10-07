import { isValidationErrorList, parseStoryV2, parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { InjectorHosts, PromptHost } from "../hostPorts";
import type { MemoryRuntimeState, TensionRuntimeState } from "../types";
import { MemoryInjector } from "../memoryInjector";
import { GUIDANCE_PREAMBLE } from "@pacing/guidance";
import { PacingCoordinator } from "./pacingCoordinator";

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;

const raw = (guidance: unknown) => ({
  format: 2,
  id: "witness",
  title: "Witness",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "", type: "anchor", start: true, guidance },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [{ id: "haley", name: "Haley" }, { id: "forre", name: "Forre" }, { id: "narrator", name: "Narrator" }],
});

const story = parseStoryV2OrThrow(raw({ all: "The duel is at noon.", members: { Haley: "You rigged the blade.", forre: "You owe the duke money." } }));

function harness(loaded: NormalizedStoryV2) {
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

describe("v2.6 plan 04 C13: per-member guidance is staged per drafted member", () => {
  it("normalizes { all, members } at parse, keyed by roster id, and keeps a plain string as it was", () => {
    expect(story.checkpointById.a.guidance).toEqual({ all: "The duel is at noon.", members: { haley: "You rigged the blade.", forre: "You owe the duke money." } });
    expect(parseStoryV2OrThrow(raw("Plain.")).checkpointById.a.guidance).toBe("Plain.");
    expect(parseStoryV2OrThrow(raw({ members: { haley: "  " } })).checkpointById.a.guidance).toBeUndefined();
  });

  it("refuses a member guidance that is not text, and an unknown key", () => {
    const refused = parseStoryV2(raw({ members: { haley: 3 }, extra: "x" }));
    expect(isValidationErrorList(refused) && refused.map((error) => error.path)).toEqual(["checkpoints.0.guidance", "checkpoints.0.guidance.members.haley"]);
  });

  it("drafting Haley sends Haley's part and the shared part, never Forre's", () => {
    const { pacing, block } = harness(story);
    pacing.updateSteering();
    expect(block()).toBe(`${GUIDANCE_PREAMBLE}\nThe duel is at noon.`);
    pacing.draftGuidance("haley");
    expect(block()).toContain(`${GUIDANCE_PREAMBLE}\nThe duel is at noon.`);
    expect(block()).toContain("Direction for Haley only: You rigged the blade.");
    expect(block()).not.toContain("You owe the duke money.");
    pacing.draftGuidance("forre");
    expect(block()).toContain("You owe the duke money.");
    expect(block()).not.toContain("You rigged the blade.");
  });

  it("the narrator, an unknown draft and the resting prompt see only the shared part", () => {
    const { pacing, block } = harness(story);
    pacing.draftGuidance("narrator");
    expect(block()).toBe(`${GUIDANCE_PREAMBLE}\nThe duel is at noon.`);
    pacing.draftGuidance(null);
    expect(block()).toBe(`${GUIDANCE_PREAMBLE}\nThe duel is at noon.`);
    pacing.draftGuidance("haley");
    pacing.releaseDraftGuidance();
    expect(block()).toBe(`${GUIDANCE_PREAMBLE}\nThe duel is at noon.`);
  });

  it("v2.7 plan 03: at rest no member part is carried, whoever spoke last; only a draft stages one", () => {
    const { pacing, block } = harness(story);
    pacing.updateSteering();
    expect(block()).not.toContain("You owe the duke money.");
    expect(block()).not.toContain("You rigged the blade.");
    pacing.draftGuidance("forre");
    expect(block()).toContain("Direction for Forre only: You owe the duke money.");
    pacing.releaseDraftGuidance();
    pacing.updateSteering();
    expect(block()).toBe(`${GUIDANCE_PREAMBLE}\nThe duel is at noon.`);
  });

  it("a withheld generation (quiet, impersonate) never carries a member part, until the hold is released", () => {
    const { pacing, block } = harness(story);
    pacing.withholdGuidance();
    pacing.draftGuidance("haley");
    expect(block()).not.toContain("You rigged the blade.");
    pacing.releaseStaleGuidanceHold();
    expect(block()).toContain("You rigged the blade.");
  });
});

describe("v2.6 plan 04 C13: the drafted member is resolved without the epistemic capability", () => {
  it("maps ST's character index to the roster id by name, and an unknown index to null", () => {
    const names: Record<number, string> = { 4: "Haley" };
    const injector = new MemoryInjector({
      getStory: () => story,
      getState: () => null,
      memory: () => ({}) as MemoryRuntimeState,
      enabled: () => false,
      capable: () => false,
      ledgerBindings: () => [],
      setPinnedOverflow: () => undefined,
      beatFor: () => "",
      hosts: () => ({ injection: { getCharacterNameById: (id: number | undefined) => (id === undefined ? undefined : names[id]) } }) as unknown as InjectorHosts,
    });
    expect(injector.draftedRosterId(4)).toBe("haley");
    expect(injector.draftedRosterId([4])).toBe("haley");
    expect(injector.draftedRosterId(9)).toBeNull();
  });
});
