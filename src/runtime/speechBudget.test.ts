import { resolveTalkPolicy, type TalkPolicy } from "@talk/index";
import { SpeechBudget } from "./speechBudget";
import { recordSpeechEvent, rewindSpeech, sanitizeSpeech, type SpeechEvent, type SpeechRequest } from "./speechLedger";

const request = (member: string, patch: Partial<SpeechRequest> = {}): SpeechRequest => ({
  origin: "npc", member, generated: true, source: { messageId: 0, revision: null }, entry: "cp@0", recipient: "scene", instruction: null, yieldAfter: false, ...patch,
});

const setup = (policy: TalkPolicy | null, initial: Array<Record<string, unknown>>) => {
  let chat = [...initial];
  let chatId = "chat-a";
  let events: SpeechEvent[] = [];
  const notes: string[] = [];
  const budget = new SpeechBudget({
    chat: () => chat, chatId: () => chatId, events: () => events, setEvents: (next) => { events = next; }, policy: () => policy, persist: () => undefined,
    journal: (summary) => notes.push(summary),
  });
  return {
    budget, notes, events: () => events,
    post: (name: string, mes = "line") => { chat = [...chat, { name, mes }]; return chat.length - 1; },
    switchChat: () => { chatId = "chat-b"; },
  };
};

const TWO = resolveTalkPolicy({ control: { budget: { voices: 2, attempts: 3 } }, chainMax: 3, activeReplies: false });

describe("v3.0 19 stage 2: the shared speech budget", () => {
  it("counts the first reply, refuses the voice past the budget and journals why", () => {
    const made = setup(TWO, [{ name: "Rook", mes: "Go.", is_user: true }]);
    made.post("Narrator");
    const first = made.budget.reserve(request("Mara"));
    expect(first).not.toBeNull();
    expect(made.budget.reserve(request("Finn"))).toBeNull();
    expect(made.notes).toEqual(["Finn's npc line was held by the speech budget"]);
    made.budget.settle(first, made.post("Mara"));
    expect(made.budget.usage()).toMatchObject({ voices: 2, attempts: 2 });
  });

  it("an entering line does not draw on the budget; a scripted line costs a voice, not a generation; a failed generation costs one", () => {
    const made = setup(TWO, [{ name: "Rook", mes: "Go.", is_user: true }]);
    made.budget.recordEntry("Narrator", made.post("Narrator"), false, "cp@3");
    expect(made.budget.usage()).toMatchObject({ voices: 0, attempts: 0 });
    const scripted = made.budget.reserve(request("Mara", { generated: false }));
    made.budget.settle(scripted, made.post("Mara"));
    expect(made.budget.usage()).toMatchObject({ voices: 1, attempts: 0 });
    const failed = made.budget.reserve(request("Finn"));
    made.budget.settle(failed, null);
    expect(made.budget.usage()).toMatchObject({ voices: 1, attempts: 1 });
    expect(made.events().map((event) => [event.origin, event.messageId, event.generated])).toEqual([["entry", 1, false], ["npc", 2, false], ["npc", null, true]]);
  });

  it("generations run out before voices when attempts are tighter", () => {
    const made = setup(resolveTalkPolicy({ control: { budget: { voices: 3, attempts: 3 } }, chainMax: 3, activeReplies: false }), [{ name: "Rook", mes: "Go.", is_user: true }]);
    made.post("Narrator");
    made.budget.settle(made.budget.reserve(request("Finn")), null);
    made.budget.settle(made.budget.reserve(request("Finn")), null);
    expect(made.budget.usage()).toMatchObject({ voices: 1, attempts: 3 });
    expect(made.budget.reserve(request("Mara"))).toBeNull();
    expect(made.budget.reserve(request("Mara", { generated: false }))).not.toBeNull();
  });

  it("without a budget nothing is refused but every request is recorded; before any player line nothing is refused either", () => {
    const made = setup(null, [{ name: "Rook", mes: "Go.", is_user: true }]);
    for (let index = 0; index < 5; index += 1) made.budget.settle(made.budget.reserve(request("Mara")), made.post("Mara"));
    expect(made.events()).toHaveLength(5);
    const opening = setup(TWO, []);
    expect(opening.budget.reserve(request("Mara"))).not.toBeNull();
    expect(opening.budget.reserve(request("Finn"))).not.toBeNull();
    expect(opening.budget.reserve(request("Narrator"))).not.toBeNull();
  });

  it("a yield-after line that is the newest reply hands the turn to the player; a later reply clears it", () => {
    const made = setup(TWO, [{ name: "Rook", mes: "Go.", is_user: true }]);
    made.budget.settle(made.budget.reserve(request("Mara", { yieldAfter: true, recipient: "player" })), made.post("Mara", '"Rook, ready?"'));
    expect(made.budget.yieldPending()).toBe(true);
    made.post("Finn");
    expect(made.budget.yieldPending()).toBe(false);
  });

  it("a reservation settled after the chat changed records nothing", () => {
    const made = setup(TWO, [{ name: "Rook", mes: "Go.", is_user: true }]);
    const held = made.budget.reserve(request("Mara"));
    made.switchChat();
    made.budget.settle(held, 1);
    expect(made.events()).toEqual([]);
  });
});

describe("v3.0 19 stage 2: the speech record rolls back with the chat", () => {
  const event = (send: number, at: number, messageId: number | null): SpeechEvent => ({
    send, at, messageId, origin: "chain", member: "Mara", generated: true, entry: "cp@0", recipient: "scene", instructed: false, yieldAfter: false,
  });
  const ledger = [event(0, 1, 2), event(0, 2, 3), event(4, 5, 6), event(4, 6, null)];

  it("a rollback without a mutation drops every row at or after the message, which is what a replay would have written", () => {
    expect(rewindSpeech(ledger, 3)).toEqual([event(0, 1, 2)]);
    expect(rewindSpeech(ledger, 3)).toEqual(ledger.filter((row) => row.at < 3 && (row.messageId ?? -1) < 3));
  });

  it("a swipe or edit keeps the row of the message itself; later rows go", () => {
    expect(rewindSpeech(ledger, 3, { kind: "swipe" })).toEqual([event(0, 1, 2), event(0, 2, 3)]);
    expect(rewindSpeech(ledger, 3, { kind: "edit" })).toEqual([event(0, 1, 2), event(0, 2, 3)]);
  });

  it("a delete drops rows of deleted messages or deleted sends and shifts the rest", () => {
    expect(rewindSpeech(ledger, 3, { kind: "delete", removed: 1 })).toEqual([event(0, 1, 2), event(3, 4, 5), event(3, 5, null)]);
    expect(rewindSpeech(ledger, 4, { kind: "delete", removed: 1 })).toEqual([event(0, 1, 2), event(0, 2, 3)]);
  });

  it("v3.0 19 fix 3: a swiped reaction keeps its cause handled and a swiped address keeps the cooldown; a delete reopens both", () => {
    const reaction: SpeechEvent = { ...event(0, 1, 2), origin: "reaction", cause: "3@1", yieldAfter: true };
    const address: SpeechEvent = { ...event(0, 2, 3), origin: "address", recipient: "player", yieldAfter: true };
    const read = (rows: SpeechEvent[]) => {
      const budget = new SpeechBudget({ chat: () => [], chatId: () => "chat-a", events: () => rows, setEvents: () => undefined, policy: () => null, persist: () => undefined });
      return { handled: budget.causeHandled("3@1"), lastAddress: budget.lastAddressAt() };
    };
    expect(read(rewindSpeech([reaction, address], 2, { kind: "swipe" }))).toEqual({ handled: true, lastAddress: -1 });
    expect(read(rewindSpeech([reaction, address], 3, { kind: "swipe" }))).toEqual({ handled: true, lastAddress: 3 });
    expect(read(rewindSpeech([reaction, address], 2, { kind: "delete", removed: 2 }))).toEqual({ handled: false, lastAddress: -1 });
  });

  it("caps and sanitizes", () => {
    let rows: SpeechEvent[] = [];
    for (let index = 0; index < 210; index += 1) rows = recordSpeechEvent(rows, event(0, index, index + 1));
    expect(rows).toHaveLength(200);
    expect(sanitizeSpeech([...rows.slice(0, 2), { origin: "chain" }, null])).toHaveLength(2);
  });
});
