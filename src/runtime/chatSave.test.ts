jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => globalThis.__chatSaveTest.observation,
  readServerBoundary: async () => globalThis.__chatSaveTest.stored,
  getContext: () => globalThis.__chatSaveTest.context,
}));

import { ChatSave, type ChatSaveDeps } from "./chatSave";
import { createExtras } from "./extras";
import { getGlobalSettings } from "./settingsStore";
import type { RunOwner } from "./runOwner";
import type { RunOwnership, RunToken } from "./runToken";
import type { SaveObservation } from "./saveEvidence";
import type { LoadedStory, RuntimeExtras } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __chatSaveTest: {
    observation: { requested: boolean; status: number | null; ok: boolean; timedOut: boolean; failed?: boolean };
    stored: number | null;
    context: { chatId: string; saveMetadata: () => void; chat: unknown[]; chatMetadata: Record<string, unknown>; extensionSettings: Record<string, unknown> };
  };
}

const LOADED = { record: { id: "s1", hash: "h", raw: { format: 2, id: "s1" } }, story: { title: "S" } } as unknown as LoadedStory;

function harness(options: { loaded?: LoadedStory | null; owns?: boolean; claimedChat?: string; loadedChat?: string } = {}) {
  let saves = 0;
  const journal: Array<{ summary: string; persistNow: boolean }> = [];
  const notes: string[] = [];
  globalThis.__chatSaveTest = {
    observation: { requested: true, status: 200, ok: true, timedOut: false },
    stored: 1,
    context: { chatId: "chat-a", saveMetadata: () => { saves += 1; }, chat: [], chatMetadata: {}, extensionSettings: {} },
  };
  const extras: RuntimeExtras = createExtras(getGlobalSettings);
  const world = { epoch: 1, extras };
  const ownership: RunOwnership = {
    mint: () => ({ chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: world.epoch, windowRevision: 0, lowestMutatedMessageId: null }) as unknown as RunToken,
    check: (token: RunToken) => ((token as unknown as { sessionEpoch: number }).sessionEpoch === world.epoch ? { ok: true } : { ok: false, reason: "sessionEpoch", detail: "moved" }) as never,
  };
  const owner = { ownsOpenChat: () => options.owns ?? true, claimedChat: () => options.claimedChat ?? "chat-a", ownership } as unknown as RunOwner;
  const save = new ChatSave({
    loaded: () => (options.loaded === undefined ? LOADED : options.loaded),
    loadedChat: () => options.loadedChat ?? "chat-a",
    engine: () => ({ state: { boundary: 1, blackboard: {}, visitedAnchors: [], visitedPath: [] } as never, history: { from: { boundary: 1, messageId: -1 }, log: [] } as never }),
    extras: () => world.extras,
    owner,
    journal: (summary, note, persistNow) => { journal.push({ summary, persistNow }); notes.push(note); },
    recap: () => {},
  } as Partial<ChatSaveDeps> as ChatSaveDeps);
  return { save, extras, journal, notes, world, saves: () => saves };
}

describe("ChatSave", () => {
  test("a new chat claimed before its story hydrates cannot persist the previous chat's story", async () => {
    const { save, saves } = harness({ claimedChat: "chat-b", loadedChat: "chat-a" });
    globalThis.__chatSaveTest.context.chatId = "chat-b";
    await save.persist();
    expect(saves()).toBe(0);
    expect(globalThis.__chatSaveTest.context.chatMetadata.story_orchestrator).toBeUndefined();
  });
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

// v2.4 E3: a chat write made outside persist (a selection, a dropped state, a replaced blob, a rename
// restamp) goes through `saveOpenChat`, which armed an observation; that observation is now read.
describe("ChatSave.recordWrite (E3)", () => {
  const answered = (status: number): SaveObservation => ({ requested: true, status, ok: status >= 200 && status < 300, timedOut: false, failed: false });
  const write = (observation: SaveObservation | Promise<SaveObservation>, chatId = "chat-a") => ({ kind: "select" as const, chatId, observed: Promise.resolve(observation) });

  test("a write whose save answered 500 is unsaved, and the journal names the write", async () => {
    const { save, extras, journal, notes } = harness();
    await save.recordWrite(write(answered(500)));
    expect(extras.saveHealth).toMatchObject({ lastOutcome: "unsaved", lastReason: "the server answered 500", pendingBoundary: 1 });
    expect(journal.map((entry) => entry.summary)).toEqual(["save not confirmed"]);
    expect(notes[0]).toBe("story selection: the server answered 500");
    expect(save.landed()).toBe(false);
  });

  test("a write held back as lost is unsaved with the watcher's own reason", async () => {
    const { save, extras } = harness();
    await save.recordWrite(write({ requested: false, status: null, ok: false, timedOut: false, failed: false, lost: "the open chat changed before the save ran" }));
    expect(extras.saveHealth).toMatchObject({ lastOutcome: "unsaved", lastReason: "the open chat changed before the save ran" });
  });

  test("control: a write answered 2xx is applied and journals nothing", async () => {
    const { save, extras, journal } = harness();
    await save.recordWrite(write(answered(200)));
    expect(extras.saveHealth).toMatchObject({ lastOutcome: "applied", pendingBoundary: null });
    expect(journal).toEqual([]);
  });

  test("records nothing for a write made in another chat, or with no story loaded", async () => {
    const other = harness();
    await other.save.recordWrite(write(answered(500), "chat-b"));
    expect(other.extras.saveHealth.lastOutcome).toBeNull();
    const none = harness({ loaded: null });
    await none.save.recordWrite(write(answered(500)));
    expect(none.extras.saveHealth.lastOutcome).toBeNull();
    const foreign = harness({ owns: false });
    await foreign.save.recordWrite(write(answered(500)));
    expect(foreign.extras.saveHealth.lastOutcome).toBeNull();
  });

  test("a world that moved during the observation gets neither the health nor the journal", async () => {
    const { save, extras, journal, world } = harness();
    let answer: (observation: SaveObservation) => void = () => {};
    const pending = save.recordWrite({ kind: "drop", chatId: "chat-a", observed: new Promise<SaveObservation>((resolve) => { answer = resolve; }) });
    const next = createExtras(getGlobalSettings);
    world.epoch = 2;
    world.extras = next;
    answer(answered(500));
    await pending;
    expect(next.saveHealth.lastOutcome).toBeNull();
    expect(extras.saveHealth.lastOutcome).toBe("unsaved");
    expect(journal).toEqual([]);
  });
});

// v2.4 E3 follow-up: a selection followed straight away by a persist (loadStory, swapStory) arms two
// observations that one request settles. That is one save, so it is one evidence row, labelled with the
// write that asked for the request.
describe("ChatSave: one request serving two writes (E3 dedupe)", () => {
  const shared = (status: number, burst: number, askedBy: string | null = "select"): SaveObservation => ({ requested: true, status, ok: status >= 200 && status < 300, timedOut: false, failed: false, burst, askedBy });
  const write = (observation: SaveObservation) => ({ kind: "select" as const, chatId: "chat-a", observed: Promise.resolve(observation) });

  test("a failed save after select+persist journals exactly one row, labelled with the selection", async () => {
    const { save, extras, journal, notes } = harness();
    globalThis.__chatSaveTest.observation = shared(500, 7);
    await Promise.all([save.recordWrite(write(shared(500, 7))), save.persist()]);
    expect(journal.map((entry) => entry.summary)).toEqual(["save not confirmed"]);
    expect(notes).toEqual(["story selection: the server answered 500"]);
    expect(extras.saveHealth).toMatchObject({ lastOutcome: "unsaved", consecutiveFailures: 1, pendingBoundary: 1 });
  });

  test("the persist recording first still labels the row with the selection that asked", async () => {
    const { save, journal, notes } = harness();
    globalThis.__chatSaveTest.observation = shared(500, 8);
    await save.persist();
    await save.recordWrite(write(shared(500, 8)));
    expect(journal).toHaveLength(1);
    expect(notes).toEqual(["story selection: the server answered 500"]);
  });

  test("a request the persist asked for is journaled unlabelled, once", async () => {
    const { save, notes } = harness();
    globalThis.__chatSaveTest.observation = shared(500, 9, null);
    await save.recordWrite(write(shared(500, 9, null)));
    await save.persist();
    expect(notes).toEqual(["the server answered 500"]);
  });

  test("a shared 2xx recorded late does not leave the boundary pending", async () => {
    const { save, extras, journal } = harness();
    globalThis.__chatSaveTest.observation = shared(200, 10);
    await save.persist();
    await save.recordWrite(write(shared(200, 10)));
    expect(extras.saveHealth).toMatchObject({ lastOutcome: "applied", pendingBoundary: null, consecutiveFailures: 0 });
    expect(journal).toEqual([]);
  });

  test("control: two separate saves still journal two rows", async () => {
    const { save, extras, journal } = harness();
    globalThis.__chatSaveTest.observation = shared(500, 12);
    await save.recordWrite(write(shared(500, 11)));
    await save.persist();
    expect(journal.map((entry) => entry.summary)).toEqual(["save not confirmed", "save not confirmed"]);
    expect(extras.saveHealth.consecutiveFailures).toBe(2);
  });
});

describe("ChatSave: a save's outcome belongs to the chat it was armed in (v2.5 batch 2, C2)", () => {
  const OTHER = { record: { id: "s2", hash: "h2", raw: { format: 2, id: "s2" } }, story: { title: "T" } } as unknown as LoadedStory;
  const lost: SaveObservation = { requested: false, status: null, ok: false, timedOut: false, failed: false, lost: "the open chat changed before the save ran" };

  function switching() {
    const journal: Array<{ chat: string; summary: string; note: string }> = [];
    const world = { chat: "chat-a", loaded: LOADED, extras: createExtras(getGlobalSettings), epoch: 1 };
    globalThis.__chatSaveTest = {
      observation: { requested: true, status: 200, ok: true, timedOut: false },
      stored: 1,
      context: { chatId: "chat-a", saveMetadata: () => {}, chat: [], chatMetadata: {}, extensionSettings: {} },
    };
    const ownership: RunOwnership = {
      mint: () => ({ chatId: world.chat, sessionEpoch: world.epoch }) as unknown as RunToken,
      check: (token: RunToken) => ((token as unknown as { sessionEpoch: number }).sessionEpoch === world.epoch ? { ok: true } : { ok: false, reason: "sessionEpoch", detail: "moved" }) as never,
    };
    const owner = { ownsOpenChat: () => true, claimedChat: () => world.chat, ownership } as unknown as RunOwner;
    const save = new ChatSave({
      loaded: () => world.loaded,
      loadedChat: () => world.chat,
      engine: () => ({ state: { boundary: 1, blackboard: {}, visitedAnchors: [], visitedPath: [] } as never, history: { from: { boundary: 1, messageId: -1 }, log: [] } as never }),
      extras: () => world.extras,
      owner,
      journal: (summary, note) => { journal.push({ chat: world.chat, summary, note }); },
      recap: () => {},
    } as Partial<ChatSaveDeps> as ChatSaveDeps);
    const goTo = (chat: string, loaded: LoadedStory) => {
      world.chat = chat;
      world.loaded = loaded;
      world.extras = createExtras(getGlobalSettings);
      world.epoch += 1;
      globalThis.__chatSaveTest.context.chatId = chat;
      return world.extras;
    };
    const armLostSave = async (thenOpen: () => void, answer: SaveObservation = lost) => {
      let report: (observation: SaveObservation) => void = () => {};
      globalThis.__chatSaveTest.observation = new Promise<SaveObservation>((resolve) => { report = resolve; }) as never;
      const saving = save.persist();
      await Promise.resolve();
      thenOpen();
      report(answer);
      await saving;
    };
    return { save, journal, goTo, armLostSave };
  }

  test("a lost save reported after the switch never lands in the other chat's story", async () => {
    const { save, journal, goTo, armLostSave } = switching();
    let other = createExtras(getGlobalSettings);
    await armLostSave(() => { other = goTo("chat-b", OTHER); });
    expect(other.saveHealth).toMatchObject({ lastOutcome: null, consecutiveFailures: 0, pendingBoundary: null });
    expect(journal).toEqual([]);
    expect(save.landed()).toBe(true);
  });

  test("the chat it was armed in carries the outcome when it is current again", async () => {
    const { save, journal, goTo, armLostSave } = switching();
    await armLostSave(() => goTo("chat-b", OTHER));
    const back = goTo("chat-a", LOADED);
    expect(save.landed()).toBe(false);
    expect(back.saveHealth).toMatchObject({ lastOutcome: "unsaved", lastReason: "the open chat changed before the save ran", consecutiveFailures: 1 });
    expect(journal).toEqual([{ chat: "chat-a", summary: "save not confirmed", note: "the open chat changed before the save ran" }]);
  });

  test("a 2xx reported after the switch is not read back against the chat now open", async () => {
    const { save, goTo, armLostSave } = switching();
    globalThis.__chatSaveTest.stored = 0;
    await armLostSave(() => goTo("chat-b", OTHER), { requested: true, status: 200, ok: true, timedOut: false, failed: false });
    const back = goTo("chat-a", LOADED);
    expect(save.landed()).toBe(true);
    expect(back.saveHealth).toMatchObject({ lastOutcome: "unconfirmed", lastReason: "the server's copy of this chat could not be read" });
  });

  test("the same chat playing another story does not take it", async () => {
    const { save, goTo, armLostSave } = switching();
    await armLostSave(() => goTo("chat-b", OTHER));
    const restarted = goTo("chat-a", OTHER);
    expect(save.landed()).toBe(true);
    expect(restarted.saveHealth.lastOutcome).toBeNull();
  });
});
