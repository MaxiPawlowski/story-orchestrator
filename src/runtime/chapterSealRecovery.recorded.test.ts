jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [] })),
}));

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import * as recorded from "../../test/fixtures/t2-1-seal.memory.json";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { parseStoryV2OrThrow, type EngineState, type StoryV2 } from "@engine/index";
import { maxTokensCap, maxTokensFor, MAX_TOKENS_TABLE } from "@extraction/callBudget";
import type { ModelAsk } from "@extraction/modelRoute";
import { assembleChapterInput } from "@memory/chapterInput";
import { buildChapterRecordPrompt, CHAPTER_RECORD_BOUNDS, degradedChapterRecord } from "@memory/chapterRecord";
import { buildChapterMapPrompt, MAP_BOUNDS } from "@memory/chapterReduce";
import type { DerivedRecord } from "@memory/derived";
import type { ArcEntry, ChapterRecord, LedgerEntry, MemoryEntry } from "@memory/types";
import { foldPreview } from "./chapterKit";
import { ChapterSeal, MAP_MAX_TOKENS, type ChapterSealDeps, type SealAt } from "./chapterSeal";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";

const OLD_MAP_TOKENS = 768;
const OLD_RECORD_FLOOR = 1024;
const TOKENS_PER_WORD = 2;
const TOKENS_PER_CITATION = 25;

const story = parseStoryV2OrThrow(JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2);
const arrival = story.chapterById!.arrival;

const liveRows = (recorded.entries as unknown as MemoryEntry[]).map((entry) => ({
  ...entry, foldedInto: undefined, provenance: { ...entry.provenance, validity: "live" as const },
})) as MemoryEntry[];
const recordedArcs = (recorded.arcs as unknown as ArcEntry[]).map((arc) => ({ ...arc, foldedInto: undefined })) as ArcEntry[];

const recordedInput = () => assembleChapterInput({
  range: { from: 0, to: 121 }, entries: liveRows, arcs: recordedArcs, ledger: recorded.ledger as unknown as LedgerEntry[],
  blackboardBefore: {}, blackboardAfter: recorded.record.blackboardAt, places: ["The Guild Hall", "Driftmere", "Home to Nightriver"],
  roster: [{ id: "belle", name: "Belle" }, { id: "dalan", name: "Dalan" }, { id: "riyo", name: "Riyo" }, { id: "naomi", name: "Naomi" }], previous: null,
});

const recordBound = () => {
  const b = CHAPTER_RECORD_BOUNDS;
  const words = b.summaryWords + b.shortWords + b.consequences * b.consequenceWords + b.people * b.personWords + b.open * b.openWords;
  return words * TOKENS_PER_WORD + b.consequences * 2 * TOKENS_PER_CITATION + b.open * TOKENS_PER_CITATION;
};

const mapBound = () => MAP_BOUNDS.lines * (MAP_BOUNDS.words * TOKENS_PER_WORD + 2 * TOKENS_PER_CITATION);

describe("T2-1: the chapter seal's budget (journal.jsonl:3043-3047, test/fixtures/t2-1-seal.memory.json)", () => {
  it("every recorded seal reply ended at its old output limit: 2 map calls at 768, 2 record calls at the 1024 floor", () => {
    const map = recorded.sealCalls.filter((call) => call.step === "map").map((call) => call.output);
    const write = recorded.sealCalls.filter((call) => call.step === "write").map((call) => call.output);
    expect(map).toEqual([OLD_MAP_TOKENS, OLD_MAP_TOKENS]);
    expect(write).toEqual([OLD_RECORD_FLOOR, OLD_RECORD_FLOOR]);
  });

  it("the record prompt bounds its own length, and a compliant record fits the first ask", () => {
    const prompt = buildChapterRecordPrompt("Adolion", "The Adventurer's Guild", recordedInput());
    expect(prompt).toContain(`At most ${CHAPTER_RECORD_BOUNDS.consequences} CONSEQUENCES lines and ${CHAPTER_RECORD_BOUNDS.people} PEOPLE lines`);
    expect(prompt).toContain(`In OPEN list at most ${CHAPTER_RECORD_BOUNDS.open} threads`);
    expect(prompt.split("OPEN THREADS:")[1].trim().split("\n").length).toBe(40);
    expect(recordBound()).toBeLessThan(maxTokensFor("chapterSeal", 0));
  });

  it("the map prompt bounds its own length, and a compliant digest fits MAP_MAX_TOKENS", () => {
    const input = recordedInput();
    expect(buildChapterMapPrompt("Adolion", "The Adventurer's Guild", input.items.slice(0, 20), 1, 2)).toContain(`Write at most ${MAP_BOUNDS.lines} lines`);
    expect(mapBound()).toBeLessThan(MAP_MAX_TOKENS);
  });

  it("the re-ask after a cut reply has room for twice the longest reply ever cut", () => {
    expect(maxTokensCap("chapterSeal")).toBeGreaterThanOrEqual(2 * OLD_RECORD_FLOOR);
    expect(MAP_MAX_TOKENS * 2).toBeGreaterThanOrEqual(2 * OLD_MAP_TOKENS);
  });

  it("control: the old table and map limit hold neither bound", () => {
    expect(recordBound()).toBeGreaterThan(OLD_RECORD_FLOOR);
    expect(mapBound()).toBeGreaterThan(OLD_MAP_TOKENS);
    expect(MAX_TOKENS_TABLE.chapterSeal).toEqual({ ratio: 0.5, floor: 2560, cap: 4096 });
  });
});

describe("T2-1: a seal written without the model spans the whole act", () => {
  it("the fallback summary runs from Driftmere to the estate; the recorded one started mid-descent", () => {
    const fallback = degradedChapterRecord(recordedInput()).summary;
    expect(fallback).toContain("Serenola");
    expect(fallback).toMatch(/estate/);
    expect(fallback.split(/\s+/).length).toBeLessThanOrEqual(CHAPTER_RECORD_BOUNDS.summaryWords + 1);
    expect(recorded.record.summary.startsWith("The party advanced down a twisting tunnel")).toBe(true);
    expect(recorded.record.summary).not.toContain("Serenola");
  });
});

const row = (id: string, messageId: number): MemoryEntry => ({
  id, tier: "scene_history", text: `the raiders broke on the gate, scene ${id}`, type: "event", importance: 2, expiration: "permanent", entities: [], confidence: 1,
  activationTriggers: [], evidence: "", createdAt: messageId, messageId, recallCount: 0,
  provenance: { source: "extractor", messageId, boundary: messageId, pass: "scene-summary", validity: "live" },
}) as MemoryEntry;

const complete = [
  "SUMMARY:", "The party held the gate through the night and saw the dawn come over the walls.", "SHORT:", "They held the gate.",
  "CONSEQUENCES:", "- The gate held against the raiders [src: s1]", "PEOPLE:", "OPEN:",
].join("\n");

type Reply = { text: string; finish: "stop" | "length" };

const harness = (replies: Reply[]) => {
  const context: RunContext = { chatId: "chat-a", storyId: "chapters-mini", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  let memory = {
    entries: [row("s1", 2), row("s2", 6)], arcs: [], ledger: [], epistemic: [], derived: [] as DerivedRecord[], chapters: [] as ChapterRecord[], chronicle: { eras: [] },
    shortTermSummaryEnd: -1, storyStart: 0, settings: { enabled: true, chapters: { seal: true, fold: true } },
  } as unknown as MemoryRuntimeState;
  const asks: number[] = [];
  const journal = jest.fn();
  const queue = [...replies];
  const deps: ChapterSealDeps = {
    getStory: () => story, getState: () => ({ activeCheckpointId: "fire", visitedPath: ["gate", "market", "fire"] }) as unknown as EngineState, memory: () => memory,
    patch: (next) => { memory = { ...memory, ...next }; },
    record: (input) => { memory = { ...memory, derived: [...memory.derived, { ...input, id: `d${memory.derived.length}`, boundary: 0, messageId: input.messageId ?? 0 } as DerivedRecord] }; },
    model: () => async (_prompt: string, ask: ModelAsk) => { asks.push(ask.maxTokens ?? 0); return queue.shift() ?? { text: complete, finish: "stop" }; },
    ownership: () => ownership, closeScene: async () => {}, sceneStart: (to) => to + 1, summarizeArcs: async () => true, updateInjection: () => {}, save: async () => {},
    roster: () => [{ id: "kael", name: "Kael" }], playerName: () => "Mara", journal, announce: async () => {}, resting: () => (text) => text,
  };
  const at: SealAt = { boundary: 3, messageId: 9, pathLength: 3, path: ["gate", "market", "fire"], activeCheckpointId: "fire", blackboard: {} };
  return { seal: () => new ChapterSeal(deps).seal({ chapter: arrival, part: 1, final: false }, at), memory: () => memory, asks, journal };
};

const cut: Reply = { text: "SUMMARY:\nThe party held the gate through the", finish: "length" };

describe("T2-1: a cut seal reply is asked again at the cap, and a cut record is never stored or folded", () => {
  it("cut, then complete: the record is written from the re-ask at the cap", async () => {
    const h = harness([cut]);
    const sealed = await h.seal();
    expect(sealed?.status).toBe("sealed");
    expect(sealed?.summary).toContain("held the gate through the night");
    expect(h.asks).toEqual([maxTokensFor("chapterSeal", 0), maxTokensCap("chapterSeal")]);
  });

  it("cut twice on both attempts: the record is degraded, nothing is folded, the message fold skips it, and the journal says why", async () => {
    const h = harness([cut, cut, cut, cut]);
    const sealed = await h.seal();
    expect(sealed?.status).toBe("degraded");
    expect(sealed?.summary).not.toContain("held the gate through the");
    expect(h.memory().entries.map((entry) => entry.foldedInto)).toEqual([undefined, undefined]);
    const block = [{ key: INJECTION_REGISTRY.storySoFar.key, value: `[The story so far]\n${sealed?.summary} ${sealed?.short}` }];
    expect(foldPreview(h.memory(), story, block, 20)).toBe(0);
    const [summary, detail] = h.journal.mock.calls.at(-1) ?? [];
    expect(summary).toBe("chapter sealed: Arrival (without a written summary; nothing folded)");
    expect(detail).toContain(`reply cut at ${maxTokensFor("chapterSeal", 0)} tokens, asked again: cut at ${maxTokensCap("chapterSeal")}`);
  });

  it("control: a complete reply seals on one call and folds its rows", async () => {
    const h = harness([]);
    const sealed = await h.seal();
    expect(sealed?.status).toBe("sealed");
    expect(h.asks).toHaveLength(1);
    expect(h.memory().entries.map((entry) => entry.foldedInto)).toEqual([sealed?.id, sealed?.id]);
  });
});
