jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
}));

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import { parseStoryV2OrThrow, type EngineState, type StoryV2 } from "@engine/index";
import type { DerivedRecord } from "@memory/derived";
import type { ChapterRecord, MemoryEntry } from "@memory/types";
import { markRecapSeen } from "@memory/chapterUnfold";
import { chronicleMarkdown } from "@memory/chronicle";
import { chapterListText, recordsForChapter } from "./chapterKit";
import { chapterNumber } from "./chapters";
import { ChapterSeal, type ChapterSealDeps, type SealAt } from "./chapterSeal";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";

const story = parseStoryV2OrThrow(JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2);

const shortTerm = (id: string, messageId: number) => ({
  id, tier: "short_term", type: "detail", text: `summary ${id}`, importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [],
  evidence: "", createdAt: messageId, messageId, recallCount: 0, provenance: { source: "extractor", messageId, boundary: messageId, pass: "shortTerm" },
}) as unknown as MemoryEntry;

const later: EngineState = {
  blackboard: { values: { step: 9 }, versions: {}, latched: {} }, activeCheckpointId: "fire", visitedAnchors: [], visitedPath: ["gate", "market", "fire"],
  boundary: 30, checkpointStartedBoundary: 30, checkpointStartedAt: 0, checkpointStartedMessageId: 99, lastMessageId: 99, chatLength: 100,
};

const harness = (chronicleTokens = 700) => {
  const context: RunContext = { chatId: "chat-a", storyId: "chapters-mini", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  let memory = {
    entries: [shortTerm("st1", 4)], arcs: [], ledger: [], derived: [] as DerivedRecord[], chapters: [] as ChapterRecord[], chronicle: { eras: [] },
    shortTermSummaryEnd: -1, storyStart: 0, settings: { enabled: true, chapters: { seal: true, chronicleTokens } },
  } as unknown as MemoryRuntimeState;
  const announced: string[] = [];
  const onModel: Array<() => void> = [];
  let derivedId = 0;
  const deps: ChapterSealDeps = {
    getStory: () => story,
    getState: () => later,
    memory: () => memory,
    patch: (next) => { memory = { ...memory, ...next }; },
    record: (input) => { derivedId += 1; memory = { ...memory, derived: [...memory.derived, { ...input, id: `d${derivedId}`, boundary: 0, messageId: input.messageId ?? 0 } as DerivedRecord] }; },
    model: () => async () => { onModel.shift()?.(); return { text: "" } as never; },
    ownership: () => ownership,
    closeScene: async () => {},
    sceneStart: (to) => to + 1,
    summarizeArcs: async () => true,
    updateInjection: () => {},
    save: async () => {},
    roster: () => [],
    playerName: () => "You",
    journal: () => {},
    announce: async (text) => { announced.push(text); },
  };
  return { seal: new ChapterSeal(deps), memory: () => memory, set: (next: Partial<MemoryRuntimeState>) => { memory = { ...memory, ...next }; }, announced, onModel, context };
};

const arrival = story.chapterById!.arrival;
const atWalls = (messageId: number, boundary = messageId): SealAt => ({
  boundary, messageId, pathLength: 3, path: ["gate", "market", "walls"], activeCheckpointId: "walls", blackboard: { step: 3, tension: 0.4 },
});

describe("CR-E1: the deferred seal reads the boundary it was scheduled at, not a later one", () => {
  it("takes the blackboard, the checkpoint entered and the path from `at`", async () => {
    const h = harness();
    const record = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(record?.blackboardAt).toEqual({ step: 3 });
    expect(record?.checkpoints).toEqual(["gate", "market"]);
    expect(h.memory().chapters?.[0].bridge?.text).toContain("A new chapter begins: The Siege.");
    expect(h.announced).toEqual(["◆ Chapter 2 — The Siege"]);
  });
});

describe("CR-E11: an era is stamped with the newest seal it covers", () => {
  it("is the max sealedAt.messageId of its records, whatever the chat's last message is when the merge runs", async () => {
    const h = harness(1);
    await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    await h.seal.seal({ chapter: arrival, part: 2, final: false }, atWalls(20));
    await h.seal.seal({ chapter: arrival, part: 3, final: false }, atWalls(30));
    const eras = h.memory().chronicle?.eras ?? [];
    expect(eras.length).toBeGreaterThan(0);
    expect(eras[0].recordIds).toEqual(["arrival#1", "arrival#2"]);
    expect(eras[0].messageId).toBe(30);
    expect(h.memory().derived.find((record) => record.kind === "era_merge")?.messageId).toBe(30);
  });
});

describe("CR-E5 / CR-E15: unseal undoes what the seal's fold moved", () => {
  it("lowers the short-term watermark the fold raised, and forgets that the recap of that record was seen", async () => {
    const h = harness();
    const record = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(h.memory().shortTermSummaryEnd).toBe(10);
    h.set({ chapters: markRecapSeen(h.memory().chapters ?? [], record!.id, 12) });
    expect(await h.seal.unseal(record!.id)).toBe(true);
    expect(h.memory().shortTermSummaryEnd).toBe(-1);
    expect(h.memory().entries.some((entry) => entry.foldedInto)).toBe(false);
    const again = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    expect(again?.id).toBe(record!.id);
    expect(h.memory().chapters?.[0].recapSeenAt).toBeUndefined();
  });
});

describe("CR-E13: one chapter numbering everywhere", () => {
  const record = (chapterId: string, part: number) => ({
    id: `${chapterId}#${part}`, chapterId, part, playerTitle: story.chapterById![chapterId].player_title ?? chapterId, short: `${chapterId} ${part}.`, summary: `${chapterId} part ${part}.`,
    consequences: [], people: [], open: [], sealedAt: { messageId: part, boundary: part, at: 0, pathLength: 1 }, range: { from: 0, to: part },
  }) as unknown as ChapterRecord;
  const records = [record("arrival", 1), record("arrival", 2), record("siege", 1)];

  it("the list, /story chapter <n> and the chronicle export number by chapter, as the title card and the view do", () => {
    expect(chapterListText(story, records, "walls").split("\n")).toEqual(["1. Arrival — arrival 1.", "1. Arrival — arrival 2.", "2. The Siege — siege 1.", "Now: 2. The Siege"]);
    expect(recordsForChapter(story, records, 2).map((candidate) => candidate.id)).toEqual(["siege#1"]);
    expect(recordsForChapter(story, records, 1).map((candidate) => candidate.id)).toEqual(["arrival#1", "arrival#2"]);
    expect(chronicleMarkdown("Mini", records, { author: false, number: (candidate) => chapterNumber(story, candidate.chapterId) })).toContain("## 2. The Siege");
  });
});

describe("CR-E8: a re-seal that fails keeps the record it was replacing", () => {
  it("a re-seal whose run lapses leaves the old record, its fold and its derived row in place", async () => {
    const h = harness();
    const record = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    const before = h.memory();
    h.onModel.push(() => { h.context.chatId = "chat-b"; });
    expect(await h.seal.reseal(record!.id)).toBeNull();
    expect(h.memory().chapters).toEqual(before.chapters);
    expect(h.memory().entries).toEqual(before.entries);
    expect(h.memory().derived).toEqual(before.derived);
    expect(h.memory().shortTermSummaryEnd).toBe(10);
  });

  it("control: a re-seal that lands swaps the record in one write, with one chapter_seal row for it", async () => {
    const h = harness();
    const record = await h.seal.seal({ chapter: arrival, part: 1, final: false }, atWalls(10));
    const again = await h.seal.reseal(record!.id);
    expect(again?.id).toBe(record!.id);
    expect((h.memory().chapters ?? []).map((candidate) => candidate.id)).toEqual([record!.id]);
    expect(h.memory().derived.filter((row) => row.kind === "chapter_seal" && row.outputId === record!.id)).toHaveLength(1);
    expect(h.memory().entries.every((entry) => entry.foldedInto === record!.id)).toBe(true);
  });
});
