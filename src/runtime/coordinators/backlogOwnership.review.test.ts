const host = { chat: Array.from({ length: 12 }, (_, index) => ({ name: index % 2 ? "Mira" : "Max", mes: `line ${index}`, is_user: index % 2 === 0 })) };
const reads: Array<{ reason: string; release: () => void }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: host.chat, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
}));
jest.mock("@extraction/index", () => {
  const actual = jest.requireActual("@extraction/index");
  return {
    ...actual,
    runSharedRead: (options: { reason: string; window: { from: number; to: number } }) => new Promise((resolve) => {
      reads.push({ reason: options.reason, release: () => resolve({ audit: { reason: options.reason, window: { from: options.window.from, to: options.window.to }, acceptedDeltas: [] }, facts: [{ text: `fact ${reads.length}`, importance: 2, evidence: "x" }], memory: [], arcs: [], epistemic: [], ledger: [] }) });
    }),
  };
});

import { ExtractionCoordinator } from "./extractionCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";

const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

function harness() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const stored: string[] = [];
  let commits = 0;
  const saves = { count: 0, onSave: null as null | ((count: number) => void) };
  let backfill: { running: boolean; processed: number; total: number; lastError: string | null; stoppedNote?: string } | null = null;
  const memory = {
    enabled: true,
    capable: false,
    get backfill() { return backfill; },
    setBackfill: (next: typeof backfill) => { backfill = next; },
    getFacts: () => [],
    getOpenArcs: () => [],
    getEntities: () => [],
    applyEntries: async (entries: Array<{ text: string }>) => { stored.push(...entries.map((entry) => entry.text)); },
    recordVerifyDrops: () => {},
    applyArcSignals: () => [],
    applyEpistemic: () => {},
    applyLedger: () => {},
    updateInjection: () => {},
  };
  const coordinator = new ExtractionCoordinator({
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [], qualities: [], checkpoints: [], transitions: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 11, visitedAnchors: [], blackboard: { values: {}, versions: {}, latched: {} } }),
    getExtraction: () => ({ audits: [], reconciliationEvents: [], judgedReads: [] }),
    getSettings: () => ({ profileId: "p1", enabled: true, cadence: 1 }),
    memory,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => { commits += 1; },
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    judge: () => null,
    persist: async () => { saves.count += 1; saves.onSave?.(saves.count); },
    notify: () => {},
    ownership: { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) },
  } as never);
  return {
    coordinator, stored, saves, commits: () => commits, backfill: () => backfill,
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
    editMessage: (messageId: number) => { current = { ...current, windowRevision: current.windowRevision + 1, lowestMutatedMessageId: messageId }; },
  };
}

beforeEach(() => { reads.length = 0; });

describe("V3: the memorize backlog stops when its chat does", () => {
  it("a switch during the first window stores nothing, reads no further window and commits nothing", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    await settle();
    h.switchChat();
    reads[0].release();
    expect(await pending).toBe(false);
    expect(h.stored).toEqual([]);
    expect(reads).toHaveLength(1);
    expect(h.commits()).toBe(0);
  });

  it("a switch between windows keeps what the owned window stored and reads nothing after", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    await settle();
    reads[0].release();
    await settle();
    h.switchChat();
    reads[1].release();
    expect(await pending).toBe(false);
    expect(h.stored).toHaveLength(1);
    expect(reads).toHaveLength(2);
    expect(h.commits()).toBe(0);
  });

  it("a switch during the progress save between windows starts no further read", async () => {
    const h = harness();
    h.saves.onSave = () => { if (h.backfill()?.processed === 1) h.switchChat(); };
    const pending = h.coordinator.runMemorizeBacklog(4);
    await settle();
    reads[0].release();
    expect(await pending).toBe(false);
    expect(reads).toHaveLength(1);
  });

  it("a switch during the final full read commits no boundary", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    for (let index = 0; index < 3; index += 1) {
      await settle();
      reads[index].release();
    }
    await settle();
    h.switchChat();
    reads[3].release();
    expect(await pending).toBe(false);
    expect(h.commits()).toBe(0);
  });

  it("control: an unmoved backlog reads every window, the full pass, and commits", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    for (let index = 0; index < 4; index += 1) {
      await settle();
      reads[index].release();
    }
    expect(await pending).toBe(true);
    expect(reads.map((read) => read.reason)).toEqual(["memorize:window", "memorize:window", "memorize:window", "memorize:full"]);
    expect(h.commits()).toBe(1);
    expect(h.backfill()?.running).toBe(false);
  });
});

describe("v2.4 plan 03 D4: the memorize backlog always leaves running when it owns the chat", () => {
  it("a same-chat lapse clears running", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    await settle();
    h.editMessage(2);
    reads[0].release();
    expect(await pending).toBe(false);
    expect(h.stored).toEqual([]);
    expect(reads).toHaveLength(1);
    expect(h.commits()).toBe(0);
    expect(h.backfill()).toMatchObject({ running: false, lastError: "Stopped: the chat changed while memorizing" });
  });

  it("a switch leaves the departed chat's backfill as it was", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    await settle();
    h.switchChat();
    reads[0].release();
    expect(await pending).toBe(false);
    expect(h.backfill()).toMatchObject({ running: true, lastError: null });
  });

  it("Stop keeps applied windows", async () => {
    const h = harness();
    expect(h.coordinator.cancelMemorizeBacklog()).toBe(false);
    const pending = h.coordinator.runMemorizeBacklog(4);
    await settle();
    reads[0].release();
    await settle();
    expect(h.coordinator.cancelMemorizeBacklog()).toBe(true);
    reads[1].release();
    expect(await pending).toBe(false);
    expect(h.stored).toEqual(["fact 1"]);
    expect(reads.map((read) => read.reason)).toEqual(["memorize:window", "memorize:window"]);
    expect(h.commits()).toBe(0);
    expect(h.backfill()).toMatchObject({ running: false, processed: 1, total: 4 });
    expect(h.backfill()?.lastError).toBeNull();
    expect(h.backfill()?.stoppedNote).toMatch(/whole-chat pass/);
    expect(h.coordinator.cancelMemorizeBacklog()).toBe(false);
  });

  it("control: Stop after the run finished changes nothing", async () => {
    const h = harness();
    const pending = h.coordinator.runMemorizeBacklog(4);
    for (let index = 0; index < 4; index += 1) {
      await settle();
      reads[index].release();
    }
    expect(await pending).toBe(true);
    expect(h.coordinator.cancelMemorizeBacklog()).toBe(false);
    expect(h.backfill()).toMatchObject({ running: false, processed: 4, total: 4, lastError: null });
  });
});
