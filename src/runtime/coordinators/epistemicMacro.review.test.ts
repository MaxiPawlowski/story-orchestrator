// v2.4 plan 01 T10 (X5, inv 15): `story_epistemic` renders `getEpistemicBlock()`. In a group it used to
// re-render for `activeSpeakerId`, and after our own transition Note that read null, so the macro merged
// EVERY member's private knowledge. In a group it now answers the applied block: empty at rest, the
// drafted member's own block while drafted. Solo is unchanged.

import { MemoryCoordinator } from "./memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";

const mockHost: { group: boolean; rows: unknown[]; prompts: Record<string, { value: string; depth: number; role: number }> } = { group: true, rows: [], prompts: {} };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: mockHost.rows, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => (mockHost.group ? { disabled_members: [] } : null),
  resolveGroupMemberId: (name: string) => (["Arin", "Luke", "Ponticius"].includes(name) ? `${name}.png` : null),
  getCharacterNameById: (id: number | undefined) => (id === undefined ? undefined : ["Arin", "Luke", "Ponticius"][id]),
  hostSystemUserName: "SillyTavern System",
  countTokens: () => 4,
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: (key: string, value: string, depth: number) => { mockHost.prompts[key] = { value, depth, role: 0 }; },
  clearStoryExtensionPrompt: (key: string) => { delete mockHost.prompts[key]; },
  readInjectedPromptBlocks: () => Object.entries(mockHost.prompts).filter(([, entry]) => entry.value.trim()).map(([key, entry]) => ({ key, ...entry })),
}));

const LUKE_SECRET = "the relic in the chapel is a forgery";
const ARIN_SECRET = "the north road washed out";

const story = {
  title: "S",
  id: "s1",
  version: 1,
  checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } },
  qualityByKey: {},
  roster: [{ id: "arin", name: "Arin" }, { id: "luke", name: "Luke" }, { id: "ponticius", name: "Ponticius" }],
  arc_bridges: [],
};

const reply = (name: string) => ({ name, is_user: false, is_system: false, mes: "…", extra: { api: "textgenerationwebui" } });
const note = { name: "Note", is_user: false, is_system: true, mes: "Checkpoint: The Gate", extra: { type: "comment", isSmallSys: true } };

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memoryState = {
    settings: {
      enabled: true,
      epistemicLedgerCapable: true,
      tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 },
      injectionDepths: { facts: 4, session: 6, short_term: 2, scene_history: 8 },
    },
    entries: [], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0, arcs: [], epistemic: [], ledger: [], canon: null, updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5, blackboard: { values: {}, versions: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    getExtractionSettings: () => ({ profileId: "p1", enabled: true }),
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
  coordinator.applyEpistemic([
    { tag: "hiding", subject: "Luke", content: LUKE_SECRET, hiddenFrom: "Arin" },
    { tag: "hiding", subject: "Arin", content: ARIN_SECRET, hiddenFrom: "Luke" },
  ] as never, 5);
  return coordinator;
}

describe("story_epistemic in a group answers the applied block (T10, X5)", () => {
  beforeEach(() => {
    mockHost.group = true;
    mockHost.prompts = {};
    mockHost.rows = [reply("Arin"), { name: "You", is_user: true, mes: "Onward." }, reply("Luke"), note];
  });

  it("is empty at rest after the transition Note", () => {
    const coordinator = harness();
    coordinator.updateInjection();
    expect(coordinator.getEpistemicBlock()).toBe("");
  });

  it("is the drafted member's own block while drafted, and nobody else's", () => {
    const coordinator = harness();
    coordinator.onMemberDrafted(0);
    const block = coordinator.getEpistemicBlock();
    expect(block).toContain(ARIN_SECRET);
    expect(block).not.toContain(LUKE_SECRET);
  });

  it("keeps the solo render unchanged", () => {
    mockHost.group = false;
    const coordinator = harness();
    expect(coordinator.getEpistemicBlock()).toContain(LUKE_SECRET);
  });
});
