// v2.4 plan 03 D6, per site. `refuseIncomplete` lives in the client, so a site that stops passing it
// stores a truncated summary and no client test notices. Each case drives the real client through a
// fake host reply: `finish: "length"` stores nothing at that site, and the control stores the answer.

const reply = { finish: "stop" as "stop" | "length" };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: Array.from({ length: 14 }, (_, index) => ({ name: index % 2 ? "Mira" : "Max", mes: `line ${index}`, is_user: index % 2 === 0 })), chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: async () => 4,
  sendConnectionProfileRequest: async () => ({ ok: true, text: "They crossed the river at dusk.", finish: reply.finish }),
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
}));

import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";

function memoryHarness(presummarised: boolean) {
  let memoryState = {
    settings: { enabled: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0,
    arcs: [{ id: "arc-0", text: "thread 0", status: "resolved" as const, summary: (presummarised ? "already summarised" : undefined) as string | undefined }],
    epistemic: [], ledger: [],
    canon: null as { text: string } | null,
    updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({
    getStory: () => ({ title: "S", checkpointById: {}, qualityByKey: {}, roster: [], arc_bridges: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5, blackboard: { values: {}, versions: {}, latched: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    getExtractionSettings: () => ({ profileId: "p1", enabled: true }),
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
  return { coordinator, arcSummary: () => memoryState.arcs[0].summary, canon: () => memoryState.canon?.text ?? null };
}

function shortTermHarness() {
  const written: string[] = [];
  const coordinator = new ExtractionCoordinator({
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
    getExtraction: () => ({ audits: [], reconciliationEvents: [], judgedReads: [] }),
    getSettings: () => ({ profileId: "p1", enabled: true, cadence: 1 }),
    memory: {
      enabled: true,
      shortTermSummaryEnd: -1,
      shortTermEntry: () => null,
      replaceShortTerm: async (entry: { text: string }) => { written.push(entry.text); },
      updateInjection: () => {},
    },
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    persist: async () => {},
    notify: () => {},
  } as never);
  return { coordinator, written };
}

beforeEach(() => { reply.finish = "stop"; });

describe("a truncated summary is not stored, at each summary site", () => {
  it("short-term compaction", async () => {
    const control = shortTermHarness();
    await control.coordinator.runShortTermCompaction();
    expect(control.written).toEqual(["They crossed the river at dusk."]);

    reply.finish = "length";
    const truncated = shortTermHarness();
    await truncated.coordinator.runShortTermCompaction();
    expect(truncated.written).toEqual([]);
  });

  it("arc summary", async () => {
    const control = memoryHarness(false);
    await control.coordinator.runArcSummaryPass(["arc-0"]);
    expect(control.arcSummary()).toBe("They crossed the river at dusk.");

    reply.finish = "length";
    const truncated = memoryHarness(false);
    await truncated.coordinator.runArcSummaryPass(["arc-0"]);
    expect(truncated.arcSummary()).toBeUndefined();
  });

  it("canon", async () => {
    const control = memoryHarness(true);
    await control.coordinator.regenerateCanon(true);
    expect(control.canon()).toBe("They crossed the river at dusk.");

    reply.finish = "length";
    const truncated = memoryHarness(true);
    await truncated.coordinator.regenerateCanon(true);
    expect(truncated.canon()).toBeNull();
  });
});
