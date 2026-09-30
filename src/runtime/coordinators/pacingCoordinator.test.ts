import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { PromptHost } from "../hostPorts";
import type { TensionRuntimeState } from "../types";
import { PacingCoordinator } from "./pacingCoordinator";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "pacing-host",
  title: "Pacing host",
  description: "One guided checkpoint.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "Start.", type: "anchor", start: true, guidance: "Keep the rain heavy." },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [],
});

function harness(loaded: NormalizedStoryV2 | null) {
  const calls: string[] = [];
  const prompt: PromptHost = {
    setStoryExtensionPrompt: (key: string) => { calls.push(`set:${key}`); },
    clearStoryExtensionPrompt: (key: string) => { calls.push(`clear:${key}`); },
  } as unknown as PromptHost;
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => loaded,
    getState: () => (loaded ? ({ activeCheckpointId: "a" } as EngineState) : null),
    getStateLog: () => [],
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: true }),
    hosts: { prompt },
  });
  return { pacing, calls };
}

describe("PacingCoordinator prompt host", () => {
  it("writes the checkpoint guidance through the injected host", () => {
    const { pacing, calls } = harness(story);
    pacing.updateSteering();
    expect(calls).toContain(`set:${INJECTION_REGISTRY.checkpointGuidance.key}`);
  });

  it("clears the hint and the guidance through the host when no story is loaded", () => {
    const { pacing, calls } = harness(null);
    pacing.updateSteering();
    expect(calls).toEqual([`clear:${PACING_HINT_EXTENSION_KEY}`, `clear:${INJECTION_REGISTRY.checkpointGuidance.key}`]);
  });
});
