import { applyPromiseLines, promiseReminderLines, quotesSomeoneElse, resolveDueDay, restatesPromise, type PromiseApplyContext, type PromiseWindowMessage } from "./impl";
import { parsePromiseLine, renderPromiseContractSection } from "./contract";
import { createPromises, evictPromises, openPromiseRefs, playerPromises, promiseHooks, promiseStatus, rollbackPromises, sanitizePromises, shownQuote } from "./state";
import { PROMISE_OPEN_CAP, type ParsedPromiseLine, type PromisesState } from "./types";

const CAST = [{ id: "mara", names: ["Mara", "mara"] }, { id: "kael", names: ["Kael", "kael"] }, { id: "ilsa", names: ["Ilsa", "ilsa"] }];

const msg = (messageId: number, speaker: string, text: string): PromiseWindowMessage => ({ messageId, speaker, text, isUser: speaker === "Rin" });

const ctx = (messages: PromiseWindowMessage[], patch: Partial<PromiseApplyContext> = {}): PromiseApplyContext => ({
  chatId: "chat-1", storyId: "s", window: { from: messages[0]?.messageId ?? 0, to: messages[messages.length - 1]?.messageId ?? 0, messages }, cast: CAST, boundary: 3, ...patch,
});

const line = (raw: string): ParsedPromiseLine => {
  const parsed = parsePromiseLine(raw);
  if (!("line" in parsed)) throw new Error(parsed.reason);
  return parsed.line;
};

const promise = (target: string, m: number, quote: string, deadline?: string) =>
  line(`[promised] ${target} | m=${m} | "${quote}"${deadline ? ` | by "${deadline}"` : ""}`);

const apply = (state: PromisesState, lines: ParsedPromiseLine[], context: PromiseApplyContext) => applyPromiseLines(state, lines, context, ["Rin"]);

const made = (messages: PromiseWindowMessage[], lines: ParsedPromiseLine[], patch: Partial<PromiseApplyContext> = {}) => apply(createPromises(), lines, ctx(messages, patch));

describe("plan 47 contract: promise lines quote exact words and carry the message id", () => {
  it("parses a promise with and without a deadline", () => {
    expect(parsePromiseLine('[promised] Mara | m=4 | "I\'ll bring your brother home" | by "by the new moon"')).toEqual({
      line: { kind: "promised", target: "Mara", messageId: 4, quote: "I'll bring your brother home", deadline: "by the new moon", line: expect.any(String) },
    });
    expect(parsePromiseLine('[promised] Mara | m=4 | "I swear it" | none')).toMatchObject({ line: { quote: "I swear it" } });
    expect(parsePromiseLine('[promised] Mara | m=4 | "I swear it"')).not.toHaveProperty("line.deadline");
  });

  it("parses id-addressed resolution events", () => {
    expect(parsePromiseLine('[released] pabc123 | m=9 | "You owe me nothing"')).toMatchObject({ line: { kind: "released", target: "pabc123", messageId: 9 } });
  });

  it("refuses a line without m=<id>", () => {
    expect(parsePromiseLine('[promised] Mara | "I swear it"')).toEqual({ reason: "promise line without m=<message index>" });
    expect(parsePromiseLine('[kept] pabc | "done"')).toEqual({ reason: "promise line without m=<message index>" });
  });

  it("renders open promises by id and only then the resolution formats", () => {
    expect(renderPromiseContractSection([])).not.toContain("[kept]");
    const text = renderPromiseContractSection([{ id: "p1", promisee: "Mara", quote: "I swear it" }]);
    expect(text).toContain('p1 Mara: "I swear it"');
    expect(text).toContain("[renegotiated] <id> | m=<message index>");
  });
});

describe("plan 47 acceptance: the quote resolves to a player span that commits and addresses the promisee", () => {
  const answering = msg(3, "Mara", "Will you find my brother?");
  const accepted = (text: string, target = "Mara", quote = text) => made([answering, msg(4, "Rin", text)], [promise(target, 4, quote)]);

  const PROMISES: Array<[string, string?, string?]> = [
    ["I promise I'll bring your brother home."],
    ["I swear on my blade I will find him."],
    ["You have my word, Mara. I'll find him."],
    ["Mara, I'll bring him back to you."],
    ["I vow to return before winter."],
    ["*kneels* I promise you, I will find him.", "Mara", "I promise you, I will find him."],
    ["I'll find your brother, I promise."],
    ["Kael, I swear I'll pay you back.", "Kael"],
    ["I give you my word: he comes home."],
    ["I will not rest until your brother is home. I promise.", "Mara", "I promise."],
  ];

  it.each(PROMISES)("accepts %s", (text, target = "Mara", quote = text) => {
    const result = accepted(text, target, quote);
    expect(result.refused).toEqual([]);
    expect(result.state.rows).toHaveLength(1);
  });

  const REFUSED: Array<[string, string, string?]> = [
    ["I won't promise anything.", "no commitment (negated)"],
    ["Maybe I'll find him.", "no commitment (hedged)"],
    ["Do I promise you that?", "no commitment (asked as a question)"],
    ["Should I promise you that?", "no commitment (hedged)"],
    ["I'll check the stables.", "casual future tense without a commitment word or addressee"],
    ["Kael said \"I promise I'll find him\" yesterday.", "the player is quoting someone else", "I promise I'll find him"],
    ["You said \"I'll be there\", remember?", "the player is quoting someone else", "I'll be there"],
    ["Oh sure, I promise, yeah right.", "sarcasm marker", "I promise"],
    ["I promise all of you I'll be back.", "a promise to an unnamed group"],
    ["I never promised that.", "no commitment (negated)"],
    ["I don't not promise.", "no commitment (negated)"],
  ];

  it.each(REFUSED)("refuses %s", (text, reason, quote = text) => {
    const result = accepted(text, "Mara", quote);
    expect(result.state.rows).toEqual([]);
    expect(result.refused[0]?.reason).toBe(reason);
  });

  it("refuses a paraphrase: the quote must be byte-exact", () => {
    expect(accepted("I promise I'll bring your brother home.", "Mara", "I promise to bring your brother home").refused[0]?.reason).toBe("quote is not word for word in that message");
  });

  it("refuses an NPC's promise attributed to the player", () => {
    const result = made([msg(3, "Mara", "I promise I'll wait for you.")], [promise("Mara", 3, "I promise I'll wait for you.")]);
    expect(result.refused[0]?.reason).toBe("not the player's own words");
  });

  it("refuses the wrong promisee and an off-roster one", () => {
    expect(accepted("Mara, I promise I'll find him.", "Kael").refused[0]?.reason).toBe("the promise is not addressed to that cast member");
    expect(accepted("I promise I'll find him.", "Kael").refused[0]?.reason).toBe("the promise is not addressed to that cast member");
    expect(accepted("I promise I'll find him.", "Bram").refused[0]?.reason).toBe("promisee is not in the cast");
  });

  it("makes one row per named member when one span names several", () => {
    const text = "Mara, Kael, I promise I'll get you both out.";
    const result = made([msg(4, "Rin", text)], [promise("Mara", 4, text), promise("Kael", 4, text)]);
    expect(result.state.rows.map((row) => row.promisee)).toEqual(["mara", "kael"]);
    expect(new Set(result.state.rows.map((row) => row.id)).size).toBe(2);
  });

  it("binds to the cited message when the same pledge is said twice (H13a)", () => {
    const text = "I promise I'll find him.";
    const messages = [answering, msg(4, "Rin", text), msg(5, "Mara", "Truly?"), msg(6, "Rin", text)];
    const result = made(messages, [promise("Mara", 6, text)]);
    expect(result.state.rows[0]?.source.messageId).toBe(6);
    expect(made(messages, [promise("Mara", 5, text)]).refused[0]?.reason).toBe("quote is not word for word in that message");
  });

  it("records the exact source span: chat, message, revision, speaker, offsets", () => {
    const text = "*nods* I promise I'll find him.";
    const result = made([answering, { ...msg(4, "Rin", text), swipeId: 2 }], [promise("Mara", 4, "I promise I'll find him.")]);
    const row = result.state.rows[0];
    expect(row?.source).toMatchObject({ chatId: "chat-1", storyId: "s", messageId: 4, speaker: "Rin", isUser: true, span: [7, text.length], revision: { swipeId: 2 } });
    expect(text.slice(...(row?.source.span ?? [0, 0]))).toBe(row?.quote);
    expect(row?.id).toMatch(/^p[0-9a-f]{8}$/);
  });

  it("stores a conditional offer as conditional and never lists it as owed", () => {
    const text = "If you open the gate, I promise I'll free your brother.";
    const result = made([answering, msg(4, "Rin", text)], [promise("Mara", 4, text)]);
    expect(result.state.rows[0]?.conditional).toBe(true);
    expect(playerPromises(result.state, (id) => id)).toEqual([]);
  });

  it("keeps a deadline only when it is quoted, and never invents one", () => {
    const text = "I promise I'll bring him back by the new moon.";
    const kept = made([answering, msg(4, "Rin", text)], [promise("Mara", 4, text, "by the new moon")]);
    expect(kept.state.rows[0]?.deadline).toMatchObject({ text: "by the new moon" });
    expect(kept.state.rows[0]?.deadline).not.toHaveProperty("dueDay");
    const invented = made([answering, msg(4, "Rin", text)], [promise("Mara", 4, text, "within three days")]);
    expect(invented.state.rows[0]).not.toHaveProperty("deadline");
    const undated = made([answering, msg(4, "Rin", "I promise I'll find him.")], [promise("Mara", 4, "I promise I'll find him.")]);
    expect(undated.state.rows[0]).not.toHaveProperty("deadline");
  });

  it("takes the deadline from the promisee's ask the player answers, against the story clock", () => {
    const messages = [msg(3, "Mara", "Bring him back by tomorrow."), msg(4, "Rin", "I promise I'll bring him back.")];
    const result = made(messages, [promise("Mara", 4, "I promise I'll bring him back.", "by tomorrow")], { storyDay: 2 });
    expect(result.state.rows[0]?.deadline).toMatchObject({ text: "by tomorrow", dueDay: 3, source: { messageId: 3 } });
  });

  it("resolves relative deadlines against the day only when it can", () => {
    expect(resolveDueDay("in three days", 4)).toBe(7);
    expect(resolveDueDay("by nightfall", 4)).toBe(4);
    expect(resolveDueDay("by the new moon", 4)).toBeUndefined();
  });

  it("refuses a 25th open promise and never evicts an open one", () => {
    let state = createPromises();
    for (let index = 0; index < PROMISE_OPEN_CAP + 1; index += 1) {
      const text = `Mara, I promise I'll bring the ${index} lantern.`;
      const result = apply(state, [promise("Mara", 10 + index, text)], ctx([msg(10 + index, "Rin", text)]));
      state = result.state;
      if (index === PROMISE_OPEN_CAP) expect(result).toMatchObject({ capped: 1, refused: [{ reason: `open promise cap (${PROMISE_OPEN_CAP})` }] });
    }
    expect(state.rows).toHaveLength(PROMISE_OPEN_CAP);
  });

  it("refuses the same promise twice while it is open", () => {
    const text = "I promise I'll find him.";
    const first = made([answering, msg(4, "Rin", text)], [promise("Mara", 4, text)]);
    const second = apply(first.state, [promise("Mara", 6, text)], ctx([msg(5, "Mara", "Again?"), msg(6, "Rin", text)]));
    expect(second.refused[0]?.reason).toMatch(/^the same promise is already open/);
  });

  it("detects a quotation attributed to someone else, not the player's own quoted speech", () => {
    const own = "\"I promise I'll find him,\" I say.";
    expect(quotesSomeoneElse(own, 1, ["Rin"])).toBe(false);
    expect(quotesSomeoneElse("\"I promise,\" Kael said.", 1, ["Rin"])).toBe(true);
  });
});

describe("plan 47 resolution: id-addressed events with evidence", () => {
  const base = () => {
    const messages = [msg(3, "Mara", "Will you find him?"), msg(4, "Rin", "I promise I'll find him.")];
    const result = made(messages, [promise("Mara", 4, "I promise I'll find him.")]);
    return { state: result.state, id: result.state.rows[0]?.id ?? "" };
  };
  const event = (kind: string, id: string, m: number, quote: string) => line(`[${kind}] ${id} | m=${m} | "${quote}"`);

  it("closes only the promise its id names (P2w)", () => {
    const first = base();
    const other = apply(first.state, [promise("Kael", 6, "Kael, I promise I'll find him.")], ctx([msg(6, "Rin", "Kael, I promise I'll find him.")]));
    const kept = apply(other.state, [event("kept", first.id, 8, "You found him")], ctx([msg(8, "Mara", "You found him. Thank you.")]));
    expect(kept.state.rows.map((row) => promiseStatus(row))).toEqual(["kept", "open"]);
  });

  it("drops events for unknown or closed ids", () => {
    const { state, id } = base();
    const closed = apply(state, [event("released", id, 6, "You owe me nothing")], ctx([msg(6, "Mara", "You owe me nothing.")])).state;
    expect(apply(closed, [event("kept", id, 7, "found him")], ctx([msg(7, "Rin", "I found him.")])).refused[0]?.reason).toBe("promise already closed");
    expect(apply(closed, [event("kept", "pdeadbeef", 7, "found him")], ctx([msg(7, "Rin", "I found him.")])).refused[0]?.reason).toBe("unknown promise id");
  });

  it("only the promisee releases", () => {
    const { state, id } = base();
    expect(apply(state, [event("released", id, 6, "forget it")], ctx([msg(6, "Rin", "Let's forget it.")])).refused[0]?.reason).toMatch(/^released needs/);
  });

  it("broken needs the player's refusal or a passed agreed deadline the promisee names; overdue alone is not broken", () => {
    const { state, id } = base();
    expect(apply(state, [event("broken", id, 6, "You did not come")], ctx([msg(6, "Mara", "You did not come.")])).refused[0]?.reason).toMatch(/^broken needs/);
    expect(promiseStatus(apply(state, [event("broken", id, 6, "I can't do it")], ctx([msg(6, "Rin", "I'm sorry, I can't do it.")])).state.rows[0]!)).toBe("broken");
  });

  it("renegotiation changes the quote shown and keeps the promise open", () => {
    const { state, id } = base();
    const window = ctx([msg(6, "Rin", "Give me until spring and I'll find him."), msg(7, "Mara", "Spring, then.")]);
    const next = apply(state, [event("renegotiated", id, 6, "Give me until spring and I'll find him.")], window).state;
    expect(promiseStatus(next.rows[0]!)).toBe("open");
    expect(shownQuote(next.rows[0]!)).toBe("Give me until spring and I'll find him.");
  });

  it("rollback past a closure reopens the promise; past the making removes it (P2r)", () => {
    const { state, id } = base();
    const kept = apply(state, [event("kept", id, 8, "You found him")], ctx([msg(8, "Mara", "You found him.")])).state;
    expect(promiseStatus(rollbackPromises(kept, 8).rows[0]!)).toBe("open");
    expect(rollbackPromises(kept, 4).rows).toEqual([]);
    expect(rollbackPromises(kept, 9)).toEqual(kept);
  });

  it("evicts only closed rows older than the rollback horizon", () => {
    const { state, id } = base();
    const kept = apply(state, [event("kept", id, 8, "You found him")], ctx([msg(8, "Mara", "You found him.")])).state;
    expect(evictPromises(kept, 8).rows).toHaveLength(1);
    expect(evictPromises(kept, 9).rows).toEqual([]);
    expect(evictPromises(state, 99).rows).toHaveLength(1);
  });

  it("sanitizes junk and keeps valid rows", () => {
    const { state } = base();
    expect(sanitizePromises(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(sanitizePromises({ rows: [{ id: 3 }, null] })).toEqual({ rows: [] });
  });
});

describe("plan 47 authored promises: linked to quests, not tracked twice", () => {
  const quests = [{ id: "brother", title: "Bring her brother home", giver: "mara", promise: true }];
  it("links a matching promise to the quest and takes its state from the quest", () => {
    const text = "Mara, I promise I'll bring your brother home.";
    const result = made([msg(4, "Rin", text)], [promise("Mara", 4, text)], { quests });
    expect(result.state.rows[0]?.questId).toBe("brother");
    expect(promiseStatus(result.state.rows[0]!, () => "done")).toBe("kept");
    expect(promiseStatus(result.state.rows[0]!, () => "active")).toBe("open");
    expect(openPromiseRefs(result.state, (id) => id)).toEqual([]);
    const again = apply(result.state, [promise("Mara", 6, "Mara, I swear I'll bring your brother home.")], ctx([msg(6, "Rin", "Mara, I swear I'll bring your brother home.")], { quests }));
    expect(again.refused[0]?.reason).toBe('the quest "Bring her brother home" already tracks this promise');
  });
});

describe("plan 47 no duplication: arcs that restate an open promise", () => {
  it("matches a restating arc, not an unrelated one", () => {
    const text = "I promise I'll bring your brother home from the mines.";
    const { state } = made([msg(3, "Mara", "Please."), msg(4, "Rin", text)], [promise("Mara", 4, text)]);
    expect(restatesPromise("Rin promised to bring Mara's brother home from the mines", state)).toBe(true);
    expect(restatesPromise("The baron hunts the smugglers", state)).toBe(false);
  });
});

describe("plan 47 reminders by relevance, promisee only", () => {
  const text = "I promise I'll bring your brother home from the mines.";
  const made1 = () => made([msg(3, "Mara", "Please."), msg(4, "Rin", text)], [promise("Mara", 4, text)]).state;
  const rows = (...entries: Array<[number, string, string]>) => entries.map(([index, speaker, body]) => ({ index, speaker, isUser: speaker === "Rin", text: body }));
  const remind = (state: PromisesState, chat: ReturnType<typeof rows>, rosterId = "mara", extra: object = {}) =>
    promiseReminderLines(state, { rosterId, promiseeNames: rosterId === "mara" ? ["Mara", "mara"] : ["Kael", "kael"], playerName: "Rin", chat, ...extra });

  it("is silent without a trigger: no reminder from elapsed turns", () => {
    const chat = rows([4, "Rin", text], ...Array.from({ length: 30 }, (_, at): [number, string, string] => [5 + at, at % 2 ? "Rin" : "Mara", "We walk on."]));
    expect(remind(made1(), chat)).toEqual([]);
  });

  it("surfaces when the newest turn names the promise's subject, with the exact quote", () => {
    const chat = rows([4, "Rin", text], [5, "Mara", "Thank you."], [6, "Rin", "The mines are close now; your brother must be near."]);
    expect(remind(made1(), chat)).toEqual([`Rin promised you: "${text}". You may bring it up if it fits.`]);
    expect(remind(made1(), chat, "kael")).toEqual([]);
  });

  it("surfaces when the player asks about it", () => {
    expect(remind(made1(), rows([4, "Rin", text], [5, "Rin", "Do you remember what I promised?"]))).toHaveLength(1);
  });

  it("cools down once the promisee brought it up (repetition floor)", () => {
    const chat = rows([4, "Rin", text], [5, "Mara", "You promised me my brother."], [6, "Rin", "The mines; your brother is near."]);
    expect(remind(made1(), chat)).toEqual([]);
  });

  it("an agreed deadline that is due surfaces in a bounded window and never says broken", () => {
    const dated = made([msg(3, "Mara", "By tomorrow?"), msg(4, "Rin", "I promise I'll bring him home.")], [promise("Mara", 4, "I promise I'll bring him home.", "By tomorrow")], { storyDay: 1 }).state;
    const turns = (count: number) => rows([4, "Rin", "I promise I'll bring him home."], ...Array.from({ length: count }, (_, at): [number, string, string] => [5 + at, "Mara", "We walk."]));
    expect(remind(dated, turns(3), "mara", { storyDay: 3 })).toEqual([]);
    const due = remind(dated, turns(15), "mara", { storyDay: 3 });
    expect(due[0]).toContain("and that day has passed");
    expect(due[0]).not.toMatch(/broke/);
    expect(remind(dated, turns(18), "mara", { storyDay: 3 })).toEqual([]);
  });

  it("remembers fulfilment warmly once, until the promisee speaks", () => {
    const state = made1();
    const id = state.rows[0]!.id;
    const kept = apply(state, [line(`[kept] ${id} | m=8 | "brought him home"`)], ctx([msg(8, "Rin", "I brought him home.")])).state;
    expect(remind(kept, rows([4, "Rin", text], [8, "Rin", "I brought him home."]))).toEqual([`Rin kept their word to you: "${text}".`]);
    expect(remind(kept, rows([4, "Rin", text], [8, "Rin", "I brought him home."], [9, "Mara", "Thank you."]))).toEqual([]);
  });
});

describe("plan 47 director: only fully-witnessed promises become hooks (P4d)", () => {
  it("passes nothing private or unknown", () => {
    const text = "I promise I'll find him.";
    const { state } = made([msg(3, "Mara", "Please."), msg(4, "Rin", text)], [promise("Mara", 4, text)]);
    expect(promiseHooks(state, () => "unknown", (id) => id)).toEqual([]);
    expect(promiseHooks(state, () => "partial", (id) => id)).toEqual([]);
    expect(promiseHooks(state, () => "all-present", () => "Mara")).toEqual([`Mara was promised: "${text}"`]);
  });
});
