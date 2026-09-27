import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel } from "../../../test/support/modelCall";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import { MemoryCoordinator } from "./memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";

const prompts = new Map<string, string>();
const MEMBERS = ["Arin", "Ponticius"];
const SECRET = "the north road is washed out";

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [{ name: "Ponticius", mes: "Hold the gate." }], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => ({ members: ["arin.png", "ponticius.png"], disabled_members: [] }),
  resolveGroupMemberId: (name: string) => `${name.toLowerCase()}.png`,
  hostSystemUserName: "SillyTavern System",
  getCharacterNameById: (id: number) => MEMBERS[id],
  countTokens: () => 4,
  setStoryExtensionPrompt: (key: string, text: string) => { prompts.set(key, text); },
  clearStoryExtensionPrompt: (key: string) => { prompts.delete(key); },
};

const story = {
  title: "S",
  id: "s1",
  version: 1,
  checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } },
  qualityByKey: {},
  roster: [{ id: "arin", name: "Arin" }, { id: "ponticius", name: "Ponticius" }],
  arc_bridges: [],
};

function harness() {
  prompts.clear();
  const current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memoryState = {
    settings: { enabled: true, epistemicLedgerCapable: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0, arcs: [], epistemic: [], ledger: [], canon: null, updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({ hosts: fakeHosts(stapi),
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 0, blackboard: { values: {}, versions: {} } }),
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
  coordinator.applyEpistemic([{ tag: "knows", subject: "Arin", content: SECRET }], 0);
  return coordinator;
}

const epistemicBlock = () => prompts.get(EPISTEMIC_INJECTION_KEY) ?? "";

describe("a drafted member keeps its private block until its generation closes (v2.5 batch 2, J5.8)", () => {
  it("control: at rest in a group no member's private block is injected, and a draft stages Arin's", () => {
    const coordinator = harness();
    expect(epistemicBlock()).not.toContain(SECRET);
    coordinator.onMemberDrafted(0);
    expect(epistemicBlock()).toContain(SECRET);
  });

  it("an injection refresh mid-draft (a boundary commit, an extraction write) does not clear it", () => {
    const coordinator = harness();
    coordinator.onMemberDrafted(0);
    coordinator.updateInjection();
    expect(epistemicBlock()).toContain(SECRET);
    coordinator.applyEpistemic([{ tag: "knows", subject: "Ponticius", content: "the toll is doubled" }], 0);
    expect(epistemicBlock()).toContain(SECRET);
    expect(epistemicBlock()).not.toContain("the toll is doubled");
  });

  it("a withheld (quiet/impersonate) run stays withheld across a refresh", () => {
    const coordinator = harness();
    coordinator.onMemberDrafted(0);
    coordinator.withholdPrivateKnowledge();
    coordinator.updateInjection();
    expect(epistemicBlock()).not.toContain(SECRET);
  });

  it("a loud generation that opens after the draft keeps it, and ends a withhold left over from a run that never closed", () => {
    const coordinator = harness();
    coordinator.withholdPrivateKnowledge();
    coordinator.onMemberDrafted(0);
    coordinator.updateInjection();
    expect(epistemicBlock()).not.toContain(SECRET);
    coordinator.releaseStaleHold();
    expect(epistemicBlock()).toContain(SECRET);
  });

  it("releasing the draft returns the prompt to the empty resting block, and a later refresh keeps it empty", () => {
    const coordinator = harness();
    coordinator.onMemberDrafted(0);
    coordinator.releasePrivateInjection();
    expect(epistemicBlock()).not.toContain(SECRET);
    coordinator.updateInjection();
    expect(epistemicBlock()).not.toContain(SECRET);
  });
});
