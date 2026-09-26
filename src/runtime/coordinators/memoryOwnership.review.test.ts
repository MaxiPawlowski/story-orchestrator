import { testModel } from "../../../test/support/modelCallHost";
// v2.3 plan 03: the two memory passes that synthesise from memory rather than from the transcript.
//
// `runArcSummaryPass` is the shape that decided the guard's design: one await and one write PER
// ARC. A pass over five resolved arcs that outlives a chat switch used to write the remaining four
// into whichever chat was open when each answer landed. The check has to sit inside the loop,
// immediately before each write — which is exactly what a wrapper around the whole pass cannot do.
//
// `regenerateCanon` adds the other case worth pinning: a `finally` that releases the run's own
// in-flight flag must run whether or not the world moved, or canon regeneration wedges for the
// rest of the session.

import { MemoryCoordinator } from "./memoryCoordinator";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { provenance } from "@memory/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import { control } from "../../../test/findings/ledger";
import { coordinatorHosts } from "../coordinatorHosts";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: () => tokenGate.next(),
  sendConnectionProfileRequest: async (_profile: string, prompt: string) => ({ ok: true, text: await modelGate.next(prompt), finish: "stop" }),
  bindChatLorebook: async () => {},
  ensureLorebook: async () => {},
  loadLorebook: async () => null,
  upsertWIEntry: async () => {},
  disableWIEntry: async () => ({ ok: true, changed: true }),
  setStoryExtensionPrompt: () => {},
  clearStoryExtensionPrompt: () => {},
}));

// The tier writes count tokens through the host tokenizer before they write, so this is the await a
// test moves the world across. Same shape as modelGate for the same reason: a hook on the Nth call
// puts the switch at an exact point rather than at a guessable one.
const tokenGate = {
  calls: 0,
  value: 4,
  onCall: null as (() => void) | null,
  async next(): Promise<number> {
    this.calls += 1;
    this.onCall?.();
    return this.value;
  },
  reset() { this.calls = 0; this.onCall = null; this.value = 4; },
};

// A hook fired on each model call, so a test can move the world at an exact point: between the
// Nth answer and the write that follows it. An earlier version handed out deferred promises and
// released them from the test; it deadlocked, and the canon cases then passed in 2ms while
// proving nothing because no arc had a summary for canon to build from.
const modelGate = {
  calls: 0,
  onCall: null as ((call: number) => void) | null,
  prompts: [] as string[],
  answer: "a summary",
  async next(prompt: string): Promise<string> {
    this.calls += 1;
    this.prompts.push(prompt);
    this.onCall?.(this.calls);
    return this.answer;
  },
  /** Arc prompts carry the arc text; the canon prompt at the end of the pass does not. */
  arcCalls() { return this.prompts.filter((text) => text.includes("thread ")).length; },
  reset() { this.calls = 0; this.prompts = []; this.onCall = null; this.answer = "a summary"; },
};
function harness(arcCount: number, presummarised = 0) {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };

  let memoryState = {
    settings: { enabled: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: [],
    conflicts: [],
    resolvedConflicts: [],
    writeLog: [],
    excluded: [],
    verifyDrops: [],
    derived: [] as Array<{ kind: string; inputs: string[]; outputId?: string }>,
    sceneCount: 0,
    shortTermSummaryEnd: 0,
    arcs: Array.from({ length: arcCount }, (_, index) => ({
      id: `arc-${index}`,
      text: `thread ${index}`,
      status: "resolved" as const,
      summary: (index < presummarised ? "already summarised" : undefined) as string | undefined,
    })),
    epistemic: [],
    ledger: [],
    canon: null as { text: string; inputHash: string; updatedAt: string; stale?: boolean } | null,
    updatedAt: "",
  };

  const coordinator = new MemoryCoordinator({ hosts: coordinatorHosts,
    getStory: () => ({ title: "S", checkpointById: {}, qualityByKey: {}, roster: [], arc_bridges: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5, blackboard: { values: {}, versions: {}, latched: {} } }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { memoryState = next; },
    model: testModel("p1"),
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);

  return {
    coordinator,
    summaries: () => memoryState.arcs.filter((arc) => Boolean(arc.summary)).map((arc) => arc.id),
    derived: () => memoryState.derived,
    canon: () => memoryState.canon,
    markCanonStale: () => { if (memoryState.canon) memoryState.canon = { ...memoryState.canon, stale: true }; },
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
    mutateAt: (messageId: number) => { current = { ...current, windowRevision: current.windowRevision + 1, lowestMutatedMessageId: messageId }; },
    inFlight: () => (coordinator as unknown as { canonInFlight: boolean }).canonInFlight,
    entries: () => (memoryState.entries as Array<{ text: string }>).map((entry) => entry.text),
    shortTerm: () => (memoryState.entries as Array<{ tier: string; text: string }>).find((entry) => entry.tier === "short_term")?.text,
    shortTermEnd: () => memoryState.shortTermSummaryEnd,
    seed: (rows: unknown[]) => { memoryState = { ...memoryState, entries: rows as never, settings: { ...memoryState.settings, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 } } as never }; },
    rows: () => memoryState.entries as Array<{ id: string; text: string; tokens?: number; provenance?: { source: string; override?: { from: string; boundary: number } } }>,
  };
}

beforeEach(() => { modelGate.reset(); tokenGate.reset(); });

// --- the tier writes that follow a token count (2026-09-21) ---
//
// `applyEntries`, `addSceneSummary` and `replaceShortTerm` each call the host tokenizer before they
// write. Their callers check ownership on the NEAR side of that call, so the count is an await on
// the far side of the last check — the shape C1 had. `replaceShortTerm` is the one that matters
// most: it OVERWRITES the rolling summary, so a stale write destroys the live one rather than
// adding noise.

const tierEntry = (text: string) => ({
  id: `e-${text}`,
  tier: "facts" as never,
  text,
  type: "fact" as never,
  importance: 2 as const,
  expiration: "session" as never,
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: text,
  createdAt: 0,
  recallCount: 0,
  messageId: 5,
  provenance: provenance({ source: "extractor", messageId: 5, boundary: 0, pass: "shared-read" }),
});

control("entries land in their own chat's tiers", async () => {
  const h = harness(0);
  await h.coordinator.applyEntries([tierEntry("a fact")], { from: 0, to: 5 });
  expect(h.entries()).toEqual(["a fact"]);
});

control("an entry whose token count lands after a chat switch is not written", async () => {
  const h = harness(0);
  tokenGate.onCall = () => h.switchChat();
  await h.coordinator.applyEntries([tierEntry("a fact")], { from: 0, to: 5 });
  expect(h.entries()).toEqual([]);
});

control("an edit inside the window the entry describes discards it, an append after it does not", async () => {
  const edited = harness(0);
  tokenGate.onCall = () => edited.mutateAt(3);
  await edited.coordinator.applyEntries([tierEntry("a fact")], { from: 0, to: 5 });
  expect(edited.entries()).toEqual([]);

  const appended = harness(0);
  tokenGate.onCall = () => appended.mutateAt(6);
  await appended.coordinator.applyEntries([tierEntry("a fact")], { from: 0, to: 5 });
  expect(appended.entries()).toEqual(["a fact"]);
});

control("a scene summary returns its occurrence and records it", async () => {
  const h = harness(0);
  const occurrence = await h.coordinator.addSceneSummary(tierEntry("a scene"), { from: 0, to: 5 });
  expect(occurrence).toBe(1);
  expect(h.entries()).toEqual(["a scene"]);
});

control("a scene summary keeps its derived record, so a rollback past it restores the scene rows it expired", async () => {
  const h = harness(0);
  h.seed([{ ...tierEntry("the lamp is lit"), id: "scoped", tier: "session_details", type: "scene", expiration: "scene", messageId: 2 }]);
  await h.coordinator.addSceneSummary(tierEntry("a scene"), { from: 0, to: 9 });
  expect(h.entries()).toEqual(["a scene"]);
  expect(h.derived().map((record) => record.kind)).toEqual(["scene_summary"]);
  h.coordinator.rollbackFromMessage(8, 3);
  expect(h.entries()).toEqual(["the lamp is lit"]);
});

control("a scene summary whose world moved returns no occurrence and records nothing", async () => {
  // The null is the contract the caller relies on: with a bare number it would fire scene-break
  // replies for a scene that was never recorded.
  const h = harness(0);
  tokenGate.onCall = () => h.switchChat();
  const occurrence = await h.coordinator.addSceneSummary(tierEntry("a scene"), { from: 0, to: 5 });
  expect(occurrence).toBeNull();
  expect(h.entries()).toEqual([]);
});

control("the rolling short-term summary is replaced in its own world", async () => {
  const h = harness(0);
  await h.coordinator.replaceShortTerm({ ...tierEntry("live"), tier: "short_term" as never }, { from: 0, to: 3 });
  expect(h.shortTerm()).toBe("live");
  expect(h.shortTermEnd()).toBe(3);
});

control("a rolling summary whose world moved does not overwrite the live one", async () => {
  const h = harness(0);
  await h.coordinator.replaceShortTerm({ ...tierEntry("live"), tier: "short_term" as never }, { from: 0, to: 3 });
  tokenGate.onCall = () => h.switchChat();
  await h.coordinator.replaceShortTerm({ ...tierEntry("stale"), tier: "short_term" as never }, { from: 4, to: 5 });

  expect(h.shortTerm()).toBe("live");
  expect(h.shortTermEnd()).toBe(3);
});

control("an arc pass that stays in its own chat summarises every arc", async () => {
  const h = harness(3);
  await h.coordinator.runArcSummaryPass(["arc-0", "arc-1", "arc-2"]);
  expect(h.summaries()).toEqual(["arc-0", "arc-1", "arc-2"]);
  expect(h.derived().filter((record) => record.kind === "arc_summary").map((record) => record.inputs[0])).toEqual(["arc-0", "arc-1", "arc-2"]);
  expect(modelGate.arcCalls()).toBe(3);
});

control("an arc pass stops writing the moment the chat changes", async () => {
  // Arc 0 is answered and written while the pass still owns its chat. The switch lands between
  // the second answer and the write that would follow it, so nothing from there on is written.
  const h = harness(3);
  modelGate.onCall = (call) => { if (call === 2) h.switchChat(); };
  await h.coordinator.runArcSummaryPass(["arc-0", "arc-1", "arc-2"]);
  expect(h.summaries()).toEqual(["arc-0"]);
  // And it stops ASKING too, rather than burning three more model calls on answers it will drop.
  expect(modelGate.arcCalls()).toBe(2);
});

control("canon is not overwritten by a result from another chat", async () => {
  // One arc already carries a summary, so canon has something to build from. Without that this
  // case returns before reaching the model and asserts nothing.
  const h = harness(1, 1);
  modelGate.onCall = () => h.switchChat();
  await h.coordinator.regenerateCanon(true);
  expect(modelGate.arcCalls()).toBe(0);
  expect(h.canon()).toBeNull();
});

// v2.3 plan 05: resolving a conflict marks the canon stale, and staleness has to be a reason to
// rebuild on its own. The inputs hash cannot see a validity change, so gating on the hash alone left
// the player's "story so far" empty for good after a resolution the canon could not notice.
control("a stale canon is rebuilt even when its inputs hash the same", async () => {
  const h = harness(1, 1);
  expect(await h.coordinator.regenerateCanon(true)).toBe(true);
  const calls = modelGate.calls;
  h.markCanonStale();
  expect(await h.coordinator.regenerateCanon()).toBe(true);
  expect(modelGate.calls).toBe(calls + 1);
  expect(h.canon()?.stale).toBe(false);
});

control("a canon whose inputs have not changed and which is not stale is left alone", async () => {
  const h = harness(1, 1);
  expect(await h.coordinator.regenerateCanon(true)).toBe(true);
  const calls = modelGate.calls;
  expect(await h.coordinator.regenerateCanon()).toBe(false);
  expect(modelGate.calls).toBe(calls);
});

control("canon IS written when the chat has not moved", async () => {
  const h = harness(1, 1);
  await h.coordinator.regenerateCanon(true);
  expect(h.canon()).not.toBeNull();
});

control("the in-flight flag is released even when the world moved", async () => {
  const h = harness(1, 1);
  modelGate.onCall = () => h.switchChat();
  await h.coordinator.regenerateCanon(true);
  expect(h.inFlight()).toBe(false);
});

// --- runConsolidation: the destructive pass ---
//
// Consolidation DROPS and supersedes memory entries, which the other passes never do. Three awaits
// run per tier group (two embedding passes and a judge pass), so a run that outlives its chat would
// delete another chat's memory. The check is inside the loop because each group is its own write.

jest.mock("../consolidationMatches", () => ({
  buildMatchSets: async (_host: unknown, group: Array<unknown>) => {
    matchGate.onBuild?.();
    return {
      dup: group.map((_, index) => new Set<number>(index === 0 ? [] : [0])),
      sameTopic: group.map(() => new Set<number>()),
    };
  },
  judgePairRelations: async () => [],
}));

const matchGate: { onBuild: (() => void) | null } = { onBuild: null };

function consolidationHarness(groupSize: number) {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  let memoryState = {
    settings: { enabled: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } },
    entries: Array.from({ length: groupSize }, (_, index) => ({
      id: `m${index}`,
      tier: "facts" as const,
      text: "Corin owes a debt",
      type: "fact" as const,
      importance: 2,
      createdAt: index,
    })),
    arcs: [],
    epistemic: [],
    ledger: [],
    canon: null,
    backfill: null,
    verifyDrops: [],
    derived: [] as Array<{ kind: string; inputs: string[] }>,
    conflicts: [],
    resolvedConflicts: [],
    updatedAt: "",
  };
  const patches: string[] = [];
  const coordinator = new MemoryCoordinator({ hosts: coordinatorHosts,
    getStory: () => ({ title: "S", checkpointById: {}, qualityByKey: {}, roster: [], arc_bridges: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3, lastMessageId: 5 }),
    getMemory: () => memoryState,
    setMemory: (next: typeof memoryState) => { patches.push("patch"); memoryState = next; },
    model: testModel("p1"),
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    enqueueMechanical: () => {},
    ownership,
    judge: () => null,
    persist: async () => {},
    notify: () => {},
  } as never);
  // The subject here is the ownership check, not the injection pipeline that runs after a
  // successful consolidation. Stubbing it keeps an unrelated crash from deciding the result.
  (coordinator as unknown as { updateInjection: () => void }).updateInjection = () => {};

  return {
    coordinator,
    patches,
    derived: () => memoryState.derived,
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
    inFlight: () => (coordinator as unknown as { consolidationInFlight: boolean }).consolidationInFlight,
  };
}

control("consolidation of a group below the minimum does nothing (fixture sanity)", async () => {
  // Pinned so the cases below cannot pass by never reaching the loop body.
  const h = consolidationHarness(3);
  matchGate.onBuild = null;
  await h.coordinator.runConsolidation();
  expect(h.patches).toEqual([]);
});

control("consolidation stops writing when the chat changes mid-pass", async () => {
  const h = consolidationHarness(10);
  matchGate.onBuild = () => h.switchChat();
  await h.coordinator.runConsolidation();
  expect(h.patches).toEqual([]);
});

control("consolidation releases its in-flight flag even when the world moved", async () => {
  const h = consolidationHarness(10);
  matchGate.onBuild = () => h.switchChat();
  await h.coordinator.runConsolidation();
  expect(h.inFlight()).toBe(false);
});

control("consolidation DOES write when the chat has not moved (anti-vacuity)", async () => {
  // Without this the "stops writing" case above proves nothing: with empty match sets the loop
  // `continue`s and patches nothing whether or not the world moved.
  const h = consolidationHarness(10);
  matchGate.onBuild = null;
  await h.coordinator.runConsolidation();
  expect(h.patches.length).toBeGreaterThan(0);
});

control("a dedup keeps its derived record with the rows it dropped", async () => {
  const h = consolidationHarness(10);
  matchGate.onBuild = null;
  await h.coordinator.runConsolidation();
  const dedups = h.derived().filter((record) => record.kind === "dedup") as Array<{ removed?: unknown[] }>;
  expect(dedups).toHaveLength(1);
  expect(dedups[0].removed?.length).toBeGreaterThan(0);
});

describe("V3: a supersession bridge enqueues only into the story it read for", () => {
  const bridgeStory = () => parseStoryV2OrThrow({
    format: 2, id: "bridge", title: "Bridge", description: "",
    qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
    checkpoints: [{ id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true }, { id: "island", name: "Island", objective: "Rest", type: "anchor" }],
    transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
    roster: [],
  });

  function bridge() {
    let current: RunContext = { chatId: "chat-a", storyId: "bridge", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
    const enqueued: unknown[] = [];
    const story = bridgeStory();
    const engine = new StoryEngine();
    engine.loadStory(story);
    const coordinator = new MemoryCoordinator({ hosts: coordinatorHosts,
      getStory: () => story,
      getState: () => engine.serialize(),
      getMemory: () => ({ entries: [], settings: { enabled: true } }),
      setMemory: () => {},
      model: testModel("p1"),
      getFiredTransitions: () => [],
      getExpansionGateSources: () => [],
      enqueueExtractorDeltas: (deltas: unknown[]) => { enqueued.push(...deltas); },
      enqueueMechanical: () => {},
      ownership: { mint: (window = null) => mintToken(current, window), check: (token: RunToken) => tokenMatches(current, token) },
      judge: () => null,
      persist: async () => {},
      notify: () => {},
    } as never);
    return { coordinator, enqueued, swapStory: () => { current = { ...current, storyId: "other", sessionEpoch: 2 }; } };
  }
  const superseding = [{ id: "m9", text: "Mira crossed the river at dawn.", messageId: 7 }] as never;

  beforeEach(() => { modelGate.reset(); modelGate.answer = 'DELTA crossed value=true evidence="crossed the river"'; });

  it("a story swap during the bridge's model call enqueues nothing", async () => {
    const h = bridge();
    modelGate.onCall = () => h.swapStory();
    expect(await h.coordinator.runSupersessionBridge(superseding)).toBe(false);
    expect(h.enqueued).toEqual([]);
  });

  it("control: an unmoved bridge enqueues the delta it read", async () => {
    const h = bridge();
    expect(await h.coordinator.runSupersessionBridge(superseding)).toBe(true);
    expect(h.enqueued).toHaveLength(1);
  });
});

describe("V11: the ledger cap is told where the history floor is", () => {
  it("a pass at the row cap trims a version no rollback can reach, not the one at the floor", () => {
    const at = (id: string, entity: string, messageId: number) => ({ id, entity, entityType: "character", field: "location", value: `${entity}${messageId}`, messageId, boundary: messageId, createdAt: messageId, provenance: { source: "extractor", messageId, boundary: messageId, pass: "ledger", validity: "live" } });
    const filler = Array.from({ length: 236 }, (_, index) => at(`f${index}`, "F", 100 + index));
    let memory = { entries: [], arcs: [], epistemic: [], conflicts: [], resolvedConflicts: [], excluded: [], derived: [], writeLog: [], verifyDrops: [], canon: null, settings: { enabled: true, tierTokenBudgets: { facts: 400, session: 400, short_term: 400, scene_history: 400 } }, ledger: [at("a1", "A", 1), at("b2", "B", 2), at("b3", "B", 3), at("a8", "A", 8), ...filler] } as never as { ledger: Array<{ id: string }> };
    const coordinator = new MemoryCoordinator({ hosts: coordinatorHosts,
      getStory: () => ({ title: "S", checkpointById: {}, qualityByKey: {}, roster: [], ledger_bindings: [] }),
      getState: () => ({ activeCheckpointId: "cp1", boundary: 400, lastMessageId: 400, blackboard: { values: {}, versions: {}, latched: {} } }),
      historyFloor: () => 5,
      getMemory: () => memory,
      setMemory: (next: typeof memory) => { memory = next; },
      model: testModel("p1"),
      getFiredTransitions: () => [],
      getExpansionGateSources: () => [],
      enqueueExtractorDeltas: () => {},
      enqueueMechanical: () => {},
      judge: () => null,
      persist: async () => {},
      notify: () => {},
    } as never);
    coordinator.applyLedger([{ entity: "B", entityType: "character", field: "location", value: "keep" }], 400);
    const ids = memory.ledger.map((row) => row.id);
    expect(ids).toContain("a1");
    expect(ids).not.toContain("b2");
  });
});

describe("V8 (M7): an edited entry is re-costed, and the new text is the author's claim", () => {
  const row = (text: string) => ({ id: "f1", tier: "facts", type: "fact", text, tokens: 1, importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "", createdAt: 1, messageId: 2, recallCount: 0, provenance: { source: "extractor", messageId: 2, boundary: 1, pass: "shared-read", validity: "live" } });

  it("stores the exact count of the new text and records the edit as an override", async () => {
    const h = harness(0);
    h.seed([row("Old.")]);
    tokenGate.value = 17;
    await h.coordinator.editMemoryEntry("f1", "A much longer corrected text about the ferryman.");
    expect(h.rows()[0]).toMatchObject({ text: "A much longer corrected text about the ferryman.", tokens: 17, provenance: { source: "author", override: { from: "edit", boundary: 3 } } });
  });

  it("a count that lands after a chat switch is not stored", async () => {
    const h = harness(0);
    h.seed([row("Old.")]);
    tokenGate.value = 17;
    tokenGate.onCall = () => h.switchChat();
    await h.coordinator.editMemoryEntry("f1", "Corrected.");
    expect(h.rows()[0].tokens).toBeUndefined();
  });

  it("a count for text the row no longer holds is not stored on it", async () => {
    const h = harness(0);
    h.seed([row("Old.")]);
    tokenGate.value = 17;
    tokenGate.onCall = () => h.seed([{ ...row("Edited again."), tokens: undefined }]);
    await h.coordinator.editMemoryEntry("f1", "Corrected.");
    expect(h.rows()[0]).toMatchObject({ text: "Edited again." });
    expect(h.rows()[0].tokens).toBeUndefined();
  });
});
