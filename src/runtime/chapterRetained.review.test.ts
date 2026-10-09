jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [] })),
}));

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import { parseStoryV2OrThrow, type EngineState, type StoryV2 } from "@engine/index";
import type { DerivedRecord } from "@memory/derived";
import { memoryExtensionKey } from "@memory/index";
import type { ArcEntry, ChapterRecord, EpistemicEntry, LedgerEntry, MemoryEntry } from "@memory/types";
import { commitBridge, due, foldRange, recall } from "./chapterKit";
import type { ChapterHost, ChapterPort } from "./chapterPort";
import { chapterNumber, eraTarget, chapterSettings, type SealTarget } from "./chapters";
import { ChapterSeal, SEAL_CALL_BUDGET, type ChapterSealDeps, type SealAt, type SealJudge } from "./chapterSeal";
import { ModelCallError } from "@extraction/modelError";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";

const clone = () => JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as Omit<StoryV2, "checkpoints"> & { checkpoints: Array<Record<string, unknown>> };
const ROSTER = [{ id: "mara", name: "Mara" }, { id: "kael", name: "Kael" }, { id: "belle", name: "Belle" }];

const castStory = parseStoryV2OrThrow((() => {
  const raw = clone();
  raw.roster = ROSTER as StoryV2["roster"];
  raw.checkpoints = raw.checkpoints.map((checkpoint) => (checkpoint.id === "walls" ? { ...checkpoint, effects: { cast_changes: { disable: ["Mara", "Kael"] } } } : checkpoint));
  return raw as unknown as StoryV2;
})());

const chapterless = parseStoryV2OrThrow((() => {
  const raw = clone();
  delete raw.chapters;
  raw.checkpoints = raw.checkpoints.map(({ chapter: _chapter, ...checkpoint }) => checkpoint);
  return raw as unknown as StoryV2;
})());

const provenance = (messageId: number) => ({ source: "extractor", messageId, boundary: messageId, pass: "read", validity: "live" });

const row = (id: string, tier: MemoryEntry["tier"], text: string, messageId: number, extra: Partial<MemoryEntry> = {}) => ({
  id, tier, type: tier === "facts" ? "fact" : "detail", text, importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [],
  evidence: "", createdAt: messageId, messageId, recallCount: 0, provenance: provenance(messageId), ...extra,
}) as unknown as MemoryEntry;

const ledgerRow = (id: string, entity: string, messageId: number) => ({
  id, entity, entityType: "character", field: "condition", value: `long value ${"x".repeat(200)}`, createdAt: messageId, messageId, provenance: provenance(messageId),
}) as unknown as LedgerEntry;

const record = (id: string, from: number, to: number) => ({
  id, chapterId: id.split("#")[0], part: Number(id.split("#")[1]), title: "Arrival at Harrowgate", playerTitle: "Arrival", range: { from, to }, boundaries: { from, to },
  checkpoints: [], summary: `summary of ${id} ${"words ".repeat(30)}`, short: `short ${id}.`, consequences: [], people: [], open: [], blackboardDelta: {}, blackboardAt: {},
  status: "sealed", provenance: provenance(to), tokens: { summary: 40, short: 3 }, sealedAt: { boundary: to, messageId: to, at: 0, pathLength: 2 },
}) as unknown as ChapterRecord;

const later: EngineState = {
  blackboard: { values: { step: 9 }, versions: {}, latched: {} }, activeCheckpointId: "walls", visitedAnchors: [], visitedPath: ["gate", "market", "fire", "walls"],
  boundary: 30, checkpointStartedBoundary: 30, checkpointStartedAt: 0, checkpointStartedMessageId: 99, lastMessageId: 99, chatLength: 100,
};

const WRITTEN = "SUMMARY:\nthe gate held through the night.\nSHORT:\nthe gate held.";

const recordReply = (cite: string) => [
  "SUMMARY:", "The party held the gate through the night and saw the dawn come over the walls.", "SHORT:", "They held the gate.",
  "CONSEQUENCES:", `- The gate held against the raiders [src: ${cite}]`, "PEOPLE:", "OPEN:",
].join("\n");

interface HarnessOptions {
  story?: ReturnType<typeof parseStoryV2OrThrow>;
  memory?: Partial<MemoryRuntimeState>;
  reply?: (prompt: string) => string;
  judge?: SealJudge | null;
  chapters?: Record<string, unknown>;
  finish?: "length";
}

const harness = (options: HarnessOptions = {}) => {
  const context: RunContext = { chatId: "chat-a", storyId: "chapters-mini", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  let memory = {
    entries: [], arcs: [], ledger: [], epistemic: [], derived: [] as DerivedRecord[], chapters: [] as ChapterRecord[], chronicle: { eras: [] },
    shortTermSummaryEnd: -1, storyStart: 0, settings: { enabled: true, chapters: { seal: true, ...(options.chapters ?? {}) } }, ...options.memory,
  } as unknown as MemoryRuntimeState;
  const prompts: string[] = [];
  const announced: string[] = [];
  const journaled: string[] = [];
  let derivedId = 0;
  const story = options.story ?? castStory;
  const deps: ChapterSealDeps = {
    getStory: () => story,
    getState: () => later,
    memory: () => memory,
    patch: (next) => { memory = { ...memory, ...next }; },
    record: (input) => { derivedId += 1; memory = { ...memory, derived: [...memory.derived, { ...input, id: `d${derivedId}`, boundary: 0, messageId: input.messageId ?? 0 } as DerivedRecord] }; },
    model: () => async (prompt: string) => { prompts.push(prompt); return { text: options.reply?.(prompt) ?? "", ...(options.finish ? { finish: options.finish } : {}) } as never; },
    ownership: () => ownership,
    closeScene: async () => {},
    sceneStart: (to) => to + 1,
    summarizeArcs: async () => true,
    updateInjection: () => {},
    save: async () => {},
    roster: () => ROSTER,
    playerName: () => "You",
    journal: (summary, note) => { journaled.push(`${summary} | ${note ?? ""}`); },
    announce: async (text) => { announced.push(text); }, resting: () => (text) => text,
    judge: () => options.judge ?? null,
  };
  return { seal: new ChapterSeal(deps), memory: () => memory, prompts, announced, journaled, context };
};

const siege = castStory.chapterById!.siege;
const arrival = castStory.chapterById!.arrival;
const atWalls = (messageId: number): SealAt => ({ boundary: messageId, messageId, pathLength: 3, path: ["gate", "market", "walls"], activeCheckpointId: "walls", blackboard: { step: 3 } });
const atDawn = (messageId: number): SealAt => ({ boundary: messageId, messageId, pathLength: 5, path: ["gate", "market", "fire", "walls", "dawn"], activeCheckpointId: "dawn", blackboard: { step: 4 } });

const oversize = (from: number) => [
  ...Array.from({ length: 30 }, (_, index) => row(`sc${index}`, "scene_history", `scene ${index} ${"the gate and the walls and the long night ".repeat(20)}`, from + 1)),
  ...Array.from({ length: 6 }, (_, index) => row(`fa${index}`, "facts", `fact ${index} ${"a durable fact about the town ".repeat(12)}`, from + 2)),
  ...Array.from({ length: 6 }, (_, index) => row(`de${index}`, "session_details", `detail ${index} ${"a small detail of the camp ".repeat(12)}`, from + 3)),
];

const mapThenRecord = (prompt: string) => {
  if (prompt.includes("You are condensing part")) {
    const first = prompt.match(/^\[([^\]]+)\] \(scene\)/m)?.[1];
    return first ? `- (scene) The party crossed the gate [src: ${first}]` : "";
  }
  const cite = prompt.match(/^\[(p\d+\.\d+)\] \(scene\)/m)?.[1] ?? "none";
  return recordReply(cite);
};

const recordPrompts = (prompts: string[]) => prompts.filter((prompt) => prompt.includes("record of a finished chapter"));

describe("AS-14 map-reduce: an oversize chapter is reduced, never trimmed", () => {
  it("the record is written from every input category, cites the original ids and keeps every input in its provenance", async () => {
    const h = harness({ memory: { entries: oversize(0), ledger: [ledgerRow("lg1", "Mara", 2), ledgerRow("lg2", "Kael", 3)] }, reply: mapThenRecord });
    const sealed = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(sealed?.status).toBe("sealed");
    const written = recordPrompts(h.prompts).at(-1) ?? "";
    expect(["(scene)", "(fact)", "(detail)", "(ledger)", "(state)"].filter((kind) => !written.includes(kind))).toEqual([]);
    expect(h.prompts.filter((prompt) => prompt.includes("You are condensing part")).length).toBeGreaterThan(1);
    expect(sealed?.consequences[0].sources[0]).toMatch(/^sc\d+$/);
    expect(sealed?.provenance.inputs?.length).toBe(30 + 6 + 6 + 2 + 1);
  });

  it("a chat that moves during a map call seals nothing", async () => {
    let h: ReturnType<typeof harness> | null = null;
    h = harness({ memory: { entries: oversize(0) }, reply: (prompt) => { if (h && prompt.includes("You are condensing part")) h.context.chatId = "chat-b"; return mapThenRecord(prompt); } });
    expect(await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10))).toBeNull();
    expect(recordPrompts(h.prompts)).toEqual([]);
    expect(h.memory().chapters).toEqual([]);
  });

  it("control: an input that fits takes one record call and no map call", async () => {
    const h = harness({ memory: { entries: [row("sc0", "scene_history", "a short scene at the gate", 1)] }, reply: () => recordReply("sc0") });
    expect((await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10)))?.status).toBe("sealed");
    expect(h.prompts.length).toBe(1);
  });

  it("Q-M7: the call budget is the plan floor, six (user decision 2026-10-03)", () => {
    expect(SEAL_CALL_BUDGET).toBe(6);
  });

  it("Q-M7: a chapter that runs over the budget is refused with a reason, not sealed: every answer cut, at most six calls, degraded, nothing folded", async () => {
    const h = harness({ memory: { entries: oversize(0) }, finish: "length" });
    const sealed = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(h.prompts.length).toBe(SEAL_CALL_BUDGET);
    expect(sealed?.status).toBe("degraded");
    expect(sealed?.status).not.toBe("sealed");
    expect(h.memory().entries.filter((entry) => entry.foldedInto)).toEqual([]);
    expect(h.journaled.join("\n")).toContain("call budget of 6 spent, nothing more asked");
  });

  it("Q-M7: a final, oversize seal whose every answer fails makes at most SEAL_CALL_BUDGET model calls, era merges and saga included", async () => {
    const previous = [record("arrival#1", 0, 1), record("arrival#2", 2, 3), record("arrival#3", 4, 5)];
    const h = harness({ memory: { entries: oversize(6), chapters: previous }, chapters: { chronicleTokens: 1 } });
    const sealed = await h.seal.seal({ chapter: siege, part: 1, final: true }, atDawn(20));
    expect(sealed?.status).toBe("degraded");
    expect(sealed?.epilogue).toBeTruthy();
    expect(h.prompts.length).toBeLessThanOrEqual(SEAL_CALL_BUDGET);
    expect((h.memory().chronicle?.eras ?? []).length).toBeGreaterThan(0);
  });
});

const noul = (p: number) => ({ answers: { "line:0": { type: "noul", noul: p } }, model: "jev", latencyMs: 1, stateChars: 1, questionCount: 1, cached: false });

const judgeOf = (answer: () => unknown, active = true) => ({ active: jest.fn(() => active), ask: jest.fn(async () => answer()) }) as unknown as SealJudge & { ask: jest.Mock; active: jest.Mock };

describe("AS-14 D2 step 5: judge memoryVerify inside the seal", () => {
  const memory = { entries: [row("sc0", "scene_history", "the raiders broke on the gate", 1)] };

  it("a consequence the judge finds unsupported is re-asked once with the failure listed, then degrades", async () => {
    const judge = judgeOf(() => noul(0.05));
    const h = harness({ memory, reply: () => recordReply("sc0"), judge });
    const sealed = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(sealed?.status).toBe("degraded");
    expect(judge.ask).toHaveBeenCalledTimes(2);
    expect(judge.ask.mock.calls[0][0]).toBe("memoryVerify");
    expect(JSON.stringify(judge.ask.mock.calls[0][1])).toContain("the raiders broke on the gate");
    expect(recordPrompts(h.prompts)[1]).toContain("consequence 1 is not supported by the inputs it cites");
  });

  it("control: a supported consequence seals on the first call", async () => {
    const judge = judgeOf(() => noul(0.95));
    const h = harness({ memory, reply: () => recordReply("sc0"), judge });
    expect((await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10)))?.status).toBe("sealed");
    expect(judge.ask).toHaveBeenCalledTimes(1);
  });

  it("never blocks: a judge fallback (no answers) or a use switched off keeps the code-only verify", async () => {
    const fallback = judgeOf(() => ({ ...noul(0), answers: null, fallback: "unavailable" }));
    expect((await harness({ memory, reply: () => recordReply("sc0"), judge: fallback }).seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10)))?.status).toBe("sealed");
    const off = judgeOf(() => noul(0), false);
    expect((await harness({ memory, reply: () => recordReply("sc0"), judge: off }).seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10)))?.status).toBe("sealed");
    expect(off.ask).not.toHaveBeenCalled();
  });

  it("a chat that moves while the judge answers seals nothing", async () => {
    let h: ReturnType<typeof harness> | null = null;
    const judge = judgeOf(() => { if (h) h.context.chatId = "chat-b"; return noul(0.95); });
    h = harness({ memory, reply: () => recordReply("sc0").replace("PEOPLE:", "- The walls stood [src: sc0]\nPEOPLE:"), judge });
    expect(await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10))).toBeNull();
    expect(judge.ask).toHaveBeenCalledTimes(1);
    expect(h.memory().chapters).toEqual([]);
  });
});

const belief = (id: string, tag: EpistemicEntry["tag"], subject: string, content: string, hiddenFrom?: string): EpistemicEntry => ({
  id, tag, subject, content, ...(hiddenFrom ? { hiddenFrom } : {}), createdAt: 1, messageId: 3, provenance: provenance(3) as EpistemicEntry["provenance"],
});

describe("AS-14 D3: the seal folds the secrets of members who leave together", () => {
  const epistemic = [
    belief("h1", "hiding", "Mara", "the stolen seal", "Kael"),
    belief("h2", "hiding", "Mara", "the map", "Belle"),
    belief("k1", "knows", "Mara", "where Kael sleeps"),
  ];

  it("folds into the record what the next chapter's cast_changes takes away, records it, and unseal gives it back", async () => {
    const h = harness({ memory: { epistemic }, reply: () => WRITTEN });
    const sealed = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(h.memory().epistemic.filter((entry) => entry.foldedInto).map((entry) => entry.id)).toEqual(["h1"]);
    expect(h.memory().epistemic.find((entry) => entry.id === "h1")?.foldedInto).toBe(sealed?.id);
    expect(h.memory().derived.find((entry) => entry.kind === "chapter_seal")?.inputs).toContain("h1");
    expect(await h.seal.unseal(sealed!.id)).toBe(true);
    expect(h.memory().epistemic.some((entry) => entry.foldedInto)).toBe(false);
  });

  it("control: a chapter entered without cast_changes folds no knowledge", async () => {
    const h = harness({ memory: { epistemic }, reply: () => WRITTEN });
    await h.seal.seal({ chapter: arrival, part: 1, final: false }, { ...atWalls(10), activeCheckpointId: "fire" });
    expect(h.memory().epistemic.some((entry) => entry.foldedInto)).toBe(false);
  });
});

const scenes = (count: number, extra: Partial<MemoryEntry> = {}) => Array.from({ length: count }, (_, index) => row(`sh${index}`, "scene_history", `scene ${index}`, index * 10, extra));
const resolved = (count: number) => Array.from({ length: count }, (_, index): ArcEntry => ({
  id: `arc${index}`, text: `thread ${index}`, status: "resolved", entities: [], openedAt: index, openedMessageId: index, resolvedAt: index + 1, resolvedMessageId: index + 1,
}));
const sceneSummary = (to: number): DerivedRecord => ({ id: `ss${to}`, kind: "scene_summary", boundary: to, messageId: to, inputs: [], range: { from: 0, to } });

describe("AS-14 D11: chapterless era seals", () => {
  const settings = chapterSettings({ eraSeals: true, foldEras: false });
  const sources = { entries: scenes(25), arcs: resolved(21), derived: [sceneSummary(305)], storyStart: 0 };
  const path = ["gate", "market", "fire", "walls"];

  it("is due at the first scene break after all three thresholds, titled from the checkpoints visited", () => {
    const target = eraTarget(chapterless, [], sources, 320, path, settings);
    expect(target?.chapter).toEqual(expect.objectContaining({ id: "era-1", title: "The Gate to The Walls", seal: { record_style: "chronicle", fold_messages: false } }));
    expect(target?.final).toBe(false);
  });

  it("controls: every threshold, the setting and a chaptered story each hold it back", () => {
    expect(eraTarget(chapterless, [], sources, 299, path, settings)).toBeNull();
    expect(eraTarget(chapterless, [], { ...sources, entries: scenes(24) }, 320, path, settings)).toBeNull();
    expect(eraTarget(chapterless, [], { ...sources, entries: scenes(30, { pinned: true }) }, 320, path, settings)).toBeNull();
    expect(eraTarget(chapterless, [], { ...sources, arcs: resolved(20) }, 320, path, settings)).toBeNull();
    expect(eraTarget(chapterless, [], { ...sources, derived: [sceneSummary(299)] }, 320, path, settings)).toBeNull();
    expect(eraTarget(chapterless, [], sources, 320, path, chapterSettings({ eraSeals: false }))).toBeNull();
    expect(eraTarget(castStory, [], sources, 320, path, settings)).toBeNull();
  });

  it("the second era counts from the first one's end", () => {
    const first = { ...record("era-1#1", 0, 320), chapterId: "era-1" } as ChapterRecord;
    expect(eraTarget(chapterless, [first], { ...sources, derived: [sceneSummary(600)] }, 600, path, settings)).toBeNull();
    expect(eraTarget(chapterless, [first], { ...sources, derived: [sceneSummary(640)] }, 640, path, settings)?.chapter.id).toBe("era-2");
  });

  it("the kit's due() offers an era for a chapterless story and a chapter seal otherwise", () => {
    const host = (story: typeof chapterless, chapters: Record<string, unknown>) => ({
      deps: { getStory: () => story, getState: () => ({ ...later, lastMessageId: 320, visitedPath: path, activeCheckpointId: "walls" }) },
      memory: () => ({ ...sources, chapters: [], settings: { chapters } }),
    }) as unknown as ChapterHost;
    expect(due(host(chapterless, { eraSeals: true }))?.chapter.id).toBe("era-1");
    expect(due(host(chapterless, { seal: true, eraSeals: false }))).toBeNull();
    expect(due(host(castStory, { seal: true, eraSeals: true }))?.chapter.id).toBe("arrival");
  });

  it("seals an era as a chronicle record with no bridge and no title card; it folds only with foldEras and re-seals", async () => {
    const target = eraTarget(chapterless, [], sources, 320, path, settings) as SealTarget;
    const h = harness({ story: chapterless, memory: { entries: [row("sc0", "scene_history", "a quiet scene", 5)] }, reply: () => recordReply("sc0") });
    const sealed = await h.seal.seal(target, { ...atWalls(320), path });
    expect(sealed).toEqual(expect.objectContaining({ id: "era-1#1", chapterId: "era-1", status: "sealed" }));
    expect(sealed?.bridge).toBeUndefined();
    expect(h.announced).toEqual([]);
    expect(h.prompts[0]).toContain("Keep the SUMMARY terse");
    expect(h.memory().entries[0].foldedInto).toBe("era-1#1");
    expect(foldRange([sealed!], chapterless)).toEqual([]);
    expect(foldRange([sealed!], chapterless, true)).toEqual([{ from: 0, to: 314 }]);
    expect(chapterNumber(chapterless, "era-2")).toBe(2);
    expect((await h.seal.reseal("era-1#1"))?.id).toBe("era-1#1");
  });
});

const folded = (id: string, text: string, entities: string[]) => row(id, "facts", text, 2, { entities, foldedInto: "arrival#1" });

interface RecallOptions {
  chapters?: Record<string, unknown>;
  current?: string;
  vectors?: { present: boolean; match?: number[]; onInsert?: () => void };
  entries?: MemoryEntry[];
}

const recallPort = (options: RecallOptions = {}) => {
  const context: RunContext = { chatId: "chat-a", storyId: "chapters-mini", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const memory = {
    entries: options.entries ?? [
      folded("f1", "Ronan swore an oath to the guild", ["Ronan"]),
      folded("f2", "Ronan lost his left hand to the wyrm", ["Ronan"]),
      folded("f3", "the quartermaster owes the guild silver", ["quartermaster"]),
      row("f4", "facts", "Ronan stands in the war camp", 2, { entities: ["Ronan"] }),
    ],
    arcs: [], chapters: [{ ...record("arrival#1", 0, 9) }],
    settings: { enabled: true, chapters: options.chapters ?? { archiveRecall: true }, injectionDepths: { scene_history: 6 } },
  } as unknown as MemoryRuntimeState;
  const prompt = { setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn() };
  const journal = jest.fn();
  const updateInjection = jest.fn();
  const vectors = {
    source: "transformers",
    capabilityState: jest.fn(async () => (options.vectors?.present ? "present" : "absent")),
    vectorInsert: jest.fn(async () => { options.vectors?.onInsert?.(); }),
    vectorQuery: jest.fn(async () => (options.vectors?.match ?? []).map((index) => ({ index }))),
    vectorPurge: jest.fn(async () => {}),
  };
  const key = memoryExtensionKey("scene_history");
  const port = {
    recalled: false,
    host: {
      coordinator: { updateInjection, injector: { restingEntries: (entries: MemoryEntry[]) => entries } },
      memory: () => memory,
      deps: {
        getStory: () => castStory,
        getState: () => ({ ...later, activeCheckpointId: "walls" }),
        ownership,
        chapterHost: { journal },
        hosts: { vectors, prompt, injection: { readInjectedPromptBlocks: () => (options.current === undefined ? [] : [{ key, value: options.current }]) } },
      },
    },
  };
  return { port: port as unknown as ChapterPort, raw: port, prompt, journal, updateInjection, vectors, key, context };
};

const turn = (mes: string) => [{ is_user: false, mes: "The guild hall is quiet." }, { is_user: true, mes }];

describe("AS-14 D10: archive recall rides the scene-history block for one generation", () => {
  it("is on by default (owner decision 2026-10-09), and recalls nothing with recall and fold switched off", async () => {
    expect(chapterSettings({}).archiveRecall).toBe(true);
    const r = recallPort({ chapters: { archiveRecall: false, fold: false } });
    expect(await recall(r.port, turn("Where is Ronan?"), "normal")).toBe(0);
    expect(r.prompt.setStoryExtensionPrompt).not.toHaveBeenCalled();
  });

  it("appends the recalled lines to the scene-history block, journals them, and the close of the generation restores the block", async () => {
    const r = recallPort({ current: "[Recent scenes]\n- the war camp", chapters: { archiveRecall: true } });
    expect(await recall(r.port, turn("Ronan, how did you lose your hand to the wyrm?"), "normal")).toBe(2);
    const [key, text, depth] = r.prompt.setStoryExtensionPrompt.mock.calls[0];
    expect(key).toBe(r.key);
    expect(depth).toBe(6);
    expect(text.split("\n")).toEqual(["[Recent scenes]", "- the war camp", "Recalled from Arrival: Ronan lost his left hand to the wyrm", "Recalled from Arrival: Ronan swore an oath to the guild"]);
    expect(r.journal).toHaveBeenCalledWith("recalled 2 archived memories", "arrival#1:f2, arrival#1:f1");
    expect(r.raw.recalled).toBe(true);
    commitBridge(r.port, true);
    expect(r.updateInjection).toHaveBeenCalledTimes(1);
    expect(r.raw.recalled).toBe(false);
  });

  it("the checkpoint objective counts as a mention, and an empty block gets its label", async () => {
    const r = recallPort({ entries: [folded("q1", "the quartermaster owes the guild silver", ["walls"])] });
    expect(await recall(r.port, turn("Onward."), "normal")).toBe(1);
    expect(r.prompt.setStoryExtensionPrompt.mock.calls[0][1]).toMatch(/\nRecalled from Arrival: the quartermaster owes the guild silver$/);
    expect(r.prompt.setStoryExtensionPrompt.mock.calls[0][1].split("\n")[0]).not.toBe("Recalled from Arrival: the quartermaster owes the guild silver");
  });

  it("with vectors present the band decides the order, and Jaccard is only the fallback", async () => {
    const r = recallPort({ current: "x", vectors: { present: true, match: [0] } });
    await recall(r.port, turn("Ronan, how did you lose your hand to the wyrm?"), "normal");
    expect(r.vectors.vectorQuery).toHaveBeenCalled();
    expect(r.prompt.setStoryExtensionPrompt.mock.calls[0][1].split("\n")[1]).toBe("Recalled from Arrival: Ronan swore an oath to the guild");
    expect(r.vectors.vectorPurge).toHaveBeenCalled();
  });

  it("T2-3: the message fold turns recall on, because a folded chapter leaves the prompt nothing else to recall from", async () => {
    const r = recallPort({ current: "x", chapters: { fold: true } });
    expect(await recall(r.port, turn("Ronan, how did you lose your hand to the wyrm?"), "normal")).toBe(2);
  });

  it("bounded by recallTokens", async () => {
    const r = recallPort({ current: "x", chapters: { archiveRecall: true, recallTokens: 14 } });
    expect(await recall(r.port, turn("Ronan, how did you lose your hand to the wyrm?"), "normal")).toBe(1);
  });

  it("controls: a quiet run, a live-only mention and a chat that moves during the vectors read write nothing", async () => {
    const quiet = recallPort({ current: "x" });
    expect(await recall(quiet.port, turn("Ronan?"), "quiet")).toBe(0);
    const live = recallPort({ current: "x", entries: [row("f4", "facts", "Ronan stands in the war camp", 2, { entities: ["Ronan"] })] });
    expect(await recall(live.port, turn("Ronan?"), "normal")).toBe(0);
    let moved: ReturnType<typeof recallPort> | null = null;
    moved = recallPort({ current: "x", vectors: { present: true, match: [0], onInsert: () => { if (moved) moved.context.chatId = "chat-b"; } } });
    expect(await recall(moved.port, turn("Ronan?"), "normal")).toBe(0);
    [quiet, live, moved].forEach((r) => expect(r.prompt.setStoryExtensionPrompt).not.toHaveBeenCalled());
    expect(moved.journal).not.toHaveBeenCalled();
  });
});

describe("AS-14 fault shapes of the seal unit", () => {
  const memory = { entries: [row("sc0", "scene_history", "the raiders broke on the gate", 1)] };
  const target = { chapter: arrival, part: 1, final: false };

  it("a reply with no record is re-asked once, then a degraded record is written", async () => {
    const h = harness({ memory, reply: () => "nonsense words without sections" });
    expect((await h.seal.seal(target, atWalls(10)))?.status).toBe("degraded");
    expect(recordPrompts(h.prompts)[1]).toContain("no SUMMARY section");
  });

  it("with the backend answering nothing the chapter still seals, degraded, and folds nothing: its rows keep steering (T2-1)", async () => {
    const h = harness({ memory, reply: () => "" });
    const sealed = await h.seal.seal(target, atWalls(10));
    expect(sealed?.status).toBe("degraded");
    expect(h.memory().entries[0].foldedInto).toBeUndefined();
  });

  it("a model error leaves no record and frees the seal for the next boundary", async () => {
    let fail = true;
    const h = harness({ memory, reply: () => { if (fail) throw new Error("backend 500"); return recordReply("sc0"); } });
    await expect(h.seal.seal(target, atWalls(10))).rejects.toThrow("backend 500");
    expect(h.memory().chapters).toEqual([]);
    expect(h.memory().entries[0].foldedInto).toBeUndefined();
    fail = false;
    expect((await h.seal.seal(target, atWalls(10)))?.status).toBe("sealed");
  });

  it("a model call aborted by a lapsed run seals nothing", async () => {
    let h: ReturnType<typeof harness> | null = null;
    h = harness({ memory, reply: () => { if (h) h.context.chatId = "chat-b"; throw new ModelCallError("lapsed", "lapsed"); } });
    expect(await h.seal.seal(target, atWalls(10))).toBeNull();
    expect(h.memory().chapters).toEqual([]);
    expect(h.memory().derived).toEqual([]);
  });
});
