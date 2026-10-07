jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(async () => null),
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
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
}));

import { parseStoryV2OrThrow, type StoryEngine } from "@engine/index";
import { loadChapterKit } from "./chapterPort";
import type { EffectsApplier } from "./effectsApplier";
import type { RuntimeExtras } from "./types";
import { RuntimeManager } from "./runtimeManager";
import { composeInlineTimeline, type InlineSources } from "./inlineTimeline";
import { CanonSynthesis } from "./canonSynthesis";
import { renderReportPrompt } from "@copilot/prompts";
import { testOwnership } from "../../test/findings/testOwnership";

const story = parseStoryV2OrThrow({
  format: 2,
  id: "war",
  title: "War",
  description: "",
  qualities: [{ key: "taken", type: "bool", source: "extractor", rubric: "Taken?" }],
  checkpoints: [
    { id: "war-the-summons", name: "The Summons", objective: "Answer the King", type: "anchor", start: true },
    { id: "war-the-front", name: "Fort Vicinitas", objective: "Report to the fort", type: "anchor" },
  ],
  transitions: [{ from: "war-the-summons", to: "war-the-front", priority: 1, gate: { q: "taken", op: "==", v: true } }],
  roster: [],
});

const managerAt = () => {
  const runtime = new RuntimeManager();
  const probe = runtime as unknown as { loaded: unknown; engine: StoryEngine; effects: EffectsApplier; persist: () => Promise<void>; extras: RuntimeExtras };
  probe.loaded = { record: { id: "war", hash: "h", raw: {} }, story };
  probe.engine.loadStory(story);
  probe.persist = async () => {};
  const co = (runtime as unknown as { co: { pacing: { updateSteering: () => void }; memory: { updateInjection: () => void } } }).co;
  jest.spyOn(co.pacing, "updateSteering").mockImplementation(() => undefined);
  jest.spyOn(co.memory, "updateInjection").mockImplementation(() => undefined);
  jest.spyOn(runtime, "notify").mockImplementation(() => undefined);
  jest.spyOn(runtime, "getSnapshot").mockImplementation(() => ({}) as never);
  jest.spyOn(probe.effects, "releaseStaging").mockImplementation(async () => undefined);
  jest.spyOn(probe.effects, "applyCheckpoint").mockImplementation(async () => undefined);
  return { runtime, probe };
};

const authorRecords = (extras: RuntimeExtras) => extras.journal.filter((record) => record.kind === "author");

beforeAll(async () => { await loadChapterKit(); });

describe("T5-5-1: an author Advance is journaled as an author move, with checkpoint names (journal.jsonl:208)", () => {
  it("activateCheckpoint records the move from and to, by name, at the boundary it made", async () => {
    const { runtime, probe } = managerAt();
    expect(await runtime.activateCheckpoint("war-the-front")).toBe(true);
    const [move] = authorRecords(probe.extras);
    expect(move).toMatchObject({ kind: "author", summary: "Author advance: The Summons → Fort Vicinitas", boundary: probe.engine.serialize().boundary });
    expect(move.note).toContain("war-the-summons → war-the-front");
  });

  it("a nudge is journaled only when it was set, and the driver context names the checkpoint", () => {
    const { runtime, probe } = managerAt();
    probe.extras.copilot = { ...probe.extras.copilot, enabled: true };
    runtime.setCopilotNudge("   ");
    expect(authorRecords(probe.extras)).toEqual([]);
    runtime.setCopilotNudge("A servant of the Queen signals the party.");
    expect(authorRecords(probe.extras).map((record) => [record.summary, record.note])).toEqual([["Author nudge at The Summons", "A servant of the Queen signals the party."]]);
    expect(runtime.getDriverContext()?.activeCheckpointName).toBe("The Summons");
  });
});

describe("T5-5-1: author moves show inline at author levels only", () => {
  const sources = (authorMoves: InlineSources["authorMoves"], authorView: boolean): InlineSources => ({
    story, settings: { level: 4, window: 20, categories: {} }, authorView, chatLength: 12, boundaryLog: [], audits: [], pending: [], reconciliation: [],
    memory: { entries: [], arcs: [], derived: [], conflicts: [], verifyDrops: [] }, loreFired: [], talkDecisions: [], judgeCalls: [], proposals: [], curatorPass: null,
    effects: [], tensionHistory: [], tension: { expected: null, hint: null }, payloadCaptures: [], pipeline: { state: "idle", text: "" } as never,
    agencyRecovery: false, lastRollback: null, saveNotice: null, authorMoves,
  } as InlineSources);
  const moves = [{ at: "2026-10-02T09:34:24.404Z", boundary: 7, messageId: 8, kind: "author" as const, summary: "Author advance: The Summons → Fort Vicinitas", note: "war-the-summons → war-the-front" }];

  it("an advance is an author item under the message it happened at", () => {
    const items = composeInlineTimeline(sources(moves, true)).byMessage[8] ?? [];
    expect(items.map((item) => [item.text, item.level, item.persona])).toEqual([["Author advance: The Summons → Fort Vicinitas", 3, "author"]]);
  });

  it("control: a player never sees it", () => {
    expect(composeInlineTimeline(sources(moves, false)).byMessage[8]).toBeUndefined();
  });
});

describe("T5-5-1: the driver Report reads the canon built for the checkpoint it stands at (shots/019-driver-report.png)", () => {
  const CANON = "WHAT HAS HAPPENED:\nThe party took the commission.\n\nCURRENT STATE:\nThey are bound for Fort Vicinitas.\n\nESTABLISHED FACTS:\nThe army musters.";
  const synthesisAt = () => {
    let active = "war-the-summons";
    let memory = {
      entries: [], arcs: [{ id: "arc-0", text: "the council", status: "resolved" as const, summary: "The council ended." }],
      canon: null as { text: string; checkpointId?: string } | null,
    };
    const synthesis = new CanonSynthesis({
      getStory: () => story,
      getState: () => ({ activeCheckpointId: active, boundary: 6, lastMessageId: 8, visitedAnchors: [] }) as never,
      memory: () => memory as never,
      patch: (next) => { memory = { ...memory, ...(next as object) }; },
      record: () => {}, save: async () => {},
      model: () => async () => ({ text: CANON, finish: "stop" }),
      ownership: () => testOwnership(), enabled: () => true, firedTransitions: () => [], facts: () => [],
      restingEntries: (entries) => entries, restingLines: (text) => text,
    });
    return { synthesis, move: (id: string) => { active = id; } };
  };

  it("after an advance the stale CURRENT STATE is left out, the history kept", async () => {
    const run = synthesisAt();
    expect(await run.synthesis.regenerateCanon(true)).toBe(true);
    run.move("war-the-front");
    const canon = run.synthesis.getCanonAt("war-the-front");
    expect(canon).toContain("The party took the commission.");
    expect(canon).not.toContain("bound for Fort Vicinitas");
  });

  it("control: at the checkpoint it was built for, the whole canon is read", async () => {
    const run = synthesisAt();
    await run.synthesis.regenerateCanon(true);
    expect(run.synthesis.getCanonAt("war-the-summons")).toContain("bound for Fort Vicinitas");
  });

  it("the report prompt names the active checkpoint", () => {
    const prompt = renderReportPrompt({
      title: "War", activeCheckpointId: "war-the-front", activeCheckpointName: "Fort Vicinitas", activeObjective: "Report to the fort",
      unmetGates: [], upcomingAnchors: [], blackboard: {}, canon: "", recentChat: "The colonel reads the writ.",
    });
    expect(prompt).toContain("Active checkpoint: Fort Vicinitas");
    expect(prompt).toContain("The colonel reads the writ.");
  });
});
