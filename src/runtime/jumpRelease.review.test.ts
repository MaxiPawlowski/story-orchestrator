jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [{ mes: "a" }, { mes: "b" }], chatId: "chat-a", name1: "You", extensionSettings: {}, chatMetadata: {}, characters: [] }),
  getActiveGroup: () => null,
  listGroupMembers: () => [],
  listMutedGroupMembers: () => [],
  listGlobalLorebooks: () => [],
  readLoreBindings: () => ({ global: [], chat: null, persona: null, characters: [] }),
}));

import { parseStoryV2OrThrow, type StoryEngine } from "@engine/index";
import type { EffectsApplier } from "./effectsApplier";
import { RuntimeManager } from "./runtimeManager";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "jump",
  title: "Jump",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "", type: "anchor", start: true, effects: { author_note: "Rain." } },
    { id: "far", name: "Far", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "hall", to: "far", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: [],
});

describe("v2.6 plan 04 C4: /cp activate releases the source, then applies the target alone", () => {
  it("releases while the engine still stands at the source, and hands the applier the target's path only", async () => {
    const runtime = new RuntimeManager();
    const probe = runtime as unknown as { loaded: unknown; engine: StoryEngine; effects: EffectsApplier; persist: () => Promise<void> };
    probe.loaded = { record: { id: "jump", version: 1, hash: "h", raw: {} }, story };
    probe.engine.loadStory(story);
    probe.persist = async () => {};
    const co = (runtime as unknown as { co: { pacing: { updateSteering: () => void }; memory: { updateInjection: () => void } } }).co;
    jest.spyOn(co.pacing, "updateSteering").mockImplementation(() => undefined);
    jest.spyOn(co.memory, "updateInjection").mockImplementation(() => undefined);
    jest.spyOn(runtime, "notify").mockImplementation(() => undefined);
    jest.spyOn(runtime, "getSnapshot").mockImplementation(() => ({}) as never);
    const order: string[] = [];
    jest.spyOn(probe.effects, "releaseStaging").mockImplementation(async () => { order.push(`release@${probe.engine.activeCheckpoint.id}`); });
    jest.spyOn(probe.effects, "applyCheckpoint").mockImplementation(async (_story, checkpoint, _extras, _snapshot, mode, path) => { order.push(`apply:${checkpoint.id}:${mode}:${path.join(">")}`); });
    expect(await runtime.activateCheckpoint("far")).toBe(true);
    expect(order).toEqual(["release@hall", "apply:far:activate:far"]);
    expect(probe.engine.checkpointPath).toEqual(["hall", "far"]);
  });
});
