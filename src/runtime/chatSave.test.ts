jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => globalThis.__chatSaveTest.observation,
  readServerBoundary: async () => globalThis.__chatSaveTest.stored,
  getContext: () => globalThis.__chatSaveTest.context,
}));

import { ChatSave } from "./chatSave";
import { createExtras } from "./extras";
import type { RunOwner } from "./runOwner";
import type { LoadedStory, RuntimeExtras } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __chatSaveTest: {
    observation: { requested: boolean; status: number | null; ok: boolean; timedOut: boolean; failed?: boolean };
    stored: number | null;
    context: { chatId: string; saveMetadata: () => void; chat: unknown[]; chatMetadata: Record<string, unknown>; extensionSettings: Record<string, unknown> };
  };
}

const LOADED = { record: { id: "s1", version: 1, hash: "h", raw: { format: 2, id: "s1" } }, story: { title: "S" } } as unknown as LoadedStory;

function harness(options: { loaded?: LoadedStory | null; owns?: boolean } = {}) {
  let saves = 0;
  const journal: Array<{ summary: string; persistNow: boolean }> = [];
  globalThis.__chatSaveTest = {
    observation: { requested: true, status: 200, ok: true, timedOut: false },
    stored: 1,
    context: { chatId: "chat-a", saveMetadata: () => { saves += 1; }, chat: [], chatMetadata: {}, extensionSettings: {} },
  };
  const extras: RuntimeExtras = createExtras();
  const owner = { ownsOpenChat: () => options.owns ?? true, claimedChat: () => "chat-a" } as unknown as RunOwner;
  const save = new ChatSave({
    loaded: () => (options.loaded === undefined ? LOADED : options.loaded),
    engine: () => ({ state: { boundary: 1, blackboard: {}, visitedAnchors: [], visitedPath: [] } as never, history: { from: { boundary: 1, messageId: -1 }, log: [] } as never }),
    extras: () => extras,
    owner,
    journal: (summary, _note, persistNow) => journal.push({ summary, persistNow }),
    recap: () => {},
  });
  return { save, extras, journal, saves: () => saves };
}

describe("ChatSave", () => {
  test("a save in the run's own chat writes, is observed, and has landed", async () => {
    const { save, extras, saves } = harness();
    await save.persist();
    expect(saves()).toBeGreaterThan(0);
    expect(extras.saveHealth.lastOutcome).toBe("applied");
    expect(extras.lastSessionAt).not.toBeNull();
    expect(save.landed()).toBe(true);
  });

  test("a run hydrated for another chat writes nothing and says so in the persisted journal", async () => {
    const { save, journal, saves } = harness({ owns: false });
    await save.persist();
    expect(saves()).toBe(0);
    expect(journal).toEqual([{ summary: "save skipped: this run belongs to another chat", persistNow: true }]);
    expect(save.landed()).toBe(false);
  });

  test("a save the server refused has not landed", async () => {
    const { save, extras, journal } = harness();
    await save.persist();
    globalThis.__chatSaveTest.observation = { requested: true, status: 500, ok: false, timedOut: false };
    await save.persist();
    expect(extras.saveHealth.lastOutcome).toBe("unsaved");
    expect(journal.map((entry) => entry.summary)).toContain("save not confirmed");
    expect(save.landed()).toBe(false);
  });

  test("a read-back that cannot say is not evidence of a lost write", async () => {
    const { save, extras } = harness();
    globalThis.__chatSaveTest.stored = null;
    await save.persist();
    expect(extras.saveHealth.lastOutcome).toBe("unconfirmed");
    expect(save.landed()).toBe(true);
  });

  test("with no story loaded nothing is written and nothing has landed", async () => {
    const { save, saves } = harness({ loaded: null });
    await save.persist();
    expect(saves()).toBe(0);
    expect(save.landed()).toBe(false);
  });
});
