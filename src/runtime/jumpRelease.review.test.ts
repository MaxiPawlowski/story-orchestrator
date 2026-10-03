const choice = { next: "seal" as string | null, asked: [] as string[] };
jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(async (text: string) => { choice.asked.push(text); return choice.next; }),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
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

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import { parseStoryV2OrThrow, type StoryEngine, type StoryV2 } from "@engine/index";
import { loadChapterKit } from "./chapterPort";
import type { EffectsApplier } from "./effectsApplier";
import type { RuntimeExtras } from "./types";
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
    jest.spyOn(probe.effects, "releaseStaging").mockImplementation(async () => { order.push(`release@${probe.engine.activeCheckpoint?.id}`); });
    jest.spyOn(probe.effects, "applyCheckpoint").mockImplementation(async (_story, checkpoint, _extras, _snapshot, mode, path) => { order.push(`apply:${checkpoint?.id}:${mode}:${path.join(">")}`); });
    expect(await runtime.activateCheckpoint("far")).toBe(true);
    expect(order).toEqual(["release@hall", "apply:far:activate:far"]);
    expect(probe.engine.checkpointPath).toEqual(["hall", "far"]);
  });
});

beforeAll(async () => { await loadChapterKit(); });
beforeEach(() => { choice.next = "seal"; choice.asked = []; });

describe("CR-E3 / CR-E4: every caller of activateCheckpoint gets the chapter-jump confirm, and a skip is written before the target applies", () => {
  const chaptered = parseStoryV2OrThrow(JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2);
  const managerAt = () => {
    const runtime = new RuntimeManager();
    const probe = runtime as unknown as { loaded: unknown; engine: StoryEngine; effects: EffectsApplier; persist: () => Promise<void>; extras: RuntimeExtras };
    probe.loaded = { record: { id: "chapters-mini", version: 1, hash: "h", raw: {} }, story: chaptered };
    probe.engine.loadStory(chaptered);
    probe.engine.activateCheckpoint("market", { lastMessageId: 1, chatLength: 2 });
    probe.persist = async () => {};
    probe.extras.memory.settings.chapters = { seal: true };
    const co = (runtime as unknown as { co: { pacing: { updateSteering: () => void }; memory: { updateInjection: () => void } } }).co;
    jest.spyOn(co.pacing, "updateSteering").mockImplementation(() => undefined);
    jest.spyOn(co.memory, "updateInjection").mockImplementation(() => undefined);
    jest.spyOn(runtime, "notify").mockImplementation(() => undefined);
    jest.spyOn(runtime, "getSnapshot").mockImplementation(() => ({}) as never);
    jest.spyOn(probe.effects, "releaseStaging").mockImplementation(async () => undefined);
    const skipAtApply: unknown[] = [];
    jest.spyOn(probe.effects, "applyCheckpoint").mockImplementation(async () => { skipAtApply.push(probe.extras.memory.chapterSealSkip ?? null); });
    return { runtime, probe, skipAtApply };
  };

  it("the manager itself asks, and a cancel jumps nowhere", async () => {
    choice.next = null;
    const { runtime, probe } = managerAt();
    expect(await runtime.activateCheckpoint("walls")).toBe(false);
    expect(choice.asked).toHaveLength(1);
    expect(probe.engine.activeCheckpoint?.id).toBe("market");
  });

  it("jump without sealing: the skip marker is already in memory when the target's onEnter effects run", async () => {
    choice.next = "skip";
    const { runtime, probe, skipAtApply } = managerAt();
    expect(await runtime.activateCheckpoint("walls")).toBe(true);
    expect(skipAtApply).toEqual([{ pathLength: 3, messageId: 1, previous: null }]);
    expect(probe.extras.memory.chapterSealSkip).toEqual({ pathLength: 3, messageId: 1, previous: null });
    expect(runtime.chapters.due()).toBeNull();
  });
});
