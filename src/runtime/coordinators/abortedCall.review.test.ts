import { fakeHosts } from "../../../test/support/fakeHosts";
import { sendModel } from "../../../test/support/modelCall";
import { parseStoryV2OrThrow, StoryEngine, type EngineState } from "@engine/index";
import { ModelCallError } from "@extraction/modelError";
import type { ExpansionRuntimeState } from "@generation/index";
import { createStagecraft } from "../extras";
import { RunOwner } from "../runOwner";
import { ExpansionCoordinator } from "./expansionCoordinator";
import { MemoryCoordinator } from "./memoryCoordinator";
import { StagecraftCoordinator } from "./stagecraftCoordinator";

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  getPlayerName: () => "Max",
  countTokens: async () => 4,
  currentChatOwner: () => null,
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => ({ entries: { 1: { uid: 1, comment: "Bridge", content: "Original", key: ["bridge"], disable: false } } }),
  upsertWIEntry: async () => "updated",
  readWIEntry: async () => null,
  readWIEntryAt: async () => null,
  restoreWIEntryAt: async () => ({ ok: true, confirmed: true }),
  enableWIEntry: async () => ({ ok: true, changed: true }),
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
  sendConnectionProfileRequest: (_profile: string, prompt: string, _maxTokens: number, options: { signal?: AbortSignal }) => model.call(prompt, options.signal),
};

type Answer = { ok: true; text: string; finish: "stop" } | { ok: false; kind: "lapsed" | "transport"; message: string };

const model = {
  signals: [] as AbortSignal[],
  onCall: null as (() => void) | null,
  answer: { ok: true, text: "a summary", finish: "stop" } as Answer,
  async call(_prompt: string, signal: AbortSignal | undefined): Promise<Answer> {
    if (signal) this.signals.push(signal);
    this.onCall?.();
    if (signal?.aborted) return { ok: false, kind: "lapsed", message: "the request was cancelled" };
    return this.answer;
  },
  reset() { this.signals = []; this.onCall = null; this.answer = { ok: true, text: "a summary", finish: "stop" }; },
};

beforeEach(() => model.reset());

const world = () => {
  const deps = { chat: "chat-a" };
  const owner = new RunOwner({ openChatId: () => deps.chat, storyId: () => "s1", playedVersion: () => 1 });
  owner.bump();
  return { owner, deps, switchChat: () => { deps.chat = "chat-b"; owner.bump(); } };
};

function memoryHarness(presummarised: boolean) {
  const w = world();
  let memoryState = {
    settings: { enabled: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [], conflicts: [], resolvedConflicts: [], writeLog: [], excluded: [], verifyDrops: [], derived: [], sceneCount: 0, shortTermSummaryEnd: 0,
    arcs: [{ id: "arc-0", text: "thread 0", status: "resolved" as const, summary: presummarised ? "already summarised" : undefined as string | undefined }],
    epistemic: [], ledger: [], canon: null as { text: string } | null, updatedAt: "",
  };
  const coordinator = new MemoryCoordinator({ hosts: fakeHosts(stapi),
    getStory: () => ({ title: "S", checkpointById: {}, qualityByKey: {}, roster: [], arc_bridges: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5, blackboard: { values: {}, versions: {}, latched: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    model: sendModel(stapi.sendConnectionProfileRequest as never, "p1"),
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership: w.owner.ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
  return { ...w, coordinator, summaries: () => memoryState.arcs.filter((arc) => arc.summary && arc.summary !== "already summarised").map((arc) => arc.id), canon: () => memoryState.canon };
}

const expansionStory = parseStoryV2OrThrow({
  format: 2, id: "s1", title: "Aborted expansion", description: "One stub off the active checkpoint.",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [
    { id: "a", name: "A", objective: "Start.", type: "anchor", start: true },
    { id: "s0", name: "S0", objective: "Bridge.", type: "intermediate" },
    { id: "b", name: "B", objective: "End.", type: "anchor" },
  ],
  transitions: [
    { from: "a", to: "s0", priority: 1, gate: { q: "done", op: "==", v: true } },
    { from: "s0", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } },
  ],
  roster: [],
});
const candidate = { sourceCheckpointId: "a", stubId: "s0", targetAnchorId: "b", transition: expansionStory.outgoingByCheckpoint.a[0] };

function expansionHarness() {
  const w = world();
  const stores: Record<string, ExpansionRuntimeState> = {
    "chat-a": { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
    "chat-b": { entries: {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } },
  };
  const coordinator = new ExpansionCoordinator({ hosts: { player: { getPlayerName: () => "Max" } },
    getStory: () => expansionStory,
    getStoryRaw: () => ({}),
    getState: () => ({ activeCheckpointId: "a", blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState,
    getExpansion: () => stores[w.deps.chat],
    model: sendModel(stapi.sendConnectionProfileRequest as never, "p1"),
    getCanon: () => "",
    getFactTexts: () => [],
    replaceStory: () => undefined,
    setStatus: () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    ownership: w.owner.ownership,
  } as never);
  return { ...w, coordinator, stores, liveJobs: () => (coordinator as unknown as { liveJobs: Map<string, unknown> }).liveJobs.size };
}

const curatorStory = () => parseStoryV2OrThrow({
  format: 2, id: "s1", title: "Aborted curator", description: "Curator scope only.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  stagecraft: { lorebooks: ["Review Lore"] },
});

function curatorHarness() {
  const w = world();
  const engine = new StoryEngine();
  engine.loadStory(curatorStory());
  let state = createStagecraft();
  state.settings = { ...state.settings, curatorEnabled: true, acceptMode: "review" };
  const coordinator = new StagecraftCoordinator({ hosts: fakeHosts(stapi),
    getStory: curatorStory,
    getState: () => ({ ...engine.serialize(), boundary: 10, lastMessageId: 10 }),
    getStagecraft: () => state,
    setStagecraft: (next: typeof state) => { state = next; },
    model: sendModel(stapi.sendConnectionProfileRequest as never, "p1"),
    getCanon: () => "",
    getOpenArcs: () => [],
    journal: () => {},
    persist: async () => {},
    notify: () => {},
    ownership: w.owner.ownership,
  } as never);
  return { ...w, coordinator, get state() { return state; } };
}

describe("v2.4 plan 03 fault matrix: a pass aborted mid-call", () => {
  it("memory: an arc summary aborted by a chat switch cancels its request, writes nothing and surfaces as a lapse", async () => {
    const h = memoryHarness(false);
    model.onCall = () => h.switchChat();
    await expect(h.coordinator.runArcSummaryPass(["arc-0"])).rejects.toMatchObject({ name: "ModelCallError", kind: "lapsed" });
    expect(model.signals[0]?.aborted).toBe(true);
    expect(h.summaries()).toEqual([]);
  });

  it("memory: a canon rebuild aborted by a chat switch cancels its request and writes nothing", async () => {
    const h = memoryHarness(true);
    model.onCall = () => h.switchChat();
    await expect(h.coordinator.canon.regenerateCanon(true)).resolves.toBe(false);
    expect(model.signals[0]?.aborted).toBe(true);
    expect(h.canon()).toBeNull();
  });

  it("control: memory: an arc summary nobody aborts is written", async () => {
    const h = memoryHarness(false);
    await h.coordinator.runArcSummaryPass(["arc-0"]);
    expect(model.signals[0]?.aborted).toBe(false);
    expect(h.summaries()).toEqual(["arc-0"]);
  });

  it("expansion: a generation aborted by a chat switch cancels its request, files nothing in the new chat and frees its key", async () => {
    const h = expansionHarness();
    model.onCall = () => h.switchChat();
    await h.coordinator.generate(candidate as never);
    expect(model.signals[0]?.aborted).toBe(true);
    expect(h.stores["chat-b"].entries).toEqual({});
    expect(h.stores["chat-a"].entries["a->s0->b"]?.status).toBe("generating");
    expect(h.liveJobs()).toBe(0);
  });

  it("expansion: a transport failure fails the chain and reaches the scheduler, so the breaker can count it", async () => {
    const h = expansionHarness();
    model.answer = { ok: false, kind: "transport", message: "API request failed: Response not OK" };
    await expect(h.coordinator.generate(candidate as never)).rejects.toBeInstanceOf(ModelCallError);
    expect(h.stores["chat-a"].entries["a->s0->b"]).toMatchObject({ status: "failed", lastError: "API request failed: Response not OK" });
  });

  it("stagecraft: a curator pass aborted by a chat switch cancels its request and records neither a proposal nor an error", async () => {
    const h = curatorHarness();
    model.onCall = () => h.switchChat();
    const outcome = await h.coordinator.runCuratorPass();
    expect(model.signals[0]?.aborted).toBe(true);
    expect(outcome).toMatchObject({ record: null, discarded: "epoch" });
    expect(h.state.proposals).toEqual([]);
    expect(h.state.lastError).toBeNull();
  });

  it("stagecraft: a curator transport failure is recorded and still reaches the scheduler's breaker", async () => {
    const h = curatorHarness();
    model.answer = { ok: false, kind: "transport", message: "API request failed: Response not OK" };
    await expect(h.coordinator.runCuratorPass()).rejects.toMatchObject({ kind: "transport" });
    expect(h.state.lastError).toBe("API request failed: Response not OK");
  });

  it("control: stagecraft: a curator failure that is not transport is recorded and not thrown", async () => {
    const h = curatorHarness();
    model.answer = { ok: false, kind: "lapsed", message: "the request was cancelled" };
    const outcome = await h.coordinator.runCuratorPass();
    expect(outcome).toMatchObject({ ran: true, record: null });
    expect(h.state.lastError).toBe("the request was cancelled");
  });
});
