import type { TalkControl } from "@engine/index";
import { resolveTalkPolicy, speechRows } from "@talk/index";
import { TalkController, type TalkControlHost } from "./talkControl";
import { SpeechBudget } from "./speechBudget";
import type { SpeechEvent } from "./speechLedger";
import type { ChainEnd } from "./chainEnds";
import { EmptyReplyRecovery, isThoughtOnlyReply } from "./emptyReply";
import { testOwnership } from "../../test/findings/testOwnership";

const SYSTEM = { enabled: true, max: 3, stopOnTransition: true, holdExtraction: false };
const ROSTER = [{ id: "guard", name: "Mara" }, { id: "sage", name: "Finn" }, { id: "dm", name: "Narrator" }];
const BY_NAME: Record<string, string> = { Mara: "guard", Finn: "sage", Narrator: "dm" };
type Row = { name: string; mes: string; is_user: boolean; extra?: { reasoning?: string } };

const makeHost = (control: TalkControl, picks: Array<string | null>, options: { renders?: boolean } = {}) => {
  const calls = { triggered: [] as string[], ends: [] as ChainEnd[] };
  let chat: Row[] = [{ name: "Rook", mes: "We should find shelter.", is_user: true }];
  let events: SpeechEvent[] = [];
  let judged = 0;
  const policy = resolveTalkPolicy({ control, chainMax: 3, activeReplies: false });
  const budget = new SpeechBudget({ chat: () => chat, chatId: () => "chat-1", events: () => events, setEvents: (next) => { events = next; }, policy: () => policy, persist: () => undefined });
  const lastSpeaker = () => { const row = [...chat].reverse().find((entry) => !entry.is_user); return row ? BY_NAME[row.name] ?? null : null; };
  const host: TalkControlHost = {
    ownership: testOwnership(),
    isGroupChat: () => true,
    getChatId: () => "chat-1",
    getActiveTalkControl: () => control,
    getRoster: () => ROSTER,
    getEnabledRosterIds: () => ROSTER.map((member) => member.id),
    getLastSpeakerRosterId: lastSpeaker,
    getDraftedRosterId: () => "guard",
    getLastMessageId: () => chat.length - 1,
    getWindow: () => chat.slice(-8).map((row) => ({ speaker: row.name, text: row.mes, isUser: row.is_user })),
    getCheckpointInfo: () => ({ id: "cp1", name: "Gate", objective: "Open it", storyTitle: "Ruins" }),
    getPlayerName: () => "Rook",
    callDirector: async () => "SPEAKER: Finn",
    judgeDirector: async () => {
      const name = picks[judged];
      judged += 1;
      return name ? { kind: "member", rosterId: BY_NAME[name], name, confidence: 0.9, via: "choice" } : { kind: "player", confidence: 0.9, via: "choice" };
    },
    triggerMember: async (name) => { calls.triggered.push(name); },
    recordDecision: () => undefined,
    recordChainEnd: (end) => { calls.ends.push(end); },
    replyEmpty: (messageId) => isThoughtOnlyReply(chat[messageId]),
    getChainConfig: () => SYSTEM,
    getTalkPolicy: () => policy,
    getSpeechRows: () => speechRows(chat),
    getEntryStart: () => 0,
    getEntryKey: () => "cp1@0",
    reserveSpeech: (request) => budget.reserve(request),
    settleSpeech: (reservation, messageId) => budget.settle(reservation, messageId),
    speechYielded: () => budget.yieldPending(),
    consequence: () => null,
    causeHandled: (cause) => budget.causeHandled(cause),
    lastAddressAt: () => budget.lastAddressAt(),
  };
  const controller = new TalkController(host);
  const post = (name: string, type: string, mes = `"${name} says something about the road."`, reasoning?: string) => {
    chat = [...chat, { name, mes, is_user: false, ...(reasoning ? { extra: { reasoning } } : {}) }];
    if (options.renders !== false) controller.onReplyRendered(chat.length - 1, type);
  };
  const entry = (name: string) => {
    post(name, "command", `*${name} steps in from the rain.*`);
    budget.recordEntry(name, chat.length - 1, false, "cp1@0");
  };
  const open = async () => {
    await controller.ready;
    controller.onWrapperStarted({ type: "normal" });
    await controller.intercept(() => undefined, "normal");
  };
  const next = () => {
    controller.onWrapperStarted({ type: "normal" });
    controller.onGenerationStarted({ force_chid: 1 }, "normal");
  };
  return { controller, calls, post, entry, open, next, events: () => events, chat: () => chat };
};

const rows = (events: SpeechEvent[]) => events.map((event) => `${event.origin}:${event.member}:${event.messageId}`);

describe("v3.0 19 fix C3: a chain voice's speech row names the message that voice rendered", () => {
  it("an entry line by another member posted in the same send does not null the first voice's row", async () => {
    const made = makeHost({ director: true }, ["Mara", "Finn", null]);
    await made.open();
    made.post("Mara", "normal");
    made.entry("Narrator");
    await made.controller.onWrapperFinished();
    expect(rows(made.events())).toEqual(["entry:Narrator:2", "chain:Mara:1"]);
    expect(made.calls.triggered).toEqual(["Finn"]);
    made.next();
    made.post("Finn", "normal");
    await made.controller.onWrapperFinished();
    expect(rows(made.events())).toEqual(["entry:Narrator:2", "chain:Mara:1", "chain:Finn:3"]);
  });

  it("an entry line by the same member does not take the voice's row", async () => {
    const made = makeHost({ director: true, lead: "Narrator" }, ["Mara", null]);
    await made.open();
    made.post("Mara", "normal");
    made.entry("Mara");
    await made.controller.onWrapperFinished();
    expect(rows(made.events())).toEqual(["entry:Mara:2", "chain:Mara:1"]);
  });

  it("control: a host that reports no render keeps the last-message reading", async () => {
    const plain = makeHost({ director: true }, ["Mara", null], { renders: false });
    await plain.open();
    plain.post("Mara", "normal");
    await plain.controller.onWrapperFinished();
    expect(rows(plain.events())).toEqual(["chain:Mara:1"]);
    const entered = makeHost({ director: true }, ["Mara", null], { renders: false });
    await entered.open();
    entered.post("Mara", "normal");
    entered.entry("Narrator");
    await entered.controller.onWrapperFinished();
    expect(rows(entered.events())).toEqual(["entry:Narrator:2", "chain:Mara:null"]);
  });
});

describe("v3.0 19 fix C2: a thought-only chain voice ends the chain so the one retry can reach it", () => {
  const thought = "The road is long and I should consider what the guard knows before I answer anything at all.";

  it("an empty first voice ends the chain as empty: no next voice, and the recovery swipes it once", async () => {
    const made = makeHost({ director: true }, ["Mara", "Finn", "Narrator"]);
    await made.open();
    made.post("Mara", "normal", "", thought);
    await made.controller.onWrapperFinished();
    expect(made.calls.ends.map((end) => [end.reason, end.voices])).toEqual([["empty", 1]]);
    expect(made.calls.triggered).toEqual([]);
    const asked: number[] = [];
    const recovery = new EmptyReplyRecovery({
      storyChat: () => "chat-1", openChat: () => "chat-1", row: (id) => made.chat()[id], chatLength: () => made.chat().length,
      busy: () => made.controller.chainPending(), askAgain: async (id) => { asked.push(id); return { ok: true }; },
      ownership: () => testOwnership(), journal: () => undefined, wait: async () => undefined,
    });
    expect(await recovery.observe(1, "normal")).toBe("asked-again");
    expect(asked).toEqual([1]);
  });

  it("an empty second voice ends it too, after counting it", async () => {
    const made = makeHost({ director: true }, ["Mara", "Finn", "Narrator"]);
    await made.open();
    made.post("Mara", "normal");
    await made.controller.onWrapperFinished();
    made.next();
    made.post("Finn", "normal", "<think></think>", thought);
    await made.controller.onWrapperFinished();
    expect(made.calls.ends.map((end) => [end.reason, end.voices])).toEqual([["empty", 2]]);
    expect(made.calls.triggered).toEqual(["Finn"]);
  });

  it("control: a voice with text keeps the chain going", async () => {
    const made = makeHost({ director: true }, ["Mara", "Finn", null]);
    await made.open();
    made.post("Mara", "normal");
    await made.controller.onWrapperFinished();
    expect(made.calls.ends).toEqual([]);
    expect(made.calls.triggered).toEqual(["Finn"]);
  });
});
