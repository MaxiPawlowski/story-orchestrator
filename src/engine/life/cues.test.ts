import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine } from "../engine";
import { parseStory, parseStoryOrThrow } from "../validate";
import { diffStories } from "../storyDiff";
import type { NormalizedStory, PrimitiveValue } from "../schema";
import { cueAtKey, cueLandedKey, normAtKey, normSeenKey, topicKey } from "../cueSchema";
import { GAME_LAYER } from "../validate/gameLayerImpl";
import { usesGameLayer } from "../validate/gameLayer";
import { directlyAddressed } from "@talk/directAddress";
import {
  cueDefRev, cueKey, cueLatches, cueProvider, diffCues, normKey, raisedTopics, reconcileCues, topicCount, topicDefRev, topicOfferKey,
} from "./cues";
import {
  cueEvidence, createCues, liveCueReceipts, rollbackCues, selectOffer, type OfferCandidate, type OfferContext, type OfferEvidence, type OfferReceipt,
} from "./offers";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/reactive-cues.story.json"), "utf8")) as Record<string, unknown>;
const STORY = parseStoryOrThrow(RAW);
type Roster = Array<Record<string, unknown>>;
type Values = Record<string, PrimitiveValue>;
const is = (q: string, v: PrimitiveValue = true) => ({ q, op: "==", v });

const errorsOf = (raw: Record<string, unknown>) => {
  const parsed = parseStory(raw);
  return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

const withMember = (id: string, patch: Record<string, unknown>) => ({ ...RAW, roster: (RAW.roster as Roster).map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) });

const member = (story: NormalizedStory, id: string) => {
  const found = story.life?.members.find((entry) => entry.id === id);
  if (!found) throw new Error(`no life member ${id}`);
  return found;
};

const ctx = (recipient: string, values: Values, extra: Partial<OfferContext> = {}): OfferContext => ({
  story: STORY, values, boundary: 5, recipient, chatId: "chat", latestPlayer: null, receipts: [], ...extra,
});

const pick = (recipient: string, values: Values, extra: Partial<OfferContext> = {}) => {
  const context = ctx(recipient, values, extra);
  return selectOffer({ candidates: cueProvider(context), receipts: context.receipts, boundary: context.boundary, recipient: "ok", refuse: () => null });
};

let stamp = 0;
const receiptOf = (candidate: OfferCandidate, messageId: number, boundary = 5): OfferReceipt => ({
  key: candidate.key, defRev: candidate.defRev, source: candidate.source, recipient: candidate.recipient, chatId: "chat", messageId, revision: `r${(stamp += 1)}`, boundary,
  textHash: "h", ...(candidate.gap ? { gap: true as const } : {}),
});

describe("v2.9 plan 04: cue validation", () => {
  it("accepts the lab story and compiles its keys", () => {
    expect(errorsOf(RAW)).toEqual([]);
    expect(STORY.qualityByKey[cueAtKey("mara", "ledger")]).toMatchObject({ type: "int", source: "code", latching: true, monotonic: true });
    expect(STORY.qualityByKey[cueLandedKey("mara", "warn")]).toMatchObject({ latching: true });
    expect(STORY.qualityByKey[cueAtKey("mara", "warn")]).toBeUndefined();
    expect(STORY.qualityByKey[topicKey("mara", "accounts")]).toMatchObject({ type: "int", source: "code" });
    expect(STORY.qualityByKey[normAtKey("steel")]).toBeDefined();
    expect(STORY.qualityByKey[normSeenKey("steel", "bryn")]).toBeDefined();
  });

  it.each([
    ["a reaction on inaction", withMember("tom", { cues: [{ id: "x", kind: "reaction", when: { not: is("ledger_returned") }, cue: "x" }] }), "cue-needs-event"],
    ["a reaction on == false", withMember("tom", { cues: [{ id: "x", kind: "reaction", when: is("ledger_returned", false), cue: "x" }] }), "cue-needs-event"],
    ["a must cue without landed_when", withMember("tom", { cues: [{ id: "x", kind: "remark", lane: "must", when: is("guild_angry"), cue: "x" }] }), "needs landed_when"],
    ["landed_when on a may cue", withMember("tom", { cues: [{ id: "x", kind: "remark", when: is("guild_angry"), cue: "x", landed_when: is("heard_warning") }] }), "for a must cue"],
    ["a window on a remark", withMember("tom", { cues: [{ id: "x", kind: "remark", when: is("guild_angry"), cue: "x", window: 2 }] }), "window is for a reaction"],
    ["an underscore id", withMember("tom", { cues: [{ id: "a_b", kind: "remark", when: is("guild_angry"), cue: "x" }] }), "no _"],
    ["a macro", withMember("tom", { cues: [{ id: "x", kind: "remark", when: is("guild_angry"), cue: "{{user}} came" }] }), "plain text"],
    ["max_offers over 5", withMember("mara", { cues: [{ id: "x", kind: "remark", lane: "must", when: is("guild_angry"), cue: "x", landed_when: is("heard_warning"), max_offers: 6 }] }), "1 to 5"],
    ["a duplicate cue id", withMember("tom", { cues: [{ id: "x", kind: "remark", when: is("guild_angry"), cue: "a" }, { id: "x", kind: "remark", when: is("guild_angry"), cue: "b" }] }), "second cue"],
    ["a topic key that names the cast", withMember("mara", { topics: [{ id: "t", keys: ["Tom"], tiers: [{ cue: "x" }] }] }), "cast member's name"],
    ["four tiers", withMember("mara", { topics: [{ id: "t", keys: ["boat"], tiers: [{ cue: "a" }, { cue: "b" }, { cue: "c" }, { cue: "d" }] }] }), "1 to 3"],
    ["an unknown gate quality", withMember("tom", { cues: [{ id: "x", kind: "remark", when: is("nope"), cue: "x" }] }), "nope"],
    ["a norm with an unknown witness", { ...RAW, norms: [{ id: "n", label: "l", broken_when: is("drew_weapon"), noticed_by: ["ghost"], cue: "c" }] }, "'ghost' is not a roster member"],
    ["a norm on inaction", { ...RAW, norms: [{ id: "n", label: "l", broken_when: { not: is("drew_weapon") }, noticed_by: ["bryn"], cue: "c" }] }, "cue-needs-event"],
    ["an authored cue_ key", { ...RAW, qualities: [...(RAW.qualities as unknown[]), { key: "cue_x", type: "bool", source: "extractor", rubric: "x" }] }, "kept for character cues"],
  ])("refuses %s", (_name, raw, message) => {
    expect(errorsOf(raw).join("\n")).toContain(message);
  });
});

describe("v2.9 plan 04: activation for feature-only stories", () => {
  const bare = (patch: Record<string, unknown>) => ({
    id: "bare", title: "Bare", description: "d", qualities: [{ key: "flag", type: "bool", source: "extractor", rubric: "x" }],
    checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "o" }], transitions: [], roster: [{ id: "mara", name: "Mara" }], ...patch,
  });

  it.each([
    ["cue-only", bare({ roster: [{ id: "mara", name: "Mara", cues: [{ id: "c", kind: "reaction", when: is("flag"), cue: "the flag went up" }] }] }), cueAtKey("mara", "c")],
    ["topic-only", bare({ roster: [{ id: "mara", name: "Mara", topics: [{ id: "t", keys: ["flag"], tiers: [{ cue: "it is red" }] }] }] }), topicKey("mara", "t")],
    ["norm-only", bare({ norms: [{ id: "n", label: "l", broken_when: is("flag"), noticed_by: ["mara"], cue: "the flag was raised" }] }), normSeenKey("n", "mara")],
  ])("activates the life layer for a %s story", (_name, raw, key) => {
    expect(usesGameLayer(raw)).toBe(true);
    const story = parseStoryOrThrow(raw);
    expect(story.life).toBeDefined();
    expect(story.qualityByKey[key]).toBeDefined();
  });

  it("latches and offers a cue-only story's reaction", () => {
    const story = parseStoryOrThrow(bare({ roster: [{ id: "mara", name: "Mara", cues: [{ id: "c", kind: "reaction", when: is("flag"), cue: "the flag went up" }] }] }));
    expect(cueLatches(story, { boundary: 2, values: { flag: true }, activeCheckpointId: "a" })).toEqual([{ q: cueAtKey("mara", "c"), v: 2 }]);
    const offers = cueProvider({ story, values: { flag: true, [cueAtKey("mara", "c")]: 2 }, boundary: 2, recipient: "mara", chatId: "c", latestPlayer: null, receipts: [] });
    expect(offers.map((offer) => offer.key)).toEqual([cueKey("mara", "c")]);
  });
});

describe("v2.9 plan 04: latches", () => {
  it("latches a reaction once, and a norm for each witness who is not away", () => {
    const writes = cueLatches(STORY, { boundary: 3, values: { ledger_returned: true, drew_weapon: true, mara_at_market: true, location: "harbour" }, activeCheckpointId: "start" });
    expect(writes).toEqual(expect.arrayContaining([
      { q: cueAtKey("mara", "ledger"), v: 3 }, { q: cueAtKey("tom", "ledger"), v: 3 }, { q: normAtKey("steel"), v: 3 }, { q: normSeenKey("steel", "bryn"), v: 3 },
    ]));
    expect(writes.some((write) => write.q === normSeenKey("steel", "mara"))).toBe(false);
    expect(cueLatches(STORY, { boundary: 4, values: { ledger_returned: true, [cueAtKey("mara", "ledger")]: 3, [cueAtKey("tom", "ledger")]: 3 }, activeCheckpointId: "start" })).toEqual([]);
  });

  it("runs through the engine's latch pass", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(STORY);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "ledger_returned", v: true, source: "extractor" }], turnRange: { from: 0, to: 1 } });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    expect(engine.serialize().blackboard.values[cueAtKey("mara", "ledger")]).toBe(1);
  });
});

describe("v2.9 plan 04: offers and arbitration", () => {
  it("offers a reaction inside its window only, then never twice", () => {
    const values = { [cueAtKey("tom", "ledger")]: 4 };
    expect(pick("tom", values, { boundary: 4 }).winner?.candidate.key).toBe(cueKey("tom", "ledger"));
    expect(pick("tom", values, { boundary: 5 }).winner?.candidate.key).toBe(cueKey("tom", "ledger"));
    expect(pick("tom", values, { boundary: 6 }).winner).toBeNull();
    const candidate = pick("tom", values, { boundary: 4 }).winner?.candidate as OfferCandidate;
    expect(pick("tom", values, { boundary: 5, receipts: [receiptOf(candidate, 7, 4)] }).winner).toBeNull();
  });

  it("puts a must cue first, re-offers it up to max_offers and stops once landed", () => {
    const values: Values = { guild_angry: true, location: "market", [cueAtKey("mara", "ledger")]: 5 };
    const first = pick("mara", values);
    expect(first.winner?.candidate.key).toBe(cueKey("mara", "warn"));
    const one = receiptOf(first.winner?.candidate as OfferCandidate, 3, 2);
    expect(pick("mara", values, { receipts: [one] }).winner?.candidate.key).toBe(cueKey("mara", "warn"));
    const two = receiptOf(first.winner?.candidate as OfferCandidate, 6, 4);
    expect(pick("mara", values, { receipts: [one, two] }).winner?.candidate.key).not.toBe(cueKey("mara", "warn"));
    expect(pick("mara", { ...values, [cueLandedKey("mara", "warn")]: 4 }).winner?.candidate.key).not.toBe(cueKey("mara", "warn"));
  });

  it("orders may cues by priority, then declaration, and keeps two may offers two turns apart", () => {
    const values: Values = { location: "market", [cueAtKey("mara", "ledger")]: 5 };
    const selection = pick("mara", values);
    expect(selection.ranked.map((entry) => entry.candidate.key)).toEqual([cueKey("mara", "market"), cueKey("mara", "ledger")]);
    const market = receiptOf(selection.winner?.candidate as OfferCandidate, 8, 5);
    expect(pick("mara", values, { boundary: 6, receipts: [market] }).winner).toBeNull();
    expect(pick("mara", values, { boundary: 7, receipts: [market] }).winner?.candidate.key).toBe(cueKey("mara", "ledger"));
    expect(pick("mara", values, { boundary: 8, receipts: [market] }).winner?.candidate.key).toBe(cueKey("mara", "market"));
  });

  it("drops a candidate the content filter refuses and takes the next", () => {
    const context = ctx("mara", { location: "market", [cueAtKey("mara", "ledger")]: 5 });
    const selection = selectOffer({ candidates: cueProvider(context), receipts: [], boundary: 5, recipient: "ok", refuse: (line) => (line.includes("market") ? "held-secret" : null) });
    expect(selection.winner?.candidate.key).toBe(cueKey("mara", "ledger"));
    expect(selection.dropped).toEqual([expect.objectContaining({ reason: "held-secret" })]);
  });

  it("drops everything for a recipient who is away or disabled", () => {
    const context = ctx("mara", { location: "market" });
    expect(selectOffer({ candidates: cueProvider(context), receipts: [], boundary: 5, recipient: "recipient-away", refuse: () => null }).winner).toBeNull();
  });

  it("pins the competition: must beats a raised topic, a topic beats an echo, an echo beats a norm and a cue", () => {
    const base = (key: string, kind: OfferCandidate["source"], priority: number, lane: "must" | "may" = "may"): OfferCandidate => ({
      key, defRev: "d", source: kind, recipient: "mara", lane, priority, order: 0, text: key, copy: "react", window: { from: 0, to: null }, spend: "once", gap: kind.kind !== "topic",
    });
    const occurrence = { chatId: "c", messageId: 4, revision: "r", member: "mara", topicId: "t" };
    const topic = base("topic", { kind: "topic", member: "mara", topicId: "t", tier: 1, occurrence }, 30);
    const echo = base("echo", { kind: "echo", echoId: "e", occurrenceId: "o" }, 20);
    const norm = base("norm", { kind: "norm", normId: "n", member: "mara" }, 15);
    const cue = base("cue", { kind: "cue", member: "mara", cueId: "c" }, 0);
    const must = base("must", { kind: "cue", member: "mara", cueId: "m" }, 0, "must");
    const order = (candidates: OfferCandidate[]) => selectOffer({ candidates, receipts: [], boundary: 1, recipient: "ok", refuse: () => null }).ranked.map((entry) => entry.candidate.key);
    expect(order([cue, norm, echo, topic, must])).toEqual(["must", "topic", "echo", "norm", "cue"]);
    expect(order([{ ...cue, priority: 25 }, echo, topic])).toEqual(["topic", "cue", "echo"]);
  });

  it("names a tie in the same lane, priority and kind", () => {
    const values: Values = { location: "docks", [cueAtKey("tom", "ledger")]: 5 };
    const selection = pick("tom", values);
    expect(selection.winner?.candidate.key).toBe(cueKey("tom", "ledger"));
    expect(selection.tiedWith).toEqual([cueKey("tom", "river")]);
  });
});

describe("v2.9 plan 04: direct address and topics", () => {
  const roster = STORY.roster;
  it.each([
    ["Mara, what about the ledger?", "mara"],
    ["What about the ledger, Mara?", "mara"],
    ["\"Mara, tell me about the ledger,\" I say.", "mara"],
    ["Hey Tom, the river?", "tom"],
    ["Ferryman, a word.", "tom"],
    ["I saw Mara at the docks with the ledger.", null],
    ["*I turn to Mara* \"What about the ledger?\"", null],
    ["*Bryn shouts \"Mara, run!\"* I ask about the ledger.", null],
    ["Mara, Tom, the ledger?", null],
    ["Tell Mara the ledger is gone.", null],
    ["Don't tell Mara, but the ledger is gone.", null],
  ])("addresses %j -> %s", (text, expected) => {
    expect(directlyAddressed(roster, text)).toBe(expected);
  });

  const line = (text: string, messageId = 4, revision = "r1") => ({ messageId, revision, text });

  it("raises a topic only for the addressed member, in character, with a key", () => {
    expect(raisedTopics(ctx("mara", {}, { latestPlayer: line("Mara, what about the ledger?") }), member(STORY, "mara"))).toHaveLength(1);
    expect(raisedTopics(ctx("tom", {}, { latestPlayer: line("Mara, what about the ledger?") }), member(STORY, "tom"))).toHaveLength(0);
    expect(raisedTopics(ctx("mara", {}, { latestPlayer: line("((OOC: Mara, the ledger?))") }), member(STORY, "mara"))).toHaveLength(0);
    expect(raisedTopics(ctx("mara", {}, { latestPlayer: line("Mara, how are you?") }), member(STORY, "mara"))).toHaveLength(0);
  });

  it("offers the next tier, consumes each raise once and holds at a gated tier", () => {
    const accounts = member(STORY, "mara").topics?.[0];
    if (!accounts) throw new Error("fixture");
    const first = pick("mara", {}, { latestPlayer: line("Mara, the ledger?") }).winner?.candidate as OfferCandidate;
    expect(first.source).toMatchObject({ kind: "topic", tier: 1 });
    const consumed = receiptOf(first, 5);
    expect(pick("mara", {}, { latestPlayer: line("Mara, the ledger?"), receipts: [consumed] }).winner).toBeNull();
    expect(topicCount([consumed], "mara", accounts)).toBe(1);
    expect(pick("mara", {}, { latestPlayer: line("Mara, the accounts?", 6, "r2"), receipts: [consumed] }).winner).toBeNull();
    const deeper = pick("mara", { trusts_player: true }, { latestPlayer: line("Mara, the accounts?", 6, "r2"), receipts: [consumed] }).winner?.candidate as OfferCandidate;
    expect(deeper.source).toMatchObject({ kind: "topic", tier: 2 });
    const both = [consumed, receiptOf(deeper, 7)];
    expect(topicCount(both, "mara", accounts)).toBe(2);
    expect(topicCount(both, "mara", accounts, 7)).toBe(1);
    expect(pick("mara", { trusts_player: true }, { latestPlayer: line("Mara, the ledger again?", 8, "r3"), receipts: both }).winner).toBeNull();
  });

  it("an edit of the player line is a new raise, but never a second step for the same message", () => {
    const accounts = member(STORY, "mara").topics?.[0];
    if (!accounts) throw new Error("fixture");
    const first = pick("mara", {}, { latestPlayer: line("Mara, the ledger?", 4, "r1") }).winner?.candidate as OfferCandidate;
    const answered = { ...receiptOf(first, 5), revision: "m5" };
    const live = liveCueReceipts([answered], (messageId) => (messageId === 4 ? "r9" : "m5"));
    expect(live).toEqual([]);
    const edited = pick("mara", {}, { latestPlayer: line("Mara, the ledger now?", 4, "r9"), receipts: live }).winner?.candidate as OfferCandidate;
    expect(edited.key).not.toBe(first.key);
    expect(edited.source).toMatchObject({ kind: "topic", tier: 1 });
    expect(topicCount([receiptOf(first, 5), receiptOf(edited, 5)], "mara", accounts)).toBe(1);
  });

  it("a must cue wins the reply and leaves the raise unconsumed", () => {
    const selection = pick("mara", { guild_angry: true }, { latestPlayer: line("Mara, the ledger?") });
    expect(selection.winner?.candidate.key).toBe(cueKey("mara", "warn"));
    expect(selection.ranked[1]?.candidate.source.kind).toBe("topic");
  });
});

describe("v2.9 plan 04: offer evidence in derive", () => {
  const derive = (receipts: OfferReceipt[], values: Values, lastMessageId: number) => GAME_LAYER.life.deriveLife(STORY, {
    boundary: 6, activeCheckpointId: "start", checkpointStartedBoundary: 0, checkpointStartedMessageId: 0, lastMessageId, values, offers: cueEvidence(receipts),
  }, []);
  const warn = pick("mara", { guild_angry: true }).winner?.candidate as OfferCandidate;
  const landed = (writes: Array<{ q: string }>) => writes.some((write) => write.q === cueLandedKey("mara", "warn"));

  it("lands a must cue only after an earlier, counting offer", () => {
    expect(landed(derive([receiptOf(warn, 3)], { heard_warning: true }, 5))).toBe(true);
  });

  it.each([
    ["never offered", [] as OfferReceipt[]],
    ["offered by the reply that commits this boundary", [receiptOf(warn, 5)]],
    ["offered under an older definition", [{ ...receiptOf(warn, 3), defRev: "old" }]],
  ])("does not land when %s", (_name, receipts) => {
    expect(landed(derive(receipts, { heard_warning: true }, 5))).toBe(false);
  });

  it("does not land while landed_when fails", () => {
    expect(landed(derive([receiptOf(warn, 3)], {}, 5))).toBe(false);
  });

  it("writes topic counters from consumed evidence only", () => {
    const topic = pick("mara", {}, { latestPlayer: { messageId: 2, revision: "a", text: "Mara, the ledger?" } }).winner?.candidate as OfferCandidate;
    expect(derive([receiptOf(topic, 3)], {}, 5)).toEqual(expect.arrayContaining([{ q: topicKey("mara", "accounts"), v: 1 }]));
    expect(derive([receiptOf(topic, 5)], {}, 5)).toEqual(expect.arrayContaining([{ q: topicKey("mara", "accounts"), v: 0 }]));
  });

  it("freezes the evidence", () => {
    const evidence = cueEvidence([receiptOf(warn, 3)]);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.receipts[0])).toBe(true);
  });
});

describe("v2.9 plan 04: rollback equals replay (C6)", () => {
  interface Turn { deltas: Values; offer?: { recipient: string; latest?: string } }
  const turns: Turn[] = [
    { deltas: { guild_angry: true }, offer: { recipient: "mara" } },
    { deltas: { ledger_returned: true }, offer: { recipient: "tom" } },
    { deltas: {}, offer: { recipient: "mara", latest: "Mara, the ledger?" } },
    { deltas: { heard_warning: true, trusts_player: true }, offer: { recipient: "mara" } },
    { deltas: { drew_weapon: true }, offer: { recipient: "bryn" } },
    { deltas: {}, offer: { recipient: "mara", latest: "Mara, the accounts?" } },
    { deltas: { location: "docks" }, offer: { recipient: "tom" } },
  ];

  const play = (count: number, start?: { engine: StoryEngine; receipts: OfferReceipt[]; from: number }) => {
    const receipts = start?.receipts ?? [];
    const evidence = (): OfferEvidence => cueEvidence(receipts);
    const engine = start?.engine ?? new StoryEngine({ now: () => 0, offers: evidence, derive: (view) => GAME_LAYER.life.deriveLife(STORY, view, []) });
    if (!start) engine.loadStory(STORY);
    const trace: Values[] = [];
    for (let at = start?.from ?? 0; at < count; at += 1) {
      const turn = turns[at];
      const player = at * 2;
      engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(turn.deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })), turnRange: { from: player, to: player + 1 } });
      const values = engine.serialize().blackboard.values;
      const latestPlayer = turn.offer?.latest ? { messageId: player, revision: `p${player}`, text: turn.offer.latest } : null;
      const winner = turn.offer ? selectOffer({ candidates: cueProvider({ story: STORY, values, boundary: engine.serialize().boundary, recipient: turn.offer.recipient, chatId: "c", latestPlayer, receipts }),
        receipts, boundary: engine.serialize().boundary, recipient: "ok", refuse: () => null }).winner : null;
      if (winner) receipts.push({ ...receiptOf(winner.candidate, player + 1, engine.serialize().boundary), revision: `m${player + 1}` });
      engine.commitBoundary({ lastMessageId: player + 1, chatLength: player + 2 });
      trace.push(Object.fromEntries(Object.entries(engine.serialize().blackboard.values).filter(([key]) => key.startsWith("cue_") || key.startsWith("topic_"))));
    }
    return { engine, receipts, trace };
  };

  it.each([1, 2, 3, 4, 5, 6])("cuts at turn %i and replays to the same cue state", (cut) => {
    const full = play(turns.length);
    const prefix = play(turns.length);
    const message = cut * 2;
    const boundary = prefix.engine.boundaryBeforeMessage(message) ?? 0;
    expect(prefix.engine.rollbackTo(boundary)).toEqual(expect.objectContaining({ ok: true }));
    const state = rollbackCues({ ...createCues(), receipts: prefix.receipts }, message, boundary);
    const replay = play(turns.length, { engine: prefix.engine, receipts: [...state.receipts], from: cut });
    expect(replay.trace).toEqual(full.trace.slice(cut));
  });

  it("keeps landed and topic keys after the run", () => {
    const { trace } = play(turns.length);
    const last = trace.at(-1) ?? {};
    expect(last[cueLandedKey("mara", "warn")]).toBeGreaterThan(0);
    expect(last[topicKey("mara", "accounts")]).toBe(1);
    expect(last[normSeenKey("steel", "bryn")]).toBeGreaterThan(0);
  });
});

describe("v2.9 plan 04: story update", () => {
  const edit = (patch: (raw: Record<string, unknown>) => Record<string, unknown>) => parseStoryOrThrow(patch(JSON.parse(JSON.stringify(RAW))));
  const mara = (raw: Record<string, unknown>) => (raw.roster as Roster).find((entry) => entry.id === "mara") as Record<string, unknown> & { cues: Roster; topics: Roster };

  it("keeps a reworded cue, resets a changed one and prunes a removed one", () => {
    const reworded = edit((raw) => { mara(raw).cues[0].cue = "the ledger came home"; return raw; });
    const regated = edit((raw) => { mara(raw).cues[0].when = is("guild_angry"); return raw; });
    const removed = edit((raw) => { mara(raw).cues = mara(raw).cues.slice(1); return raw; });
    expect(diffCues(STORY, reworded).map((row) => row.code)).toEqual(["cue-edited"]);
    expect(diffCues(STORY, regated)).toEqual([expect.objectContaining({ code: "cue-replaced", drop: [cueAtKey("mara", "ledger"), cueLandedKey("mara", "ledger")] })]);
    expect(diffCues(STORY, removed).map((row) => row.code)).toEqual(["cue-removed"]);
    const state = { blackboard: { values: { [cueAtKey("mara", "ledger")]: 2 }, versions: {}, latched: { [cueAtKey("mara", "ledger")]: true } } };
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(STORY);
    const serialized = { ...engine.serialize(), ...state };
    expect(diffStories(STORY, regated, serialized).droppedQualityKeys).toContain(cueAtKey("mara", "ledger"));
    expect(diffStories(STORY, reworded, serialized).droppedQualityKeys).toEqual([]);
  });

  it("keeps earned receipts under their old definition and drops removed sources", () => {
    const ledger = pick("mara", { [cueAtKey("mara", "ledger")]: 5 }).winner?.candidate as OfferCandidate;
    const kept = receiptOf(ledger, 3);
    const lapse = { key: ledger.key, recipient: "mara", at: 7, reason: "window-ended" as const, defRev: ledger.defRev, source: ledger.source };
    const state = { ...createCues(), receipts: [kept], lapses: [lapse] };
    const regated = edit((raw) => { mara(raw).cues[0].when = is("guild_angry"); return raw; });
    expect(reconcileCues(state, STORY, regated)).toEqual({ receipts: [kept], lapses: [], consumed: [] });
    const removed = edit((raw) => { mara(raw).cues = mara(raw).cues.slice(1); return raw; });
    expect(reconcileCues(state, STORY, removed)).toEqual({ receipts: [], lapses: [], consumed: [] });
    expect(cueDefRev(member(regated, "mara").cues?.[0] as NonNullable<ReturnType<typeof member>["cues"]>[number])).not.toBe(ledger.defRev);
  });

  it("leaves topic counts under a changed definition inert", () => {
    const topic = member(STORY, "mara").topics?.[0];
    const rekeyed = edit((raw) => { mara(raw).topics[0].keys = ["books"]; return raw; });
    const next = member(rekeyed, "mara").topics?.[0];
    if (!topic || !next) throw new Error("fixture");
    const occurrence = { chatId: "c", messageId: 2, revision: "r", member: "mara", topicId: topic.id };
    const row: OfferReceipt = { key: topicOfferKey(occurrence), defRev: topicDefRev(topic), source: { kind: "topic", member: "mara", topicId: topic.id, tier: 1, occurrence },
      recipient: "mara", chatId: "c", messageId: 3, revision: "x", boundary: 1, textHash: "h" };
    expect(topicCount([row], "mara", topic)).toBe(1);
    expect(topicCount([row], "mara", next)).toBe(0);
  });

  it("names norms by witness in their offer keys", () => {
    expect(normKey("steel", "bryn")).toBe("norm:steel:bryn");
  });
});
