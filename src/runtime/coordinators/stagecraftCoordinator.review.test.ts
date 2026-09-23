// Promoted from the 2026-09-18 external review (scripts/review/reviewRegression.test.ts).
// Each finding() states the contract the fix must satisfy; test/findings/ledger.json says whether
// it is still open and, while open, the reason it must fail with. See v2.3 plan 01 §A.

import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
import { StagecraftCoordinator } from "@runtime/coordinators/stagecraftCoordinator";
import { createStagecraft } from "@runtime/extras";
import { loadLorebook, upsertWIEntry, readWIEntry, enableWIEntry, disableWIEntry } from "@services/STAPI";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import { control, finding, must } from "../../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  loadLorebook: jest.fn(),
  upsertWIEntry: jest.fn(),
  // The write edge reads the entry itself (R2). The fake book tracks one entry, so this is the same
  // state `upsertWIEntry` writes and the rollback restores.
  readWIEntry: jest.fn(),
  enableWIEntry: jest.fn(),
  disableWIEntry: jest.fn(),
  getContext: () => ({ chat: chatRef.current, extensionSettings: {} }),
  activateGlobalLorebook: jest.fn(async () => ({ ok: true as const })),
  listAllLorebooks: () => ["Existing user book"],
}));
jest.mock("@extraction/client", () => ({ callExtractionModel: jest.fn() }));

const chatRef = { current: [] as unknown[] };

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "review-independent",
  title: "Review crossing",
  description: "Independent fixture",
  qualities: [
    { key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" },
    { key: "outside", type: "bool", source: "extractor", rubric: "Outside scope?" },
    { key: "locked", type: "bool", source: "code", rubric: "Code owns lock" },
  ],
  checkpoints: [
    { id: "bank", name: "Bank", objective: "Cross", type: "anchor", start: true },
    { id: "island", name: "Island", objective: "Rest", type: "anchor" },
  ],
  transitions: [{ id: "cross", from: "bank", to: "island", priority: 0, gate: { q: "crossed", op: "==", v: true } }],
  roster: [],
  stagecraft: { lorebooks: ["Review Lore"] },
});

const wardenGate: { check: ((reply: { speaker: string; text: string }, facts: string[]) => Promise<{ facts: string[]; text: string } | null>) | null } = { check: null };
const wardenFacts = { current: [] as string[] };

function harness() {
  const engine = new StoryEngine();
  engine.loadStory(story());
  let state = createStagecraft();
  state.settings = { ...state.settings, curatorEnabled: true, acceptMode: "auto" };
  let content = "Original";
  let messageId = 10;
  // The chat this work belongs to. `switchChat` moves it, exactly as opening another chat does.
  let chatId = "chat-a";
  const context = (): RunContext => ({ chatId, storyId: "review-independent", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null });
  let disabled = false;
  (loadLorebook as jest.Mock).mockImplementation(async () => ({ entries: { 1: { uid: 1, comment: "Bridge", content, key: ["bridge"], disable: disabled } } }));
  (readWIEntry as jest.Mock).mockImplementation(async () => ({ content, keys: ["bridge"], constant: false, disabled, uid: 1 }));
  (upsertWIEntry as jest.Mock).mockImplementation(async (_book, _entry, text) => { content = text; return "updated"; });
  (enableWIEntry as jest.Mock).mockImplementation(async () => { disabled = false; return { ok: true, changed: true }; });
  (disableWIEntry as jest.Mock).mockImplementation(async () => { disabled = true; return { ok: true, changed: true }; });
  const coordinator = new StagecraftCoordinator({
    getStory: story,
    getState: () => ({ ...engine.serialize(), boundary: messageId, lastMessageId: messageId }),
    getStagecraft: () => state,
    setStagecraft: (next: typeof state) => { state = next; },
    getExtractionSettings: () => ({ profileId: "review" }) as never,
    getCanon: () => "",
    getOpenArcs: () => [],
    journal: () => {},
    persist: async () => {},
    notify: () => {},
    warden: { check: (reply: never, facts: never) => wardenGate.check!(reply, facts), facts: () => wardenFacts.current, nudgeActive: () => false },
    ownership: { mint: () => mintToken(context()), check: (token: RunToken) => tokenMatches(context(), token) },
  } as never);
  return {
    coordinator,
    get state() { return state; },
    get content() { return content; },
    next: () => { messageId += 1; },
    switchChat: () => {
      chatId = "chat-b";
      state = createStagecraft();
      state.settings = { ...state.settings, curatorEnabled: true, acceptMode: "auto" };
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  chatRef.current = [];
  wardenFacts.current = [];
  wardenGate.check = null;
});

control("a normal same-session curator write applies", async () => {
  const h = harness();
  (callExtractionModel as jest.Mock).mockResolvedValue("[rewrite] Bridge || First");
  await h.coordinator.runCuratorPass();
  await h.coordinator.applyAccepted();
  expect(h.content).toBe("First");
});

finding("R1", async () => {
  const h = harness();
  let release!: (value: string) => void;
  (callExtractionModel as jest.Mock).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = h.coordinator.runCuratorPass();
  await Promise.resolve();
  await Promise.resolve();
  h.switchChat();
  release("[rewrite] Bridge || Old chat fact");
  await pending;
  must(h.state.proposals.length === 0, `a curator result started in the previous chat was written into this chat (${h.state.proposals.length} proposal(s) landed)`);
});

finding("R2", async () => {
  const h = harness();
  for (const text of ["First", "Second"]) {
    (callExtractionModel as jest.Mock).mockResolvedValue(`[rewrite] Bridge || ${text}`);
    await h.coordinator.runCuratorPass();
    await h.coordinator.applyAccepted();
    h.next();
  }
  expect(h.content).toBe("Second");
  await h.coordinator.revertAppliedSince(10);
  must(h.content === "Original", `reverting two writes to one entry restored the intermediate text, not the original before-image (entry now reads "${h.content}")`);
});

finding("R3", async () => {
  const h = harness();
  (disableWIEntry as jest.Mock).mockResolvedValue({ ok: false, reason: "refused" });
  (callExtractionModel as jest.Mock).mockResolvedValue("[disable] Bridge");
  await h.coordinator.runCuratorPass();
  const applied = await h.coordinator.applyAccepted();
  must(applied === 0 && h.state.proposals[0].ops[0].status === "failed", `a host write that returned false was counted as applied (applied=${applied}, status=${h.state.proposals[0].ops[0].status})`);
});


control("R3, the OTHER host path: a failed upsert is not counted as applied either", async () => {
  // R3 says "a false host result must not be reported as applied". Its reproduction covers only
  // the disable path. A mutation treating an upsert failure as success SURVIVED on 2026-09-20 —
  // the code was right, nothing held it, and a refactor could have removed it silently.
  const h = harness();
  (upsertWIEntry as jest.Mock).mockResolvedValue("failed");
  (callExtractionModel as jest.Mock).mockResolvedValue("[rewrite] Bridge || The bridge is out.");
  await h.coordinator.runCuratorPass();
  const applied = await h.coordinator.applyAccepted();
  expect(applied).toBe(0);
  expect(h.state.proposals[0].ops[0].status).toBe("failed");
});

// --- v2.3 plan 03: the discard has to be precise, or it becomes a new way to lose work. ---

control("a discarded result names which part of the world moved", async () => {
  const h = harness();
  let release!: (value: string) => void;
  (callExtractionModel as jest.Mock).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = h.coordinator.runCuratorPass();
  await Promise.resolve();
  await Promise.resolve();
  h.switchChat();
  release("[rewrite] Bridge || Old chat fact");
  const outcome = await pending;
  expect(outcome).toMatchObject({ ran: true, record: null, discarded: "chat" });
});

control("a discarded result writes nothing into the chat it landed in, not even an error", async () => {
  // Writing `lastError` after a switch marks the wrong chat's panel with a failure it never had.
  const h = harness();
  let reject!: (error: Error) => void;
  (callExtractionModel as jest.Mock).mockImplementation(() => new Promise((_resolve, no) => { reject = no; }));
  const pending = h.coordinator.runCuratorPass();
  await Promise.resolve();
  await Promise.resolve();
  h.switchChat();
  reject(new Error("the model call failed after the switch"));
  const outcome = await pending;
  expect(outcome).toMatchObject({ ran: true, discarded: "chat" });
  expect(h.state.lastError).toBeNull();
  expect(h.state.proposals).toHaveLength(0);
});

control("a pass that stays in its own chat is never discarded", async () => {
  // The failure mode of an ownership check is refusing everything; the same-chat path must survive
  // an await that takes real time.
  const h = harness();
  let release!: (value: string) => void;
  (callExtractionModel as jest.Mock).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  const pending = h.coordinator.runCuratorPass();
  await Promise.resolve();
  await Promise.resolve();
  release("[rewrite] Bridge || Same chat fact");
  const outcome = await pending;
  expect(outcome.discarded).toBeUndefined();
  expect(h.state.proposals).toHaveLength(1);
});

// --- the accepted-op write path reaches a real, shared lorebook file (2026-09-21) ---
//
// R1 closed the pass that PROPOSES. These are the two paths that WRITE: `applyAccepted` runs at a
// boundary commit, and `revertAppliedSince` runs on a rollback. Both edit a lorebook file that
// every chat using that book reads, so a stale write is not "recorded in the wrong chat" — it
// changes a file another story is reading.

const acceptedRecord = (id: string, messageId: number, content: string) => ({
  id,
  curator: "wi" as const,
  at: new Date().toISOString(),
  boundary: messageId,
  messageId,
  checkpointId: "bank",
  reason: "test",
  summary: content,
  mode: "auto" as const,
  dropped: [],
  ops: [{ op: { kind: "rewrite" as const, lorebook: "Review Lore", comment: "Bridge", text: content }, status: "accepted" as const }],
});

control("accepted ops reach their own world's lorebook", async () => {
  const h = harness();
  h.state.proposals = [acceptedRecord("p1", 10, "First")] as never;
  const applied = await h.coordinator.applyAccepted();

  expect(applied).toBe(1);
  expect(h.content).toBe("First");
});

control("a world lost during an accepted write stops the ops behind it", async () => {
  // Two accepted ops, switched after the first host write. The second must not reach the book.
  const h = harness();
  h.state.proposals = [acceptedRecord("p1", 10, "First"), acceptedRecord("p2", 11, "Second")] as never;
  let writes = 0;
  (upsertWIEntry as jest.Mock).mockImplementation(async (_book, _entry, text) => {
    writes += 1;
    h.switchChat();
    (upsertWIEntry as jest.Mock).mockImplementation(async () => { writes += 1; return "updated"; });
    return "updated";
  });
  const applied = await h.coordinator.applyAccepted();

  expect((upsertWIEntry as jest.Mock).mock.calls.length).toBe(1);
  expect(applied).toBe(1);
});

control("a rollback in its own world restores every applied write", async () => {
  const h = harness();
  h.state.proposals = [
    { ...acceptedRecord("p1", 10, "First"), appliedAt: new Date().toISOString(), ops: [{ ...acceptedRecord("p1", 10, "First").ops[0], status: "applied", before: { content: "Original", disabled: false } }] },
    { ...acceptedRecord("p2", 11, "Second"), appliedAt: new Date().toISOString(), ops: [{ ...acceptedRecord("p2", 11, "Second").ops[0], status: "applied", before: { content: "Second-before", disabled: false } }] },
  ] as never;
  const reverted = await h.coordinator.revertAppliedSince(10);

  expect(reverted).toBe(2);
});

describe("V10: a revert that could not finish keeps what it needs to retry", () => {
  const applied = (content: string, before: string) => ({ ...acceptedRecord("x", 10, content).ops[0], status: "applied" as const, before: { content: before, disabled: false } });

  it("a record whose other op reverted keeps its revert-failed op and that op's before-image", async () => {
    const h = harness();
    (upsertWIEntry as jest.Mock).mockImplementation(async (_book: string, _entry: string, text: string) => (text === "Unwritable" ? "failed" : "updated"));
    h.state.proposals = [{ ...acceptedRecord("p1", 10, "Two"), appliedAt: new Date().toISOString(), ops: [applied("One", "Unwritable"), applied("Two", "Original")] }] as never;
    const reverted = await h.coordinator.revertAppliedSince(10);
    expect(reverted).toBe(1);
    const record = h.state.proposals.find((proposal) => proposal.id === "p1");
    expect(record).toBeDefined();
    expect(record!.ops).toHaveLength(1);
    expect(record!.ops[0]).toMatchObject({ status: "revert-failed", before: { content: "Unwritable" } });
  });

  it("an externally edited op stays visible instead of vanishing with its record", async () => {
    const h = harness();
    h.state.proposals = [{ ...acceptedRecord("p1", 10, "Mine"), appliedAt: new Date().toISOString(), ops: [{ ...applied("Mine", "Original"), after: { content: "Mine", disabled: false } }] }] as never;
    await h.coordinator.revertAppliedSince(10);
    expect(h.state.proposals.find((proposal) => proposal.id === "p1")?.ops[0]).toMatchObject({ status: "externally-edited" });
  });

  it("kept ops keep their declared order", async () => {
    const h = harness();
    const lapsed = (content: string) => ({ ...acceptedRecord("x", 10, content).ops[0], status: "rejected" as const });
    h.state.proposals = [{ ...acceptedRecord("p1", 10, "c"), appliedAt: new Date().toISOString(), ops: [lapsed("a"), lapsed("b"), applied("c", "Original"), { ...applied("d", "Unwritable") }] }] as never;
    (upsertWIEntry as jest.Mock).mockImplementation(async (_book: string, _entry: string, text: string) => (text === "Unwritable" ? "failed" : "updated"));
    await h.coordinator.revertAppliedSince(10);
    const ops = h.state.proposals.find((proposal) => proposal.id === "p1")!.ops.map((entry) => (entry.op as { text: string }).text);
    expect(ops).toEqual(["a", "b", "d"]);
  });

  it("control: a record whose every write reverted is removed", async () => {
    const h = harness();
    h.state.proposals = [{ ...acceptedRecord("p1", 10, "One"), appliedAt: new Date().toISOString(), ops: [applied("One", "Original")] }] as never;
    expect(await h.coordinator.revertAppliedSince(10)).toBe(1);
    expect(h.state.proposals.find((proposal) => proposal.id === "p1")).toBeUndefined();
  });
});

control("a rollback that outlives its world stops restoring pre-write content", async () => {
  const h = harness();
  h.state.proposals = [
    { ...acceptedRecord("p1", 10, "First"), appliedAt: new Date().toISOString(), ops: [{ ...acceptedRecord("p1", 10, "First").ops[0], status: "applied", before: { content: "Original", disabled: false } }] },
    { ...acceptedRecord("p2", 11, "Second"), appliedAt: new Date().toISOString(), ops: [{ ...acceptedRecord("p2", 11, "Second").ops[0], status: "applied", before: { content: "Second-before", disabled: false } }] },
  ] as never;
  (upsertWIEntry as jest.Mock).mockImplementation(async () => { h.switchChat(); return "updated"; });
  const reverted = await h.coordinator.revertAppliedSince(10);

  expect((upsertWIEntry as jest.Mock).mock.calls.length).toBe(1);
  expect(reverted).toBe(1);
});

control("a world lost during the LAST accepted write does not file the result here", async () => {
  // Nothing follows the last op in the loop, so this is the case the per-op check cannot reach:
  // without a check after the loop, the old chat's proposal records are patched into the new chat.
  const h = harness();
  h.state.proposals = [acceptedRecord("p1", 10, "First")] as never;
  (upsertWIEntry as jest.Mock).mockImplementation(async () => { h.switchChat(); return "updated"; });
  await h.coordinator.applyAccepted();

  expect(h.state.proposals).toEqual([]);
});

control("a warden note whose world moved is not recorded", async () => {
  // The reply-text comparison already catches an edit. It does not catch a chat switch that lands on
  // a message with the same index and the same text — and a note filed in the wrong chat is injected
  // into that chat's next prompt.
  const h = harness();
  h.state.settings = { ...h.state.settings, wardenEnabled: true, wardenAcceptMode: "review" };
  chatRef.current = [{ name: "Corin", mes: "The gate is open." }];
  wardenFacts.current = ["Corin owes a debt"];
  let release!: (value: { facts: string[]; text: string }) => void;
  wardenGate.check = () => new Promise((resolve) => { release = resolve; });

  const pending = h.coordinator.runWardenPass(0);
  await Promise.resolve();
  h.switchChat();
  release({ facts: ["Corin owes a debt"], text: "Corin said the gate was open." });
  const recorded = await pending;

  expect(recorded).toBe(false);
  expect(h.state.proposals).toEqual([]);
});

control("a warden note in its own world is recorded", async () => {
  const h = harness();
  h.state.settings = { ...h.state.settings, wardenEnabled: true, wardenAcceptMode: "review" };
  chatRef.current = [{ name: "Corin", mes: "The gate is open." }];
  wardenFacts.current = ["Corin owes a debt"];
  wardenGate.check = async () => ({ facts: ["Corin owes a debt"], text: "Corin said the gate was open." });

  const recorded = await h.coordinator.runWardenPass(0);

  expect(recorded).toBe(true);
  expect(h.state.proposals).toHaveLength(1);
});

describe("V3: a curator pass holds the coordinator only while its own chat is open", () => {
  it("a slow pass started in another chat does not block this chat's pass", async () => {
    const h = harness();
    let release!: (value: string) => void;
    (callExtractionModel as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const slow = h.coordinator.runCuratorPass();
    await Promise.resolve();
    await Promise.resolve();
    h.switchChat();
    (callExtractionModel as jest.Mock).mockResolvedValueOnce("[rewrite] Bridge || New chat fact");
    const here = await h.coordinator.runCuratorPass();
    expect(here.skipped).toBeUndefined();
    expect(here.ran).toBe(true);
    release("[rewrite] Bridge || Old chat fact");
    expect((await slow).discarded).toBeDefined();
  });

  it("control: a second pass in the SAME chat still waits for the first", async () => {
    const h = harness();
    let release!: (value: string) => void;
    (callExtractionModel as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const slow = h.coordinator.runCuratorPass();
    await Promise.resolve();
    await Promise.resolve();
    expect((await h.coordinator.runCuratorPass()).skipped).toBe("in-flight");
    expect(h.coordinator.dueForRun()).toBe(false);
    release("[rewrite] Bridge || Same chat");
    await slow;
  });

  it("the old pass finishing does not release the NEW pass's hold", async () => {
    const h = harness();
    let releaseOld!: (value: string) => void;
    let releaseNew!: (value: string) => void;
    (callExtractionModel as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve; }));
    const old = h.coordinator.runCuratorPass();
    await Promise.resolve();
    await Promise.resolve();
    h.switchChat();
    (callExtractionModel as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { releaseNew = resolve; }));
    const current = h.coordinator.runCuratorPass();
    await Promise.resolve();
    await Promise.resolve();
    releaseOld("[rewrite] Bridge || Old");
    await old;
    expect((await h.coordinator.runCuratorPass()).skipped).toBe("in-flight");
    releaseNew("[rewrite] Bridge || New");
    await current;
  });
});
