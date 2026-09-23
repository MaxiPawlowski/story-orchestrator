// v2.3 plan 03: converting the memory-writing extraction passes onto `beginRun`.
//
// Both passes here send a window of the transcript to a model and write the answer into the
// memory tiers when it comes back. Neither asked whether the window still existed. The short-term
// one is the worse of the two because it REPLACES the rolling summary rather than appending: a
// result that arrives after a chat switch overwrites the live summary with a description of
// another chat.
//
// Owner: plan 03. These are two of the fifty `todo` rows in the write-edge census.

import { ExtractionCoordinator } from "./extractionCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "../runToken";
import { control } from "../../../test/findings/ledger";

// Long enough that `shouldCompactShortTerm` is actually satisfied: it needs
// `lastMessageId - shortTermSummaryEnd >= SHORT_TERM_COMPACTION_MESSAGES` (12). With three
// messages the pass returned before ever calling the model, and the three "discarded" assertions
// below passed while proving nothing — caught 2026-09-20 by the positive control failing, which
// is exactly why each discard case is paired with one.
const chatMessages = Array.from({ length: 14 }, (_, index) => ({
  name: index % 2 === 0 ? "Player" : "Corin",
  mes: `line ${index}`,
  is_user: index % 2 === 0,
}));

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: chatMessagesRef.current, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
}));

const chatMessagesRef = { current: chatMessages as unknown[] };

jest.mock("@extraction/index", () => {
  const actual = jest.requireActual("@extraction/index");
  return {
    ...actual,
    // The slow part. The test releases it after moving the world, which is the whole scenario.
    callExtractionModel: () => { modelGate.calls += 1; modelGate.onCall?.(modelGate.calls); return modelGate.promise; },
    getChatWindow: (from: number, to: number) => ({ from, to, messages: [{ speaker: "Player", text: "We reach the gate." }] }),
  };
});

const modelGate: { promise: Promise<string>; release: (text: string) => void; calls: number; onCall: ((call: number) => void) | null } = {
  promise: Promise.resolve(""),
  release: () => {},
  calls: 0,
  onCall: null,
};
function armModel() {
  modelGate.promise = new Promise<string>((resolve) => { modelGate.release = resolve; });
}

/** Five microtask ticks: enough for a pass to reach its next await, and for a write to have landed. */
async function flush() {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// A hook on the tier write, so a test can move the world at the await BETWEEN the coordinator's
// first check and the writes that follow it. One check on the near side of an await is what C1 was.
const memoryGate: { onApplyEntries: (() => void) | null } = { onApplyEntries: null };
// The stall check is driven through `judged`, which is fire-and-forget, so the judge is behind a
// ref the test can arm rather than wired into the deps at construction.
const judgeRef: { judge: unknown } = { judge: null };

/**
 * A coordinator wired to a world the test can move, and a memory double that records whether it
 * was written to. Everything the passes touch is stubbed; the subject is the ownership check.
 */
function harness() {
  let current: RunContext = { chatId: "chat-a", storyId: "s1", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
  const writes: string[] = [];
  const extractionState = { audits: [] as unknown[], reconciliationEvents: [] as unknown[], judgedReads: [] as unknown[] };
  const memory = {
    enabled: true,
    capable: true,
    applyEntries: async () => { writes.push("applyEntries"); memoryGate.onApplyEntries?.(); },
    recordVerifyDrops: () => { writes.push("recordVerifyDrops"); },
    applyArcSignals: () => { writes.push("applyArcSignals"); return []; },
    applyEpistemic: () => { writes.push("applyEpistemic"); },
    applyLedger: () => { writes.push("applyLedger"); },
    activeEpistemic: () => [],
    ledgerEntityList: () => [],
    shortTermSummaryEnd: -1,
    shortTermEntry: () => null,
    addSceneSummary: async () => { writes.push("addSceneSummary"); return null; },
    replaceShortTerm: async () => { writes.push("replaceShortTerm"); },
    updateInjection: () => {},
    syncWorldInfo: async () => {},
  };
  const coordinator = new ExtractionCoordinator({
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
    getExtraction: () => extractionState,
    getSettings: () => ({ profileId: "p1", enabled: true, cadence: 1 }),
    memory,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    judge: () => judgeRef.judge,
    persist: async () => {},
    notify: () => {},
    ownership,
  } as never);

  return {
    coordinator,
    writes,
    judgedReads: () => extractionState.judgedReads.length,
    switchChat: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
    editInsideWindow: () => { current = { ...current, windowRevision: 1, lowestMutatedMessageId: 0 }; },
    appendAfterWindow: () => { current = { ...current, windowRevision: 1, lowestMutatedMessageId: 99 }; },
  };
}

const audit = { sceneBreak: true, window: { from: 0, to: 2 } };

// The call counter is cumulative across tests, so a control that arms on "call 2" without this
// fires on its neighbour's leftover count — which is a test that passes while testing nothing.
beforeEach(() => {
  modelGate.calls = 0;
  modelGate.onCall = null;
  memoryGate.onApplyEntries = null;
  judgeRef.judge = null;
  stallGate.run = null;
});

control("a scene summary that arrives in its own chat is written", async () => {
  const h = harness();
  armModel();
  const pending = h.coordinator.runSceneBreakPass(audit as never);
  modelGate.release("A tense arrival at the gate.");
  await pending;
  expect(h.writes).toContain("addSceneSummary");
});

control("a scene summary that arrives after a chat switch is discarded", async () => {
  const h = harness();
  armModel();
  const pending = h.coordinator.runSceneBreakPass(audit as never);
  await Promise.resolve();
  h.switchChat();
  modelGate.release("A tense arrival at the gate.");
  await pending;
  expect(h.writes).toEqual([]);
});

control("a scene summary is discarded when the window it described was edited", async () => {
  // Not a chat switch: the same chat, but the messages the summary describes no longer exist.
  const h = harness();
  armModel();
  const pending = h.coordinator.runSceneBreakPass(audit as never);
  await Promise.resolve();
  h.editInsideWindow();
  modelGate.release("A tense arrival at the gate.");
  await pending;
  expect(h.writes).toEqual([]);
});

control("the rolling short-term summary is not replaced by a result from another chat", async () => {
  // The worst of the two: replaceShortTerm overwrites rather than appends, so a stale result
  // does not add noise — it destroys the live summary.
  const h = harness();
  armModel();
  const pending = h.coordinator.runShortTermCompaction();
  await Promise.resolve();
  h.switchChat();
  modelGate.release("They reached the gate and climbed it.");
  await pending;
  expect(h.writes).toEqual([]);
});

control("the rolling short-term summary is discarded when its window was edited", async () => {
  // Same chat, edited transcript. Without a window on the token this case is invisible, and a
  // mutation dropping the window survived on 2026-09-20 because only the scene pass asserted it.
  const h = harness();
  armModel();
  const pending = h.coordinator.runShortTermCompaction();
  await Promise.resolve();
  h.editInsideWindow();
  modelGate.release("They reached the gate and climbed it.");
  await pending;
  expect(h.writes).toEqual([]);
});

control("the rolling short-term summary is still replaced in the ordinary case", async () => {
  // The guard must not become a new way to lose the summary.
  const h = harness();
  armModel();
  const pending = h.coordinator.runShortTermCompaction();
  modelGate.release("They reached the gate and climbed it.");
  await pending;
  expect(h.writes).toContain("replaceShortTerm");
});

// --- applyAudit: the main extraction write path ---
//
// `verifyEntries` is a judge pass, so it can be slow, and everything after it deposits the read's
// conclusions into the memory tiers, the epistemic and ledger stores and the audit ring. A read of
// one chat's window landing in another chat would deposit the whole result there.

const auditWithSignals = {
  sceneBreak: false,
  reason: "cadence",
  window: { from: 0, to: 2 },
  acceptedDeltas: [],
};

const facts = [{ text: "Corin owes a debt", importance: 3, evidence: "line 1" }];

control("an audit applied in its own chat reaches the memory tiers", async () => {
  const h = harness();
  await h.coordinator.applyAudit(auditWithSignals as never, facts as never);
  expect(h.writes).toContain("applyEntries");
});

control("an audit whose chat changed during verification writes nothing", async () => {
  // `applyAudit` runs synchronously up to the verify await, so switching right after the call
  // lands the change inside that await — the real shape of a slow judge pass.
  const h = harness();
  const pending = h.coordinator.applyAudit(auditWithSignals as never, facts as never);
  h.switchChat();
  await pending;
  expect(h.writes).toEqual([]);
});

control("an audit is discarded when the window it read was edited", async () => {
  // These entries are claims ABOUT the messages that were read. An edit inside that span
  // invalidates them; a reply appended after it does not.
  const h = harness();
  const pending = h.coordinator.applyAudit(auditWithSignals as never, facts as never);
  h.editInsideWindow();
  await pending;
  expect(h.writes).toEqual([]);
});

control("a reply appended after the window does not discard the audit", async () => {
  // The case that must NOT discard, or every ordinary turn would throw away its own extraction.
  const h = harness();
  const pending = h.coordinator.applyAudit(auditWithSignals as never, facts as never);
  h.appendAfterWindow();
  await pending;
  expect(h.writes).toContain("applyEntries");
});

control("a world lost during the tier write stops the deposit before the rest of it", async () => {
  // The check before `applyEntries` is on the near side of its token-count await. Without a second
  // check the verify drops, the arc signals, the audit ring and the scene-break emit all land in
  // the chat that replaced this one.
  const h = harness();
  memoryGate.onApplyEntries = () => h.switchChat();
  await h.coordinator.applyAudit(auditWithSignals as never, facts as never);

  expect(h.writes).toContain("applyEntries");
  expect(h.writes).not.toContain("recordVerifyDrops");
});

// --- the epistemic + ledger pass: two model calls, one store written in between ---

control("the epistemic and ledger stores are written in their own chat", async () => {
  const h = harness();
  armModel();
  const pending = h.coordinator.runEpistemicLedgerPass(audit as never);
  await flush();
  modelGate.release("");
  await flush();
  modelGate.release("");
  await pending;

  expect(h.writes).toContain("applyEpistemic");
  expect(h.writes).toContain("applyLedger");
});

control("a world lost during the first model call writes neither store", async () => {
  const h = harness();
  armModel();
  const pending = h.coordinator.runEpistemicLedgerPass(audit as never);
  h.switchChat();
  modelGate.release("");
  await pending;

  expect(h.writes).toEqual([]);
});

control("a world lost during the ledger call leaves the ledger store alone", async () => {
  // The half one check at the end would miss: the epistemic signals are written BEFORE the ledger
  // prompt is sent, so by the time the second answer lands there is a store already written and a
  // second one still to write. The first was in-world and stays; the second is refused.
  const h = harness();
  armModel();
  modelGate.onCall = (call) => { if (call === 2) { armModel(); modelGate.release(""); h.switchChat(); } };
  const pending = h.coordinator.runEpistemicLedgerPass(audit as never);
  await flush();
  modelGate.release("");
  await pending;

  expect(h.writes).toContain("applyEpistemic");
  expect(h.writes).not.toContain("applyLedger");
});

// --- the stall pre-check: a judged verdict that feeds the apply queue ---

const stallJudge = () => ({
  active: () => true,
  ask: async () => stallGate.run?.() ?? { answers: null, model: "m", fallback: null },
});

const stallWork = (reread: () => void) => ({
  kind: "stall" as const,
  reread,
  plan: {
    descriptor: { checkpointId: "cp1", boundary: 3, targetedKeys: ["door"] },
    reason: "reconcile:door",
    window: { from: 0, to: 2, messages: [{ index: 0, speaker: "Player", text: "We reach the gate." }] },
    leaves: [{ q: "door", op: "=", v: true }],
  },
});

const stallGate: { run: (() => Promise<unknown>) | null } = { run: null };

control("a stall verdict lands in its own chat", async () => {
  const h = harness();
  judgeRef.judge = stallJudge();
  stallGate.run = async () => ({ answers: null, model: "m", fallback: null });
  h.coordinator.judged(stallWork(() => h.writes.push("reread")) as never);
  await flush();

  expect(h.judgedReads()).toBe(1);
});

control("a stall verdict that arrives after a chat switch is not recorded", async () => {
  const h = harness();
  judgeRef.judge = stallJudge();
  const pending = deferred<unknown>();
  stallGate.run = () => pending.promise;
  h.coordinator.judged(stallWork(() => h.writes.push("reread")) as never);
  await flush();

  h.switchChat();
  pending.resolve({ answers: null, model: "m", fallback: null });
  await flush();

  expect(h.judgedReads()).toBe(0);
});

