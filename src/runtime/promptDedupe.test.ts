import { NO_CLOSING_QUESTION_CLAUSE, parseStoryOrThrow, type EngineState } from "@engine/index";
import { PACING_HINT_EXTENSION_KEY } from "@constants/defaults";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { PromptHost } from "./hostPorts";
import type { TensionRuntimeState } from "./types";
import { PacingCoordinator } from "./coordinators/pacingCoordinator";
import { withoutCarriedClauses } from "./promptDedupe";

const story = parseStoryOrThrow({
  id: "dedupe", title: "Dedupe", description: "A player-action objective.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "Open the gate.", type: "anchor", start: true, guidance: "The gate is stuck.", agency: { objective_kind: "player_action" } },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [],
});

const written = () => {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, text: string) => { blocks.set(key, text); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  const tension: TensionRuntimeState = { levels: [], smoothed: 0.1, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => story, getState: () => ({ activeCheckpointId: "a", blackboard: { values: {}, versions: {} } } as unknown as EngineState), getStateLog: () => [],
    getTensionTarget: () => "high", getTension: () => tension, setTension: () => {},
    getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: true }), hosts: { prompt },
  });
  pacing.updateSteering();
  return blocks;
};

describe("43 C: a clause the guidance already carries is not repeated by the pacing hint", () => {
  it("the closing-question clause appears once across guidance and pacing", () => {
    const blocks = written();
    const guidance = blocks.get(INJECTION_REGISTRY.checkpointGuidance.key) ?? "";
    const hint = blocks.get(PACING_HINT_EXTENSION_KEY) ?? "";
    expect(guidance).toContain(NO_CLOSING_QUESTION_CLAUSE);
    expect(hint).toMatch(/^Pacing:/);
    expect(hint).not.toContain(NO_CLOSING_QUESTION_CLAUSE);
    expect((guidance + hint).split(NO_CLOSING_QUESTION_CLAUSE).length - 1).toBe(1);
  });

  it("keeps a clause the carrier does not hold, and leaves no doubled spaces", () => {
    expect(withoutCarriedClauses(`A. ${NO_CLOSING_QUESTION_CLAUSE} B.`, "")).toBe(`A. ${NO_CLOSING_QUESTION_CLAUSE} B.`);
    expect(withoutCarriedClauses(`A. ${NO_CLOSING_QUESTION_CLAUSE} B.`, NO_CLOSING_QUESTION_CLAUSE)).toBe("A. B.");
    expect(withoutCarriedClauses(`A. ${NO_CLOSING_QUESTION_CLAUSE}`, NO_CLOSING_QUESTION_CLAUSE)).toBe("A.");
  });
});
