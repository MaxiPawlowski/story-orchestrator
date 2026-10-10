import {
  EMPTY_REPLY_ASKED, EMPTY_REPLY_LEFT, EMPTY_REPLY_NOT_ASKED, EMPTY_REPLY_PLAYER_TEXT, EmptyReplyRecovery, isThoughtOnlyReply, residueTags, settledOnReply, thoughtOnlyMessageIds, visibleReplyText,
  type EmptyReplyDeps,
} from "./emptyReply";
import { composeInlineTimeline, type InlineSources } from "./inlineTimeline";
import { couldNot, wrote } from "@utils/writeResult";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";

const ownershipOf = (context: RunContext): RunOwnership => ({ mint: (window) => mintToken({ ...context }, window ?? null), check: (token) => tokenMatches({ ...context }, token) });

const thought = (extra: Record<string, unknown> = {}) => ({ name: "Kayla", is_user: false, mes: "", swipe_id: 0, swipes: [""], extra: { reasoning: "I should answer the guard, then" }, ...extra });

describe("isThoughtOnlyReply", () => {
  it("is a non-user reply with no visible text and a thought", () => {
    expect(isThoughtOnlyReply(thought())).toBe(true);
    expect(isThoughtOnlyReply(thought({ mes: "  \n" }))).toBe(true);
  });

  it("counts reasoning template residue as no visible text", () => {
    expect(isThoughtOnlyReply(thought({ mes: "<channel|>" }))).toBe(true);
    expect(isThoughtOnlyReply({ is_user: false, mes: "<|channel>thought\n<channel|>", extra: {} })).toBe(true);
    expect(visibleReplyText("<|channel>thought<channel|> Hi.")).toBe("Hi.");
  });

  it("takes the install's own template tags", () => {
    expect(isThoughtOnlyReply({ is_user: false, mes: "[[/plan]]", extra: {} })).toBe(false);
    expect(isThoughtOnlyReply({ is_user: false, mes: "[[/plan]]", extra: {} }, residueTags(["[[plan]]\n", "[[/plan]]"]))).toBe(true);
  });

  it("never matches a reply with visible text, a player message, a system note or a plain empty reply", () => {
    expect(isThoughtOnlyReply(thought({ mes: "Kayla shrugs." }))).toBe(false);
    expect(isThoughtOnlyReply(thought({ is_user: true }))).toBe(false);
    expect(isThoughtOnlyReply(thought({ is_system: true }))).toBe(false);
    expect(isThoughtOnlyReply({ is_user: false, mes: "", extra: {} })).toBe(false);
    expect(isThoughtOnlyReply(null)).toBe(false);
  });

  it("lists the empty replies of a chat", () => {
    expect(thoughtOnlyMessageIds([{ is_user: true, mes: "hi" }, thought(), thought({ mes: "Hello." })])).toEqual([1]);
  });
});

interface Harness {
  deps: EmptyReplyDeps;
  chat: unknown[];
  asked: number[];
  journal: Array<[string, string]>;
  context: RunContext;
  setBusy: (busy: boolean) => void;
  setStoryChat: (chat: string | null) => void;
}

const harness = (chat: unknown[], over: Partial<EmptyReplyDeps> = {}): Harness => {
  let busy = false;
  let storyChat: string | null = "chat-a";
  let clock = 0;
  const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h", sessionEpoch: 1, windowRevision: 0 };
  const asked: number[] = [];
  const journal: Array<[string, string]> = [];
  const deps: EmptyReplyDeps = {
    storyChat: () => storyChat,
    openChat: () => context.chatId,
    row: (messageId) => chat[messageId],
    chatLength: () => chat.length,
    busy: () => busy,
    askAgain: async (messageId) => {
      asked.push(messageId);
      return wrote();
    },
    ownership: () => ownershipOf(context),
    journal: (summary, note) => journal.push([summary, note]),
    wait: async (ms) => { clock += ms; },
    now: () => clock,
    ...over,
  };
  return { deps, chat, asked, journal, context, setBusy: (value) => { busy = value; }, setStoryChat: (value) => { storyChat = value; } };
};

describe("EmptyReplyRecovery", () => {
  it("asks a story chat's empty last reply again exactly once and journals it once", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    const recovery = new EmptyReplyRecovery(h.deps);

    await expect(recovery.observe(1, "normal")).resolves.toBe("asked-again");
    await recovery.observe(1, "normal");

    expect(h.asked).toEqual([1]);
    expect(h.journal.map(([summary]) => summary)).toEqual([EMPTY_REPLY_ASKED]);
    expect(h.journal[0][1]).toContain("message 1 (Kayla)");
    expect(recovery.records().map((record) => record.outcome)).toEqual(["asked-again"]);
  });

  it("never asks a second time: the swiped-in reply coming back empty too is left, journaled once", async () => {
    const row = thought();
    const h = harness([{ is_user: true, mes: "hello" }, row]);
    const recovery = new EmptyReplyRecovery(h.deps);
    await recovery.observe(1, "normal");
    row.swipe_id = 1;
    row.swipes = ["", ""];

    await expect(recovery.observe(1, "swipe")).resolves.toBe("left");
    await expect(recovery.observe(1, "swipe")).resolves.toBeNull();
    row.swipe_id = 2;
    await expect(recovery.observe(1, "swipe")).resolves.toBeNull();

    expect(h.asked).toEqual([1]);
    expect(h.journal.map(([summary]) => summary)).toEqual([EMPTY_REPLY_ASKED, EMPTY_REPLY_LEFT]);
  });

  it("waits for SillyTavern to go idle before it asks", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    h.setBusy(true);
    let polls = 0;
    const recovery = new EmptyReplyRecovery({ ...h.deps, wait: async () => { polls += 1; if (polls === 4) h.setBusy(false); } });

    await recovery.observe(1, "normal");

    expect(polls).toBe(4);
    expect(h.asked).toEqual([1]);
  });

  it.each([
    ["a reply with visible text", [{ is_user: true, mes: "hi" }, thought({ mes: "Kayla nods." })], "normal"],
    ["a player message", [{ is_user: true, mes: "", extra: { reasoning: "x" } }], "normal"],
    ["a plain empty reply with no thought (backend down)", [{ is_user: true, mes: "hi" }, { is_user: false, mes: "", extra: {} }], "normal"],
    ["a /sendas post", [{ is_user: true, mes: "hi" }, thought()], "command"],
    ["a greeting", [thought()], "first_message"],
    ["an untyped emitter", [{ is_user: true, mes: "hi" }, thought()], undefined],
  ])("never fires for %s", async (_label, chat, type) => {
    const h = harness(chat as unknown[]);
    const recovery = new EmptyReplyRecovery(h.deps);

    await expect(recovery.observe(chat.length - 1, type)).resolves.toBeNull();

    expect(h.asked).toEqual([]);
    expect(h.journal).toEqual([]);
  });

  it("never fires in a chat that does not play a story", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    h.setStoryChat(null);
    const recovery = new EmptyReplyRecovery(h.deps);
    await expect(recovery.observe(1, "normal")).resolves.toBeNull();
    h.setStoryChat("another-chat");
    await expect(recovery.observe(1, "normal")).resolves.toBeNull();

    expect(h.asked).toEqual([]);
    expect(h.journal).toEqual([]);
  });

  it("drops the recovery without a write when the chat switches while it waits", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    h.setBusy(true);
    const recovery = new EmptyReplyRecovery({ ...h.deps, wait: async () => { h.context.chatId = "chat-b"; h.context.sessionEpoch = 2; } });

    await expect(recovery.observe(1, "normal")).resolves.toBe("lapsed");

    expect(h.asked).toEqual([]);
    expect(h.journal).toEqual([]);
  });

  it("drops it when the player swipes or edits first (the window revision moves)", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    h.setBusy(true);
    const recovery = new EmptyReplyRecovery({ ...h.deps, wait: async () => { h.context.windowRevision = 1; } });

    await expect(recovery.observe(1, "normal")).resolves.toBe("lapsed");
    expect(h.asked).toEqual([]);
  });

  it("does not ask again when another reply followed it, and says so once", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    h.setBusy(true);
    const recovery = new EmptyReplyRecovery({ ...h.deps, wait: async () => { if (h.chat.length === 2) h.chat.push({ is_user: false, mes: "Arin answers." }); h.setBusy(false); } });

    await expect(recovery.observe(1, "normal")).resolves.toBe("not-asked");

    expect(h.asked).toEqual([]);
    expect(h.journal.map(([summary]) => summary)).toEqual([EMPTY_REPLY_NOT_ASKED]);
  });

  it("says when SillyTavern refuses the swipe", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()], { askAgain: async () => couldNot("SillyTavern does not allow a swipe right now") });
    const recovery = new EmptyReplyRecovery(h.deps);

    await expect(recovery.observe(1, "normal")).resolves.toBe("could-not");

    expect(h.journal.map(([summary]) => summary)).toEqual([EMPTY_REPLY_ASKED, EMPTY_REPLY_NOT_ASKED]);
    expect(h.journal[1][1]).toContain("does not allow a swipe");
  });

  it("is pending while it waits, so a harness can tell its own swipe apart", async () => {
    const h = harness([{ is_user: true, mes: "hello" }, thought()]);
    let release: () => void = () => undefined;
    const recovery = new EmptyReplyRecovery({ ...h.deps, wait: () => new Promise<void>((resolve) => { release = resolve; }) });

    const running = recovery.observe(1, "normal");
    expect(recovery.pending()).toBe(true);
    release();
    await running;
    expect(recovery.pending()).toBe(false);
  });

  it("stays pending through the swipe's own generation", async () => {
    let finish: () => void = () => undefined;
    const h = harness([{ is_user: true, mes: "hello" }, thought()], { askAgain: () => new Promise((resolve) => { finish = () => resolve(wrote()); }) });
    const recovery = new EmptyReplyRecovery(h.deps);

    const running = recovery.observe(1, "normal");
    await Promise.resolve();
    await Promise.resolve();
    expect(recovery.pending()).toBe(true);
    finish();
    await expect(running).resolves.toBe("asked-again");
    expect(recovery.pending()).toBe(false);
  });
});

describe("the player's note on an empty reply", () => {
  const sources = (emptyReplies: number[]): InlineSources => ({
    story: null, settings: { level: 1, window: 20, categories: {} } as unknown as InlineSources["settings"], authorView: false, chatLength: 3, boundaryLog: [], audits: [], pending: [], reconciliation: [],
    memory: { entries: [], arcs: [], derived: [], conflicts: [], verifyDrops: [] }, loreFired: [], talkDecisions: [], judgeCalls: [], proposals: [], curatorPass: null, effects: [],
    tensionHistory: [], tension: { expected: null, hint: null }, payloadCaptures: [], pipeline: { state: "idle", text: "" } as InlineSources["pipeline"], agencyRecovery: false,
    lastRollback: null, saveNotice: null, emptyReplies,
  });

  it("anchors one plain player line under the empty reply", () => {
    const view = composeInlineTimeline(sources([1]));
    expect(view.byMessage[1]).toEqual([expect.objectContaining({ category: "health", persona: "player", text: EMPTY_REPLY_PLAYER_TEXT })]);
    expect(composeInlineTimeline(sources([])).byMessage[1]).toBeUndefined();
  });
});

describe("settledOnReply (F8: the warden's rendered reply)", () => {
  const chat = [{ is_user: true, mes: "Hello." }, thought(), { name: "Kayla", is_user: false, mes: "Hi.", extra: {} }];

  it("a thought-only reply does not settle the warden's note as rendered", () => {
    expect(settledOnReply(true, 1, chat)).toBe(false);
    expect(settledOnReply(true, 1, [chat[0], thought({ mes: "<channel|>" })])).toBe(false);
  });

  it("a reply with visible text still settles it, and a reply-less close never does", () => {
    expect(settledOnReply(true, 2, chat)).toBe(true);
    expect(settledOnReply(false, 2, chat)).toBe(false);
    expect(settledOnReply(true, undefined, chat)).toBe(true);
  });
});
