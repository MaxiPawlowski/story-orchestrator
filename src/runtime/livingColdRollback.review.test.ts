jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: () => ({ chat: [] }),
}));
jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { SceneTestRecord } from "@generation/living/sceneTest";
import { createLivingState, type LivingRuntimeState } from "@generation/living/types";
import type { LivingCoordinatorDeps } from "./coordinators/livingCoordinator";
import { LivingPort } from "./livingPort";
import { runRollback, type RollbackDeps } from "./rollback";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

const raw = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/living-premise.story.json"), "utf8")) as Record<string, unknown>;
const story = parseStoryV2OrThrow(raw) as NormalizedStoryV2;

const record = (frontierId: string, plannedAt: number): SceneTestRecord => ({
  frontierId, plannedAt, messageId: plannedAt * 2, chaos: 4, p: 5 / 7, unit: 0.1, drawn: "altered", applied: "altered", expected: { from: "Turn 1", thread: null },
});

const tracked = (records: SceneTestRecord[]): LivingRuntimeState => ({ ...createLivingState(), authored: { raw, hash: "h" }, sceneTests: records });

const deferredImport = () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const importer = () => gate.then(() => import("./coordinators/livingCoordinator"));
  return { importer, release: () => release() };
};

const harness = () => {
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const living: Record<string, LivingRuntimeState> = { "chat-a": tracked([record("liv_1", 2)]), "chat-b": tracked([record("liv_1", 2)]) };
  const events: string[] = [];
  const persisted: string[] = [];
  const livingDeps = {
    ownership, getStory: () => story, getState: () => null, loaded: () => null, branching: () => false, notify: () => undefined, journal: () => undefined,
    getLiving: () => living[String(context.chatId)],
    setLiving: (next: LivingRuntimeState) => { events.push("living-write"); living[String(context.chatId)] = next; },
  } as unknown as LivingCoordinatorDeps;
  const imported = deferredImport();
  const port = new LivingPort(livingDeps, imported.importer);
  const engine = new StoryEngine();
  engine.loadStory(story);
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
  const extras = { memory: { chapters: [] }, extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } };
  const deps = {
    engine, ownership,
    journal: { record: () => undefined, getRecords: () => [] },
    context: () => ({ lastMessageId: 3, chatLength: 4, journal: { boundary: 1, messageId: 3 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => { events.push("injection"); } },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    restoreLiving: (boundary: number, run: Parameters<LivingPort["restoreAfterRollback"]>[1]) => port.restoreAfterRollback(boundary, run),
    livingMovedAfter: (boundary: number) => port.movedAfter(boundary),
    extras: () => extras as unknown as RuntimeExtras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => { events.push("persist"); persisted.push(JSON.stringify(living[String(context.chatId)]?.sceneTests ?? null)); },
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  return { context, living, events, persisted, port, release: imported.release, deps };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Astra 2026-10-16 P1: a cold living rollback is owned and awaited", () => {
  it("a chat switch while the living chunk loads leaves chat B untouched and chat A's run lapses", async () => {
    const h = harness();
    expect(h.port.loaded()).toBe(false);
    const pending = runRollback(h.deps, 4, undefined, "swipe", 1);
    await settle();
    h.context.chatId = "chat-b";
    h.context.sessionEpoch += 1;
    h.release();
    const outcome = await pending;
    await settle();
    expect(h.port.loaded()).toBe(true);
    expect(h.living["chat-b"]?.sceneTests).toEqual([record("liv_1", 2)]);
    expect(h.living["chat-a"]?.sceneTests).toEqual([record("liv_1", 2)]);
    expect(h.events).not.toContain("living-write");
    expect(outcome).toEqual({ ok: true, result: "noop" });
  });

  it("same chat, cold: the restore lands before injections are rebuilt and before the rollback persists", async () => {
    const h = harness();
    const pending = runRollback(h.deps, 4, undefined, "swipe", 1);
    await settle();
    h.release();
    const outcome = await pending;
    expect(outcome).toEqual({ ok: true, result: "applied" });
    expect(h.living["chat-a"]?.sceneTests).toEqual([]);
    expect(h.persisted).toEqual(["[]"]);
    const write = h.events.indexOf("living-write");
    expect(write).toBeGreaterThanOrEqual(0);
    expect(write).toBeLessThan(h.events.indexOf("injection"));
    expect(write).toBeLessThan(h.events.indexOf("persist"));
  });

  it("control: a warm port restores at once in the same chat", async () => {
    const h = harness();
    h.release();
    h.port.adopt("activate");
    await settle();
    expect(h.port.loaded()).toBe(true);
    expect(await runRollback(h.deps, 4, undefined, "swipe", 1)).toEqual({ ok: true, result: "applied" });
    expect(h.persisted).toEqual(["[]"]);
  });
});
