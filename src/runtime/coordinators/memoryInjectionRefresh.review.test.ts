import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel } from "../../../test/support/modelCall";
// v2.3 plan 05 — found by running J5 twice: the first run passed, the second failed.
//
// `applyEpistemic` and `applyLedger` wrote their store through `patch()` alone, so the injected
// per-member private block was only refreshed if the *caller* remembered to call `updateInjection()`
// afterwards — and the caller's guard sits after the write, so a pass that lapsed in between stored
// the knowledge and injected nothing. The player-visible shape: a member drafted just after an
// epistemic pass is handed an EMPTY private block and loses knowledge it demonstrably holds. Nothing
// in the store is wrong, which is why no store-level test could see it.
//
// Owner: plan 05. The live evidence is the two J5 runs; this is the deterministic half.

import { MemoryCoordinator } from "./memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => ({ id: "g1", members: ["ponticius.png"], disabled_members: [] }),
  resolveGroupMemberId: (name: string) => (name === "Ponticius" ? "ponticius.png" : null),
  getCharacterNameById: (id: number) => (id === 0 ? "Ponticius" : null),
  readInjectedPromptBlocks: () => [],
  countTokens: () => 4,
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
};

const { setStoryExtensionPrompt } = stapi;

const SECRET = "the job comes from the Duke's steward";

const story = {
  title: "S",
  id: "s1",
  version: 1,
  checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } },
  qualityByKey: {},
  roster: [{ id: "ponticius", name: "Ponticius" }],
  arc_bridges: [],
};

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memoryState = {
    settings: { enabled: true, epistemicLedgerCapable: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [],
    conflicts: [],
    resolvedConflicts: [],
    writeLog: [],
    excluded: [],
    verifyDrops: [],
    derived: [],
    sceneCount: 0,
    shortTermSummaryEnd: 0,
    arcs: [],
    epistemic: [],
    ledger: [],
    canon: null,
    updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({ hosts: fakeHosts(stapi),
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5, blackboard: { values: {}, versions: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    model: plantedModel,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
  return { coordinator, epistemic: () => memoryState.epistemic as Array<{ subject: string; content: string }> };
}

const injected = () => (setStoryExtensionPrompt as jest.Mock).mock.calls.map((call) => String(call[1] ?? ""));

describe("a stored epistemic signal is injected in the same call (plan 05)", () => {
  beforeEach(() => (setStoryExtensionPrompt as jest.Mock).mockClear());

  it("refreshes the drafted member's private block when the epistemic read lands, without the caller asking", () => {
    const env = harness();
    env.coordinator.updateInjection();
    env.coordinator.onMemberDrafted(0);
    env.coordinator.applyEpistemic([{ tag: "hiding", subject: "Ponticius", content: SECRET, hiddenFrom: "Arin" }], 5);
    expect(env.epistemic().map((entry) => entry.content)).toEqual([SECRET]);
    expect(injected().some((text) => text.includes(SECRET))).toBe(true);
  });

  // The anti-vacuity control: the assertion above must be about the write, not about any injection at
  // all. A member the story does not name gets no block, so a test that "passes" for everyone proves
  // nothing about per-member staging.
  it("does not inject a secret for a member the signal did not name", () => {
    const env = harness();
    env.coordinator.updateInjection();
    env.coordinator.onMemberDrafted(0);
    env.coordinator.applyEpistemic([{ tag: "hiding", subject: "Someone Else", content: SECRET, hiddenFrom: "Arin" }], 5);
    expect(injected().some((text) => text.includes(SECRET))).toBe(false);
  });

  // v2.6 plan 13 defect replay `empty-private-block-ledger`: the ledger half of the same fix had no
  // test, so dropping its `updateInjection()` survived every related suite.
  it("refreshes the ledger block when the ledger read lands, without the caller asking", () => {
    const env = harness();
    env.coordinator.applyLedger([{ entity: "Ponticius", entityType: "character", field: "location", value: "the salt docks" }], 5);
    expect(injected().some((text) => text.includes("the salt docks"))).toBe(true);
  });
});
