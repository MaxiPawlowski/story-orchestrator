// v2.4 plan 03 D5: an author's "generate the road ahead" is a manual heavy pass, so it is announced
// before it is sent, and a cancel sends nothing. A debug response sends nothing either way.

import { parseStoryV2OrThrow, type EngineState } from "@engine/index";
import type { ExpansionRuntimeState } from "@generation/index";
import type { ModelAsk, ModelCall } from "@extraction/index";
import { ExpansionCoordinator } from "./expansionCoordinator";
import { testOwnership } from "../../../test/findings/testOwnership";

const sent: ModelAsk[] = [];
const model: ModelCall = async (_prompt, ask) => {
  if (ask.debugResponse !== undefined && ask.debugResponse !== null) return { text: ask.debugResponse, finish: "unknown" };
  sent.push(ask);
  return { text: "not a chain", finish: "stop" };
};
const story = parseStoryV2OrThrow({
  format: 2,
  id: "expansion-preflight",
  title: "Expansion preflight",
  description: "One stub off the active checkpoint.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "Start.", type: "anchor", start: true },
    { id: "s0", name: "S0", objective: "Bridge.", type: "intermediate" },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [
    { from: "a", to: "s0", priority: 1, gate: { q: "done", op: "==", v: true } },
    { from: "s0", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } },
  ],
  roster: [],
});

function harness() {
  const store: ExpansionRuntimeState = { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
  const coordinator = new ExpansionCoordinator({ hosts: { player: { getPlayerName: () => "Max" } }, ownership: testOwnership(),
    getStory: () => story,
    getStoryRaw: () => ({}),
    getState: () => ({ activeCheckpointId: "a", blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => store,
    model,
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => undefined,
    setStatus: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
  } as never);
  return { coordinator, store };
}

beforeEach(() => { sent.length = 0; globalThis.storyOrchestratorDebugGenerationResponse = undefined; });

describe("an author's generate-now is announced first (v2.4 plan 03 D5)", () => {
  it("a cancel sends nothing and files nothing", async () => {
    const env = harness();
    const confirm = jest.fn(async () => false);
    expect(await env.coordinator.runNow(undefined, confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith({ requests: 2, tokens: expect.any(Number) });
    expect((confirm.mock.calls[0] as unknown as [{ tokens: number }])[0].tokens).toBeGreaterThan(0);
    expect(sent).toEqual([]);
    expect(env.store.entries).toEqual({});
  });

  it("a confirmed run generates", async () => {
    const env = harness();
    expect(await env.coordinator.runNow(undefined, async () => true)).toBe(true);
    expect(sent.length).toBeGreaterThan(0);
    expect(Object.keys(env.store.entries)).toEqual(["a->s0->b"]);
  });

  it("control: a debug response is never announced, because nothing is sent", async () => {
    const env = harness();
    const confirm = jest.fn(async () => false);
    expect(await env.coordinator.runNow("BEAT not a chain", confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});
