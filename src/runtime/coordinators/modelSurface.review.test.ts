jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: Array.from({ length: 14 }, (_, index) => ({ name: index % 2 ? "Mira" : "Max", mes: `line ${index}`, is_user: index % 2 === 0 })), chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: async () => 4,
  sendConnectionProfileRequest: jest.fn(async () => { throw new Error("a coordinator reached the host transport instead of its ModelCall"); }),
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
}));

import { sendConnectionProfileRequest } from "@services/STAPI";
import { recordingModel } from "../../../test/support/modelCall";
import { testOwnership } from "../../../test/findings/testOwnership";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";
import { coordinatorHosts } from "../coordinatorHosts";

const memoryHarness = (model: ReturnType<typeof recordingModel>) => {
  let memoryState = {
    settings: { enabled: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0,
    arcs: [{ id: "arc-0", text: "thread 0", status: "resolved" as const, summary: undefined as string | undefined }],
    epistemic: [], ledger: [], canon: null as { text: string } | null, updatedAt: "",
  };
  return new MemoryCoordinator({ hosts: coordinatorHosts,
    ownership: testOwnership(),
    getStory: () => ({ title: "S", checkpointById: {}, qualityByKey: {}, roster: [], arc_bridges: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5, blackboard: { values: {}, versions: {}, latched: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    model,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
};

const extractionHarness = (model: ReturnType<typeof recordingModel>) => new ExtractionCoordinator({ hosts: coordinatorHosts,
  ownership: testOwnership(),
  getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
  getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
  getExtraction: () => ({ audits: [], reconciliationEvents: [], judgedReads: [] }),
  model,
  memory: { enabled: true, shortTermSummaryEnd: -1, shortTermEntry: () => null, replaceShortTerm: async () => {}, updateInjection: () => {} },
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

const shape = (model: ReturnType<typeof recordingModel>) => model.calls.map(({ ask }) => ({
  role: ask.role, pass: ask.pass, signal: ask.signal instanceof AbortSignal, refuseIncomplete: ask.refuseIncomplete === true,
}));

describe("coordinators ask their injected ModelCall, naming the pass, the role and the run's signal (v2.5 plan 03 D1)", () => {
  it("the arc-summary pass and the canon regeneration it triggers", async () => {
    const model = recordingModel(() => "They crossed the river at dusk.");
    await memoryHarness(model).runArcSummaryPass(["arc-0"]);
    expect(shape(model)).toEqual([
      { role: "synthesis", pass: "arcSummary", signal: true, refuseIncomplete: true },
      { role: "synthesis", pass: "canon", signal: true, refuseIncomplete: true },
    ]);
    expect(sendConnectionProfileRequest).not.toHaveBeenCalled();
  });

  it("the short-term compaction pass", async () => {
    const model = recordingModel(() => "They crossed the river at dusk.");
    await extractionHarness(model).runShortTermCompaction();
    expect(shape(model)).toEqual([{ role: "synthesis", pass: "shortTerm", signal: true, refuseIncomplete: true }]);
    expect(sendConnectionProfileRequest).not.toHaveBeenCalled();
  });
});
