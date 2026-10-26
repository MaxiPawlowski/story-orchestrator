import { readWith, recordingModel } from "../../../test/support/modelCall";
import { StoryEngine, parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { hashContract, renderSharedReadPrompt } from "@extraction/contract";
import { parseSharedReadResponse } from "@extraction/parse";
import { readContract, runSharedRead } from "@extraction/sharedRead";
import type { SharedReadWindow } from "@extraction/types";
import { WITNESS_STATES } from "../audience";
import { renderWitnessContractSection, resolveWitnessLines, revisionOf, witnessAudit, type WitnessResolveContext } from "./contract";
import { acceptWitnessRead, witnessLookup, witnessParts, witnessRevision, witnessState } from "./record";
import { createWitness, rollbackWitness, sanitizeWitness } from "./state";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

const story = (qualities = true): NormalizedStory => parseStoryOrThrow({
  id: "witness-read", title: "Witness read", description: "plan 42",
  qualities: qualities ? [{ key: "gate_open", type: "bool", source: "extractor", rubric: "Is the gate open?" }] : [],
  checkpoints: [{ id: "cp1", name: "The Gate", objective: "Get past", type: "anchor", start: true }],
  transitions: [], roster: [{ id: "mara", name: "Mara", aliases: ["The Smith"] }, { id: "ben", name: "Ben" }, { id: "ula", name: "Ula" }],
});

const window: SharedReadWindow = {
  from: 4, to: 6,
  messages: [
    { index: 4, messageId: 4, speaker: "Mara", text: "The gate opens at dawn, everyone.", isUser: false },
    { index: 5, messageId: 5, speaker: "Ben", text: "Ben nods to the group. He leans close to Mara and whispers: the key is under the anvil.", isUser: false, swipeId: 1 },
    { index: 6, messageId: 6, speaker: "Rin", text: "I step outside.", isUser: true },
  ],
};

const ctx = (present = ["mara", "ben", "ula"]): WitnessResolveContext => ({
  from: window.from, to: window.to, messages: window.messages, present,
  resolveMember: (token) => ({ mara: "mara", "the smith": "mara", ben: "ben", ula: "ula" } as Record<string, string>)[token.trim().toLowerCase()] ?? null,
});

describe("plan 42 B: witness lines parse into span claims, unknown by default", () => {
  it("states the line formats and the earshot rubric", () => {
    const section = renderWitnessContractSection();
    expect(section).toContain("WITNESS m=<message index> heard=<roster id,roster id|all-present|unknown>");
    expect(section).toContain("SPAN m=<message index> from=");
    expect(section).toContain("earshot");
  });

  it("resolves ids, names and aliases, and all-present to the present set", () => {
    const { claims, rejected } = resolveWitnessLines(["WITNESS m=4 heard=all-present", "WITNESS m=6 heard=The Smith, ben"], ctx(["mara", "ula"]));
    expect(rejected).toEqual([]);
    expect(claims[0]).toMatchObject({ messageId: 4, mixed: false, heard: { kind: "all-present", members: ["mara", "ula"] } });
    expect(claims[1].heard).toEqual({ kind: "members", members: ["mara", "ben"] });
    expect(claims[0].revision).toEqual({ swipeId: null, hash: revisionOf(window.messages[0]).hash });
  });

  it("downgrades an unknown member to unknown, refuses an out-of-window id and an invalid line", () => {
    const { claims, rejected } = resolveWitnessLines(["WITNESS m=4 heard=mara,ghost", "WITNESS m=9 heard=mara", "WITNESS heard=mara"], ctx());
    expect(claims).toEqual([expect.objectContaining({ messageId: 4, heard: { kind: "unknown" } })]);
    expect(rejected.map((entry) => entry.reason)).toEqual(['unknown member "ghost"', "message not in the read's window", "invalid witness line"]);
  });

  it("reads nobody as an empty set and keeps a message with no line out of the claims", () => {
    const { claims } = resolveWitnessLines(["WITNESS m=6 heard=none"], ctx());
    expect(claims).toEqual([expect.objectContaining({ messageId: 6, heard: { kind: "members", members: [] } })]);
  });

  it("anchors spans by exact substring; text before the first anchor stays uncovered", () => {
    const { claims, rejected } = resolveWitnessLines([
      "WITNESS m=5 mixed",
      'SPAN m=5 from="He leans close to Mara" heard=mara,ben',
      'SPAN m=5 from="Ben nods to the group." heard=all-present',
    ], ctx());
    expect(rejected).toEqual([]);
    const text = window.messages[1].text;
    const at = text.indexOf("He leans");
    expect(claims[0]).toMatchObject({ messageId: 5, mixed: true, spans: [
      { span: [0, at], heard: { kind: "all-present", members: ["mara", "ben", "ula"] } },
      { span: [at, text.length], heard: { kind: "members", members: ["mara", "ben"] } },
    ] });
    expect(resolveWitnessLines(['SPAN m=5 from="He leans close" heard=mara'], ctx()).claims[0].spans[0].span[0]).toBe(at);
  });

  it.each([
    ['SPAN m=5 from="whispers to the king" heard=mara', "span anchor not in the message"],
    ['SPAN m=5 from="e" heard=mara', "span anchor matches more than once"],
  ])("an unresolved anchor makes the whole message mixed and unknown: %s", (line, reason) => {
    const { claims, rejected } = resolveWitnessLines(["WITNESS m=5 mixed", line, 'SPAN m=5 from="He leans close to Mara" heard=mara'], ctx());
    expect(claims[0]).toMatchObject({ mixed: true, spans: [] });
    expect(rejected[0].reason).toBe(reason);
  });

  it("refuses overlapping anchors, a heard line beside spans, and conflicting heard lines", () => {
    const overlap = resolveWitnessLines(['SPAN m=5 from="Ben nods" heard=mara', 'SPAN m=5 from="Ben nods to" heard=ben'], ctx());
    expect(overlap.claims[0].spans).toEqual([]);
    expect(overlap.rejected[0].reason).toBe("overlapping span anchors");
    const both = resolveWitnessLines(["WITNESS m=5 heard=mara", 'SPAN m=5 from="He leans close" heard=mara'], ctx());
    expect(both.claims[0].mixed).toBe(true);
    expect(both.rejected[0].reason).toContain("mixed message takes span lines");
    const conflict = resolveWitnessLines(["WITNESS m=4 heard=mara", "WITNESS m=4 heard=ben"], ctx());
    expect(conflict.claims[0].heard).toEqual({ kind: "unknown" });
    expect(resolveWitnessLines(["WITNESS m=4 heard=mara,ben", "WITNESS m=4 heard=ben,mara"], ctx()).claims[0].heard).toEqual({ kind: "members", members: ["mara", "ben"] });
  });

  it("records no claims for a read that did not run or failed", () => {
    expect(witnessAudit("no-read", ["WITNESS m=4 heard=mara"], ctx()).audit).toMatchObject({ status: "no-read", claims: [], inputRange: { from: 4, to: 6 } });
    expect(witnessAudit("outage", ["WITNESS m=4 heard=mara"], ctx()).audit.claims).toEqual([]);
  });
});

describe("plan 42 B: the shared read carries witness lines only when the feature is on", () => {
  const read = (reply: string, witnessPresent: string[] | null, qualities = true, finish: "stop" | "length" = "stop") => {
    const s = story(qualities);
    const engine = new StoryEngine();
    engine.loadStory(s);
    const model = recordingModel(() => ({ text: reply, finish }));
    return runSharedRead({ story: s, state: engine.serialize(), priority: 0, reason: "p42", window, witnessPresent, ...readWith("p1"), model, ...(qualities ? {} : { scope: [] }) });
  };

  it("parses WITNESS and SPAN lines as witness lines, never unrecognized", () => {
    const parsed = parseSharedReadResponse('WITNESS m=4 heard=all-present\nSPAN m=5 from="x" heard=mara\nNO_DELTA', story());
    expect(parsed.witness).toHaveLength(2);
    expect(parsed.rejected).toEqual([]);
  });

  it("adds the section, hashes it, and lands accepted claims on the audit", async () => {
    const result = await read("WITNESS m=4 heard=all-present\nWITNESS m=6 heard=ula\nWITNESS m=9 heard=ben\nNO_DELTA", ["mara", "ben", "ula"]);
    expect(result.audit.prompt).toContain("WITNESS m=<message index>");
    expect(result.audit.witness).toMatchObject({ status: "accepted", inputRange: { from: 4, to: 6 } });
    expect(result.audit.witness?.claims.map((claim) => claim.messageId)).toEqual([4, 6]);
    expect(result.audit.witness?.inputRange.revisions.map((entry) => entry.revision.swipeId)).toEqual([null, 1, null]);
    expect(result.audit.rejected).toContainEqual({ line: "WITNESS m=9 heard=ben", reason: "message not in the read's window" });
    const s = story();
    const engine = new StoryEngine();
    engine.loadStory(s);
    const base = readContract({ story: s, state: engine.serialize() }, window, []);
    expect(hashContract({ ...base, witnessSection: renderWitnessContractSection() })).not.toBe(hashContract(base));
    expect(renderSharedReadPrompt({ ...base, witnessSection: renderWitnessContractSection(), deltasOnly: true })).not.toContain("WITNESS m=");
  });

  it("leaves the prompt and the audit alone when the feature is off", async () => {
    const result = await read("WITNESS m=4 heard=mara\nNO_DELTA", null);
    expect(result.audit.prompt).not.toContain("WITNESS m=");
    expect(result.audit.witness).toBeUndefined();
  });

  it("marks an empty-scope read no-read and a truncated read outage, with no claims", async () => {
    expect((await read("WITNESS m=4 heard=mara", ["mara"], false)).audit.witness).toMatchObject({ status: "no-read", claims: [] });
    expect((await read("WITNESS m=4 heard=mara", ["mara"], true, "length")).audit.witness).toMatchObject({ status: "outage", claims: [] });
  });
});

const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const MEMBERS = ["a", "b", "c"];

type Msg = { messageId: number; text: string; swipeId?: number };

const chatOf = (length: number, version = 0): Msg[] => Array.from({ length }, (_, id) => ({ messageId: id, text: `line ${id} v${version} said aloud. then a quiet word.` }));

const randomRead = (rand: () => number, chat: Msg[], to: number, index: number) => {
  const from = Math.max(0, to - 7);
  const messages = chat.slice(from, to + 1);
  const roll = rand();
  const status = roll < 0.1 ? "outage" as const : roll < 0.18 ? "no-read" as const : "accepted" as const;
  const lines = messages.flatMap((message) => {
    const pick = rand();
    if (pick < 0.15) return [];
    if (pick < 0.3) return [`WITNESS m=${message.messageId} mixed`, `SPAN m=${message.messageId} from="line ${message.messageId}" heard=a,b`, `SPAN m=${message.messageId} from="then a quiet" heard=a`];
    if (pick < 0.4) return [`WITNESS m=${message.messageId} heard=unknown`];
    return [`WITNESS m=${message.messageId} heard=${MEMBERS.filter(() => rand() < 0.6).join(",") || "none"}`];
  });
  return { readId: `r${index}`, audit: witnessAudit(status, lines, { from, to, messages, present: MEMBERS, resolveMember: (token) => (MEMBERS.includes(token) ? token : null) }).audit };
};

const lookups = (record: ReturnType<typeof createWitness>, length: number) => Array.from({ length }, (_, id) => ({
  state: witnessState(record, id),
  heard: MEMBERS.map((member) => witnessLookup(record, member, id)),
  span: MEMBERS.map((member) => witnessLookup(record, member, id, [0, 6])),
}));

const behaviour = (rows: ReturnType<typeof lookups>) => rows.map((row) => ({
  classified: row.state === "classified",
  heard: row.heard.map((value) => (value.state === "classified" ? value.heard : "unknown")),
  span: row.span.map((value) => (value.state === "classified" ? `${value.heard}:${value.insideHeardSpan}` : "unknown")),
}));

describe("plan 42 B Wf: every message has exactly one witness state", () => {
  it.each([1, 2, 3, 4])("seed %i: states stay in the six-state set over random reads and cuts", (seed) => {
    const rand = seeded(seed);
    const chat = chatOf(40);
    let record = createWitness();
    for (let index = 0; index < 30; index += 1) {
      const read = randomRead(rand, chat, Math.min(39, 3 + Math.floor(rand() * 37)), index);
      record = acceptWitnessRead(record, read.readId, read.audit);
      if (rand() < 0.15) record = rollbackWitness(record, Math.floor(rand() * 40));
      for (let id = 0; id < 45; id += 1) expect(WITNESS_STATES).toContain(witnessState(record, id));
    }
  });

  it("names planted no-read, outage, truncated and invalidated windows", () => {
    const chat = chatOf(30);
    const at = (from: number, to: number) => ({ from, to, messages: chat.slice(from, to + 1), present: MEMBERS, resolveMember: (token: string) => token });
    let record = createWitness();
    record = acceptWitnessRead(record, "ok", witnessAudit("accepted", ["WITNESS m=1 heard=a", "WITNESS m=2 heard=b"], at(0, 7)).audit);
    record = acceptWitnessRead(record, "empty", witnessAudit("no-read", [], at(8, 12)).audit);
    record = acceptWitnessRead(record, "cut", witnessAudit("outage", ["WITNESS m=14 heard=a"], at(13, 15)).audit);
    record = acceptWitnessRead(record, "late", witnessAudit("accepted", ["WITNESS m=17 heard=a"], at(16, 20)).audit);
    expect([1, 3, 9, 14, 17, 18, 25].map((id) => witnessState(record, id))).toEqual(["classified", "unknown", "no-read", "outage", "classified", "unknown", "pending"]);
    record = rollbackWitness(record, 19);
    expect([16, 17, 18, 19, 21].map((id) => witnessState(record, id))).toEqual(["invalidated", "invalidated", "invalidated", "pending", "pending"]);
    expect(witnessState(record, 1, { swipeId: 3, hash: "other" })).toBe("invalidated");
    expect(witnessState(record, 1, { swipeId: null, hash: revisionOf(chat[1]).hash })).toBe("classified");
  });
});

describe("plan 42 B Wr: rollback by input range equals the replay of the kept reads", () => {
  it.each([11, 12, 13, 14])("seed %i: every classified lookup matches replay after random cuts", (seed) => {
    const rand = seeded(seed);
    for (let round = 0; round < 12; round += 1) {
      const chat = chatOf(36, round);
      const reads = Array.from({ length: 14 }, (_, index) => randomRead(rand, chat, Math.min(35, 4 + index * 2 + Math.floor(rand() * 3)), index));
      const full = reads.reduce((record, read) => acceptWitnessRead(record, read.readId, read.audit), createWitness());
      const cut = Math.floor(rand() * 36);
      const rolled = rollbackWitness(full, cut);
      const kept = reads.filter((read) => read.audit.inputRange.to < cut);
      const replay = kept.reduce((record, read) => acceptWitnessRead(record, read.readId, read.audit), createWitness());
      expect(rolled.reads.map((read) => read.readId)).toEqual(replay.reads.map((read) => read.readId));
      expect(behaviour(lookups(rolled, 40))).toEqual(behaviour(lookups(replay, 40)));
    }
  });

  it("an edit inside a read's range invalidates its claims about earlier surviving messages", () => {
    const chat = chatOf(20);
    const at = (from: number, to: number) => ({ from, to, messages: chat.slice(from, to + 1), present: MEMBERS, resolveMember: (token: string) => token });
    let record = acceptWitnessRead(createWitness(), "early", witnessAudit("accepted", ["WITNESS m=3 heard=a,b"], at(0, 5)).audit);
    record = acceptWitnessRead(record, "late", witnessAudit("accepted", ["WITNESS m=3 heard=a", "WITNESS m=9 heard=c"], at(3, 10)).audit);
    expect(witnessLookup(record, "b", 3).heard).toBe("no");
    const rolled = rollbackWitness(record, 9);
    expect(rolled.reads.map((read) => read.readId)).toEqual(["early"]);
    expect(witnessLookup(rolled, "b", 3)).toMatchObject({ state: "classified", heard: "yes" });
    expect(witnessState(rolled, 7)).toBe("invalidated");
    expect(witnessRevision(rolled)).not.toBe(witnessRevision(record));
    const [tomb] = rolled.invalidated;
    const ids = Array.from({ length: tomb.to - tomb.from + 1 }, (_, offset) => tomb.from + offset);
    const lines = (named: number[]) => named.map((id) => `WITNESS m=${id} heard=a`);
    const almost = acceptWitnessRead(rolled, "almost", witnessAudit("accepted", lines(ids.slice(0, -1)), at(tomb.from, tomb.to)).audit);
    expect(almost.invalidated).toEqual(rolled.invalidated);
    const all = acceptWitnessRead(rolled, "all", witnessAudit("accepted", lines(ids), at(tomb.from, tomb.to)).audit);
    expect(all.invalidated).toEqual([]);
  });

  it("folding past the cap keeps every winning claim", () => {
    const rand = seeded(99);
    const chat = chatOf(40);
    const reads = Array.from({ length: 16 }, (_, index) => randomRead(rand, chat, Math.min(39, 4 + index * 2), index));
    const folded = reads.reduce((record, read) => acceptWitnessRead(record, read.readId, read.audit, 4), createWitness());
    const open = reads.reduce((record, read) => acceptWitnessRead(record, read.readId, read.audit, 999), createWitness());
    expect(folded.reads).toHaveLength(4);
    expect(folded.folded.length).toBeGreaterThan(0);
    expect(behaviour(lookups(folded, 40)).filter((row) => row.classified)).toEqual(behaviour(lookups(open, 40)).filter((row) => row.classified));
  });

  it("an accepted read is applied once, and sanitize keeps only well-formed rows", () => {
    const read = randomRead(seeded(5), chatOf(10), 8, 0);
    const once = acceptWitnessRead(createWitness(), read.readId, read.audit);
    expect(acceptWitnessRead(once, read.readId, read.audit)).toBe(once);
    expect(sanitizeWitness({ reads: [once.reads[0], { readId: 3 }], folded: [{}], invalidated: [{ from: 1, to: 2, readId: "x" }, { from: "a" }] }))
      .toEqual({ reads: once.reads, folded: [], invalidated: [{ from: 1, to: 2, readId: "x" }] });
    expect(sanitizeWitness("junk")).toEqual(createWitness());
  });
});

describe("plan 42 B: mixed messages answer per span", () => {
  const record = acceptWitnessRead(createWitness(), "r", witnessAudit("accepted", [
    "WITNESS m=5 mixed", 'SPAN m=5 from="Ben nods to the group." heard=all-present', 'SPAN m=5 from="He leans close to Mara" heard=mara,ben',
  ], ctx()).audit);
  const text = window.messages[1].text;
  const at = text.indexOf("He leans");

  it("a span wholly inside a heard part is a positive witness", () => {
    expect(witnessLookup(record, "mara", 5, [at + 3, at + 20])).toMatchObject({ state: "classified", heard: "yes", mixed: true, insideHeardSpan: true });
    expect(witnessLookup(record, "ula", 5, [at + 3, at + 20])).toMatchObject({ heard: "no", insideHeardSpan: false });
  });

  it("a span across parts, or the whole message, is never a positive witness", () => {
    expect(witnessLookup(record, "mara", 5, [at - 3, at + 3])).toMatchObject({ heard: "unknown", mixed: true, insideHeardSpan: false });
    expect(witnessLookup(record, "ula", 5)).toMatchObject({ heard: "unknown", mixed: true });
    expect(witnessParts(record, "ula", 5).map((part) => part.heard)).toEqual(["yes", "no"]);
  });
});
