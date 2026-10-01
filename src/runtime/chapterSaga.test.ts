jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: () => ({ chat: Array.from({ length: 30 }, () => ({})) }),
}));

jest.mock("@extraction/index", () => ({
  getChatWindow: (from: number, to: number) => ({ from, to, messages: [] }),
  planReconciliation: () => null,
  scheduleForcedCues: () => undefined,
}));

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import { parseStoryV2OrThrow, type BoundaryResult, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { ExtractionScheduler } from "@extraction/index";
import type { ModelCall } from "@extraction/modelRoute";
import { chronicleMarkdown } from "@memory/chronicle";
import type { DerivedRecord } from "@memory/derived";
import type { ArcEntry, ChapterRecord, MemoryEntry } from "@memory/types";
import { runBoundaryWork } from "./boundaryWork";
import { bridgeText, carryBridge, commitBridge, dossiers, fold, inject, returningLines, storySoFarText, type FoldRow } from "./chapterKit";
import type { ChapterHost, ChapterPort } from "./chapterPort";
import { ChapterSeal, type ChapterSealDeps } from "./chapterSeal";
import { buildChapterView, chapterSettings, sealTarget, type SealTarget } from "./chapters";
import { pendingBridge } from "@memory/chapterUnfold";
import { derivePipelineStatus } from "./pipeline";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeManager } from "./runtimeManager";
import type { ExtractionRuntimeState, MemoryRuntimeState } from "./types";

const story = parseStoryV2OrThrow(JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2);
const chapter = (id: string) => story.chapterById![id];

const scene = (id: string, messageId: number): MemoryEntry => ({
  id, tier: "scene_history", text: `the party moved on, scene ${id}`, type: "event", importance: 2, expiration: "permanent", entities: [], confidence: 1,
  activationTriggers: [], evidence: "", createdAt: 0, recallCount: 0, messageId,
}) as unknown as MemoryEntry;

const record = (id: string, patch: Partial<ChapterRecord> = {}): ChapterRecord => ({
  id, chapterId: "arrival", part: 1, title: "Arrival at Harrowgate", playerTitle: "Arrival", range: { from: 0, to: 19 }, boundaries: { from: 0, to: 3 },
  checkpoints: [], summary: `the long account of ${id}.`, short: `${id} in brief.`, consequences: [], people: [], open: [],
  blackboardDelta: {}, blackboardAt: {}, status: "sealed", provenance: { source: "code" } as ChapterRecord["provenance"],
  tokens: { summary: 0, short: 0 }, sealedAt: { boundary: 3, messageId: 19, at: 0, pathLength: 2 }, ...patch,
});

const EPILOGUE = `the siege ended and ${Array.from({ length: 130 }, (_, index) => `w${index}`).join(" ")}.`;

const recordReply = (prompt: string) => {
  const source = prompt.match(/^\[(s\d+)\]/m)?.[1] ?? "q:step";
  return [
    `SUMMARY: the party finished the road and kept its word (${source}).`,
    "SHORT: the road ended.",
    "CONSEQUENCES:",
    `- the road was crossed [src: ${source}]`,
    "PEOPLE:",
    "- Kael: tired but steady",
    "OPEN:",
  ].join("\n");
};

const sealHarness = () => {
  const context: RunContext = { chatId: "chat-a", storyId: "chapters-mini", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  let memory = {
    entries: [scene("s1", 2), scene("s2", 12), scene("s3", 22), scene("s4", 32)], arcs: [] as ArcEntry[], ledger: [], epistemic: [], chapters: [] as ChapterRecord[],
    chronicle: { eras: [] }, chapterBridge: null, settings: { enabled: true, chapters: { seal: true } }, storyStart: 0, shortTermSummaryEnd: -1, derived: [] as DerivedRecord[],
  } as unknown as MemoryRuntimeState;
  const state = { activeCheckpointId: "market", visitedPath: ["gate", "market"], blackboard: { values: { step: 0 } }, boundary: 0, lastMessageId: 0 } as unknown as EngineState;
  const model: ModelCall = jest.fn(async (prompt: string) => ({
    text: /write its epilogue/.test(prompt) ? EPILOGUE : /compressing a story's history/.test(prompt) ? "the early roads were walked." : recordReply(prompt),
    finish: "stop" as const,
  }));
  const deps: ChapterSealDeps = {
    getStory: () => story, getState: () => state, memory: () => memory,
    patch: (next) => { memory = { ...memory, ...next }; },
    record: (input) => { memory = { ...memory, derived: [...memory.derived, { id: `d${memory.derived.length}`, boundary: 0, messageId: input.messageId ?? 0, ...input } as DerivedRecord] }; },
    model: () => model, ownership: () => ownership, closeScene: async () => undefined, sceneStart: (to) => to + 1, summarizeArcs: async () => true,
    updateInjection: jest.fn(), save: jest.fn(async () => undefined), roster: () => [{ id: "kael", name: "Kael" }], playerName: () => "Mara",
    journal: jest.fn(), announce: jest.fn(async () => undefined),
  };
  const seal = async (target: SealTarget, messageId: number, step: number, path: string[]) => {
    Object.assign(state, { activeCheckpointId: path[path.length - 1], visitedPath: path, boundary: step, lastMessageId: messageId });
    (state.blackboard.values as Record<string, unknown>).step = step;
    return new ChapterSeal(deps).seal(target, { boundary: step, messageId, pathLength: path.length, path: [...path], activeCheckpointId: path[path.length - 1], blackboard: { step } });
  };
  return { seal, memory: () => memory, deps };
};

describe("chronicle drift across later seals (v2.6 plan 07 Q-M6)", () => {
  it("chapter 1's sealed record, SUMMARY included, is byte-identical after three later seals", async () => {
    const run = sealHarness();
    const first = await run.seal({ chapter: chapter("arrival"), part: 1, final: false }, 9, 1, ["gate", "market", "fire"]);
    expect(first?.status).toBe("sealed");
    const before = JSON.stringify(run.memory().chapters![0]);
    const summary = run.memory().chapters![0].summary;
    await run.seal({ chapter: chapter("camp"), part: 1, final: false }, 19, 2, ["gate", "market", "fire", "walls"]);
    await run.seal({ chapter: chapter("siege"), part: 1, final: false }, 29, 3, ["gate", "market", "fire", "walls", "dawn"]);
    await run.seal({ chapter: chapter("siege"), part: 2, final: true }, 39, 4, ["gate", "market", "fire", "walls", "dawn"]);
    const chapters = run.memory().chapters!;
    expect(chapters.map((item) => item.id)).toEqual(["arrival#1", "camp#1", "siege#1", "siege#2"]);
    expect(chapters[0].summary).toBe(summary);
    expect(JSON.stringify(chapters[0])).toBe(before);
  });
});

describe("endings (v2.6 plan 07 task 18)", () => {
  it("the final seal writes the epilogue, ends the story, clears the bridge, and nothing seals after it", async () => {
    const run = sealHarness();
    await run.seal({ chapter: chapter("arrival"), part: 1, final: false }, 9, 1, ["gate", "market", "fire"]);
    expect(pendingBridge(run.memory().chapters ?? [])?.recordId).toBe("arrival#1");
    const final = await run.seal({ chapter: chapter("siege"), part: 1, final: true }, 29, 4, ["gate", "market", "fire", "walls", "dawn"]);
    expect(final).toMatchObject({ id: "siege#1", final: true, epilogue: EPILOGUE });
    const records = run.memory().chapters!;
    expect(pendingBridge(records)).toBeNull();
    const view = buildChapterView(story, "dawn", records);
    expect(view).toMatchObject({ ended: true, epilogue: EPILOGUE });
    expect(sealTarget(story, "dawn", records, ["gate", "market", "fire", "walls", "dawn"])).toBeNull();
    expect(chronicleMarkdown("Chapters Mini", records, { author: false })).toContain(`### Epilogue\n\n${EPILOGUE}`);
    expect(derivePipelineStatus({} as ExtractionRuntimeState, undefined, null, view.ended).state).toBe("complete");
  });

  it("after the end, boundary work only compacts short-term memory", () => {
    const scheduled: string[] = [];
    const scheduler = { onBoundary: jest.fn(), schedule: (task: { reason: string }) => { scheduled.push(task.reason); } } as unknown as ExtractionScheduler;
    const manager = {
      chapters: { records: () => [record("siege#1", { final: true })] },
      shouldCompactShortTerm: () => true,
      curatorDueForRun: () => true,
      innerBeatDue: () => true,
      runInnerBeat: jest.fn(async () => undefined),
    } as unknown as RuntimeManager;
    const result = { boundary: 10, queue: { applied: [], discarded: [] }, fired: { from: "walls", to: "dawn" }, effects: null, activeCheckpointId: "dawn", context: { lastMessageId: 40, chatLength: 41 }, previousLastMessageId: 39 } as unknown as BoundaryResult;
    runBoundaryWork({ result, manager, scheduler });
    expect(scheduled).toEqual(["short-term-compaction"]);
    expect((scheduler as unknown as { onBoundary: jest.Mock }).onBoundary).not.toHaveBeenCalled();
  });
});

const promptHost = () => ({ setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn() });

const kitPort = (memoryPatch: Partial<MemoryRuntimeState>, storyRef: NormalizedStoryV2 | null = story) => {
  let memory = { arcs: [], chapters: [], chronicle: { eras: [] }, canon: null, settings: { enabled: true, chapters: {} }, ...memoryPatch } as unknown as MemoryRuntimeState;
  const prompt = promptHost();
  const blocks: Array<{ key: string; value: string }> = [];
  const host = {
    deps: {
      getStory: () => storyRef,
      getState: () => ({ activeCheckpointId: "walls", visitedPath: ["gate", "market", "fire", "walls"], lastMessageId: 25 }),
      hosts: { prompt, injection: { readInjectedPromptBlocks: () => blocks } },
    },
    memory: () => memory,
    patch: (next: Partial<MemoryRuntimeState>) => { memory = { ...memory, ...next }; },
    save: jest.fn(async () => undefined),
  } as unknown as ChapterHost;
  const port = { host, carried: null } as unknown as ChapterPort;
  return { port, host, prompt, blocks, memory: () => memory };
};

describe("the story-so-far block (v2.6 plan 07 task 12)", () => {
  const arrival = record("arrival#1", { summary: "they reached the gate at dusk.", short: "they arrived." });
  const threads = [
    { id: "a1", text: "find the quartermaster", status: "open", entities: [], openedAt: 0, originChapter: "arrival#1" },
    { id: "a2", text: "mend the sword", status: "open", entities: [], openedAt: 0, pinned: true },
  ] as ArcEntry[];

  it("composes chronicle, this chapter's canon without its fact list, and open threads, pinned first", () => {
    const text = storySoFarText({ records: [arrival], eras: [], canon: "the walls are manned.\nESTABLISHED FACTS:\n- secret", chapterTitle: "The Siege", threads, settings: chapterSettings({}) });
    expect(text).toBe([
      "[The story so far]\nArrival: they reached the gate at dusk.",
      "[This chapter: The Siege]\nthe walls are manned.",
      "[Open threads]\n- mend the sword\n- find the quartermaster (since Arrival)",
    ].join("\n\n"));
  });

  it("is injected at its registry key and depth only when the setting is on and the story asks for the block", () => {
    const on = kitPort({ chapters: [arrival], arcs: threads, settings: { enabled: true, chapters: { storySoFar: true } } } as Partial<MemoryRuntimeState>);
    inject(on.port, on.prompt, true);
    expect(on.prompt.setStoryExtensionPrompt).toHaveBeenCalledWith(INJECTION_REGISTRY.storySoFar.key, expect.stringContaining("[The story so far]"), INJECTION_REGISTRY.storySoFar.depth);
    const off = kitPort({ chapters: [arrival], settings: { enabled: true, chapters: { storySoFar: false } } } as Partial<MemoryRuntimeState>);
    inject(off.port, off.prompt, true);
    expect(off.prompt.setStoryExtensionPrompt).not.toHaveBeenCalled();
    expect(off.prompt.clearStoryExtensionPrompt).toHaveBeenCalledWith(INJECTION_REGISTRY.storySoFar.key);
    const paused = kitPort({ chapters: [arrival], settings: { enabled: true, chapters: { storySoFar: true } } } as Partial<MemoryRuntimeState>);
    inject(paused.port, paused.prompt, false);
    expect(paused.prompt.setStoryExtensionPrompt).not.toHaveBeenCalled();
  });
});

describe("the chapter bridge (v2.6 plan 07 task 13)", () => {
  const bridge = { recordId: "arrival#1", text: bridgeText(record("arrival#1", { short: "they arrived." }), "The Siege") };
  const sealed = () => [record("arrival#1", { short: "they arrived.", bridge: { text: bridge.text } })];

  it("names the ended chapter and the next one", () => {
    expect(bridge.text).toBe("The chapter Arrival has ended: they arrived. A new chapter begins: The Siege.");
  });

  it("rides the next loud generation and is spent only when that generation renders a reply", () => {
    const { port, prompt, memory, host } = kitPort({ chapters: sealed() } as Partial<MemoryRuntimeState>);
    carryBridge(port, "normal");
    expect(prompt.setStoryExtensionPrompt).toHaveBeenCalledWith(INJECTION_REGISTRY.chapterBridge.key, bridge.text, INJECTION_REGISTRY.chapterBridge.depth);
    commitBridge(port, false);
    expect(prompt.clearStoryExtensionPrompt).toHaveBeenCalledWith(INJECTION_REGISTRY.chapterBridge.key);
    expect(pendingBridge(memory().chapters ?? [])).toEqual(bridge);
    carryBridge(port, "normal");
    commitBridge(port, true);
    expect(pendingBridge(memory().chapters ?? [])).toBeNull();
    expect(memory().chapters?.[0].bridge?.committedAt).toBe(29);
    expect(host.save).toHaveBeenCalled();
  });

  it("is withheld from quiet and impersonate generations", () => {
    const { port, prompt, memory } = kitPort({ chapters: sealed() } as Partial<MemoryRuntimeState>);
    carryBridge(port, "quiet");
    carryBridge(port, "impersonate");
    commitBridge(port, true);
    expect(prompt.setStoryExtensionPrompt).not.toHaveBeenCalled();
    expect(pendingBridge(memory().chapters ?? [])).toEqual(bridge);
  });
});

describe("returning-cast dossiers (v2.6 plan 07 task 15)", () => {
  const people = (rosterId: string, name: string, text: string) => [{ rosterId, name, text }];
  const records = [
    record("arrival#1", { people: people("kael", "Kael", "lost his sword"), playerTitle: "Arrival" }),
    record("camp#1", { people: people("kael", "Kael", "swore to win it back"), playerTitle: "Night Camp", range: { from: 20, to: 29 }, sealedAt: { boundary: 5, messageId: 29, at: 0, pathLength: 3 } }),
    record("siege#1", { people: people("mara", "Mara", "holds the walls"), playerTitle: "The Siege", range: { from: 30, to: 39 }, sealedAt: { boundary: 7, messageId: 39, at: 0, pathLength: 4 } }),
  ];
  const castStory = {
    roster: [{ id: "kael", name: "Kael" }, { id: "mara", name: "Mara" }],
    checkpointById: { gate: {}, market: {}, fire: {}, walls: {}, dawn: { effects: { cast_changes: { enable: ["Kael"] } } } },
  } as unknown as NormalizedStoryV2;

  it("keeps each member's latest line with the earlier ones as history", () => {
    const kael = dossiers(records).get("kael");
    expect(kael).toMatchObject({ text: "swore to win it back", recordId: "camp#1", playerTitle: "Night Camp", history: [{ recordId: "arrival#1", text: "lost his sword" }] });
  });

  it("stages a returning line for a member the path re-enabled after the last seal, inside the window", () => {
    const path = ["gate", "market", "fire", "walls", "dawn"];
    expect(returningLines(castStory, records, path, 42, 12)).toEqual(new Map([["kael", "Returning: Kael — last seen in Night Camp: swore to win it back"]]));
    expect(returningLines(castStory, records, path, 60, 12).size).toBe(0);
    expect(returningLines(castStory, records, ["gate", "market", "fire", "walls"], 42, 12).size).toBe(0);
  });
});

describe("the context fold at the generation interceptor (v2.6 plan 07 task 17)", () => {
  const arrival = record("arrival#1", { range: { from: 0, to: 19 } });
  const harness = (blockValue: string, foldOn = true) => {
    const kit = kitPort({ chapters: [arrival], settings: { enabled: true, chapters: { fold: foldOn } } } as Partial<MemoryRuntimeState>);
    kit.blocks.push({ key: INJECTION_REGISTRY.storySoFar.key, value: blockValue });
    const live = Array.from({ length: 25 }, () => ({ extra: {} as Record<string | symbol, unknown> }));
    const rows: FoldRow[] = [...live.map((message, index) => ({ mes: `m${index}`, extra: message.extra })), { mes: "stray", extra: {} }];
    return { host: kit.host, live, rows };
  };

  it("marks the sealed messages before keep_tail ignored on copies, and leaves the live chat untouched", () => {
    const { host, live, rows } = harness("[The story so far]\nArrival: the long account of arrival#1.");
    expect(fold(host, rows, "normal", live)).toEqual({ folded: 14, kept: 11, missing: 1 });
    const ignore = Symbol.for("ignore");
    expect(rows.slice(0, 14).every((row) => (row.extra as Record<symbol, unknown>)[ignore] === true)).toBe(true);
    expect(rows.slice(14, 25).some((row) => (row.extra as Record<symbol, unknown>)[ignore])).toBe(false);
    expect(live.some((message) => message.extra[ignore])).toBe(false);
  });

  it("folds nothing for quiet or impersonate, with the fold off, or when the block does not carry the record", () => {
    expect(fold(harness("Arrival: the long account of arrival#1.").host, harness("").rows, "quiet", [])).toBeNull();
    expect(fold(harness("Arrival: the long account of arrival#1.").host, harness("").rows, "impersonate", [])).toBeNull();
    const off = harness("Arrival: the long account of arrival#1.", false);
    expect(fold(off.host, off.rows, "normal", off.live)).toBeNull();
    const elsewhere = harness("something unrelated");
    expect(fold(elsewhere.host, elsewhere.rows, "normal", elsewhere.live)).toBeNull();
  });
});
