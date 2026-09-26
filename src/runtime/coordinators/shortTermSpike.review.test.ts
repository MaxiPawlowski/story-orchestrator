import { fakeHosts } from "../../../test/support/fakeHosts";
import { recordingModel } from "../../../test/support/modelCall";
import { testOwnership } from "../../../test/findings/testOwnership";
import { ExtractionCoordinator } from "./extractionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";
import { defaultMemorySettings } from "../settingsModel";

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: Array.from({ length: 14 }, (_, index) => ({ name: index % 2 ? "Mira" : "Max", mes: `line ${index}`, is_user: index % 2 === 0 })), chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: async () => 4,
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
};

const earlier = {
  id: "st-old", tier: "short_term", text: "Earlier they met at the mill.", type: "scene", importance: 2, expiration: "session", entities: [],
  confidence: 1, activationTriggers: [], evidence: "", createdAt: 0, messageId: 0, recallCount: 0, tokens: 8,
};

function harness(append: boolean) {
  let memoryState = {
    settings: defaultMemorySettings(),
    entries: [earlier], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0, arcs: [], epistemic: [], ledger: [], canon: null, updatedAt: "", storyStart: 0,
  };
  const story = { title: "S", checkpointById: {}, qualityByKey: {}, roster: [], arc_bridges: [] };
  const state = { activeCheckpointId: "cp1", boundary: 3, lastMessageId: 13, blackboard: { values: {}, versions: {}, latched: {} } };
  const model = recordingModel(() => "They crossed the river at dusk.");
  const memory = new MemoryCoordinator({ hosts: fakeHosts(stapi), ownership: testOwnership(), getStory: () => story, getState: () => state,
    getMemory: () => memoryState, setMemory: (next: typeof memoryState) => { memoryState = next; }, model, getFiredTransitions: () => [],
    getExpansionGateSources: () => [], enqueueExtractorDeltas: () => {}, enqueueMechanical: () => {}, judge: () => null,
    persist: async () => {}, notify: () => {} } as never);
  const extraction = new ExtractionCoordinator({ hosts: fakeHosts(stapi), ownership: testOwnership(), getStory: () => story, getState: () => state,
    getExtraction: () => ({ audits: [], reconciliationEvents: [], judgedReads: [] }), model, memory, getFiredTransitions: () => [],
    getExpansionGateSources: () => [], enqueueExtractorDeltas: () => {}, commitBoundary: async () => {}, fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {}, emitArcsResolved: () => {}, setStatus: () => {}, persist: async () => {}, notify: () => {},
    spikes: () => ({ sp4AppendShortTerm: append }) } as never);
  return { extraction, state: () => memoryState, prompt: () => model.calls.at(-1)?.prompt ?? "" };
}

const shortTerm = (state: { entries: Array<{ tier: string; text: string }> }) => state.entries.filter((entry) => entry.tier === "short_term").map((entry) => entry.text);

describe("v2.5 plan 09 SP4: the append-only short_term runs only behind spikes.sp4AppendShortTerm", () => {
  it("control (flag off): today's rolling entry is rewritten from the previous text and replaces it", async () => {
    const run = harness(false);
    await run.extraction.runShortTermCompaction();
    expect(shortTerm(run.state())).toEqual(["They crossed the river at dusk."]);
    expect(run.prompt()).toContain("EXISTING SUMMARY:");
    expect(run.state().derived.at(-1)).toMatchObject({ kind: "short_term", inputs: ["st-old"], range: { to: 13 } });
  });

  it("flag on: the window is summarised alone and appended, with no input to unwind", async () => {
    const run = harness(true);
    await run.extraction.runShortTermCompaction();
    expect(shortTerm(run.state())).toEqual(["Earlier they met at the mill.", "They crossed the river at dusk."]);
    expect(run.prompt()).not.toContain("EXISTING SUMMARY:");
    expect(run.prompt()).not.toContain("Earlier they met at the mill.");
    expect(run.state().derived.at(-1)).toMatchObject({ kind: "short_term", inputs: [], removed: [], range: { to: 13 } });
    expect(run.state().shortTermSummaryEnd).toBe(13);
  });

  it("flag on: a pinned rolling entry no longer blocks the pass, and stays", async () => {
    const run = harness(true);
    run.state().entries = [{ ...earlier, pinned: true }] as never;
    await run.extraction.runShortTermCompaction();
    expect(shortTerm(run.state())).toHaveLength(2);
  });
});
