import { fakeHosts } from "../../../test/support/fakeHosts";
import { plantedModel } from "../../../test/support/modelCall";
// v2.6 plan 03 spike follow-up 1. SP4 scored its runs at turn 60 with one `short_term` row in the store
// and an EMPTY injected short-term block (rolling k=2, append k=1). The rolling summary is one row, the
// synthesis call may answer up to 1024 tokens, and the injection drops a row that does not fit the tier
// budget (300 tokens) whole. So a long rolling summary was stored and never injected: every recent event
// gone from the prompt, with nothing in the store looking wrong.

import { MemoryCoordinator } from "./memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import { BLOCK_OVERHEAD_TOKENS } from "@memory/budget";
import { provenance } from "@memory/index";

const tokens = (text: string) => Math.ceil(text.length / 4);

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: (text: string) => tokens(text),
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
};

const story = { title: "S", id: "s1", checkpointById: { cp1: { id: "cp1", name: "CP1", objective: "" } }, qualityByKey: {}, roster: [], arc_bridges: [] };

const BUDGET = 300;

function harness() {
  const current: RunContext = { chatId: "chat-a", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) };
  let memoryState = {
    settings: { enabled: true, epistemicLedgerCapable: false, tierBudgets: { facts: 10, session_details: 10, short_term: 10, scene_history: 10 },
      tierTokenBudgets: { facts: 400, session_details: 400, short_term: BUDGET, scene_history: 400 } },
    entries: [] as Array<{ tier: string; text: string; tokens?: number }>,
    conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [],
    sceneCount: 0, shortTermSummaryEnd: 0, arcs: [], epistemic: [], ledger: [], canon: null, updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({ hosts: fakeHosts(stapi),
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 40, blackboard: { values: {}, versions: {} } }),
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
  return { coordinator, shortTerm: () => memoryState.entries.filter((entry) => entry.tier === "short_term") };
}

const sentence = (index: number) => `In the ${index}th hour the caravan crossed the salt flats, and Oszkar counted the remaining water skins twice before night fell.`;
const summaryOf = (count: number) => Array.from({ length: count }, (_, index) => sentence(index + 1)).join(" ");

const rolling = (text: string) => ({
  id: `st-${text.length}`, tier: "short_term" as never, text, type: "scene" as never, importance: 2 as const, expiration: "session" as never,
  entities: [], confidence: 1, activationTriggers: [], evidence: "window", createdAt: 1, recallCount: 0, messageId: 40,
  provenance: provenance({ source: "extractor", messageId: 40, boundary: 3, pass: "short-term-compaction" }),
});

describe("the rolling short-term summary always fits its injected block (SP4 follow-up)", () => {
  it("a summary longer than the tier budget is stored fitted, and the block carries it", async () => {
    const env = harness();
    const long = summaryOf(14);
    expect(tokens(long) + BLOCK_OVERHEAD_TOKENS).toBeGreaterThan(BUDGET);
    await env.coordinator.replaceShortTerm(rolling(long), { from: 24, to: 40 });
    expect(env.shortTerm()).toHaveLength(1);
    const block = env.coordinator.getInjectionBlocks().short_term;
    expect(block).not.toBe("");
    expect(tokens(block) + BLOCK_OVERHEAD_TOKENS).toBeLessThanOrEqual(BUDGET);
    expect(block.startsWith(sentence(1))).toBe(true);
    expect(block.endsWith(".")).toBe(true);
  });

  it("control: a summary within the budget is stored and injected unchanged", async () => {
    const env = harness();
    const short = summaryOf(3);
    await env.coordinator.replaceShortTerm(rolling(short), { from: 24, to: 40 });
    expect(env.coordinator.getInjectionBlocks().short_term).toBe(short);
  });
});
