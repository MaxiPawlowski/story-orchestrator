jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [] })),
}));

import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import { parseStoryV2OrThrow, type EngineState, type StoryV2 } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { assembleChapterInput, restingChapterInput, restingRecord } from "@memory/chapterInput";
import { heldSecrets, memoryExtensionKey, withoutSecretLines, type ArcEntry, type ChapterRecord, type EpistemicEntry, type MemoryEntry } from "@memory/index";
import type { DerivedRecord } from "@memory/derived";
import { registerHostMacro, showTextPopup } from "@services/STAPI";
import { carryBridge, previouslySummary, registerChapterMacros, showPreviously, storySoFar, storySoFarText } from "./chapterKit";
import { ChapterPort, type ChapterHost } from "./chapterPort";
import { chapterSettings } from "./chapters";
import { ChapterSeal, sealDeps, type ChapterSealDeps } from "./chapterSeal";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { restingTexts } from "./managerWiring";
import { chapterParts, resolvedThreads, type SnapshotSources } from "./snapshotBuilder";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeManager } from "./runtimeManager";
import type { MemoryRuntimeState } from "./types";

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["aria", "Aria"], ["bram", "Bram"]];
const NAMES = CAST.map(([, name]) => name);
const SECRET = /silver key|vault/i;
const identity = (text: string) => text;

const story = parseStoryV2OrThrow({
  format: 2,
  id: "secret-shared",
  title: "Secret Shared",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }, { id: "b", name: "B", objective: "", type: "anchor" }],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: CAST.map(([id, name]) => ({ id, name })),
});
const mini = parseStoryV2OrThrow(JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2);

const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const ARIA_KNOWS = { id: "k-aria", subject: "Aria", tag: "knows", content: "Kel carries a silver key to the old vault", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const SECRET_KNOWLEDGE = [HIDING, ARIA_KNOWS];
const secrets = heldSecrets(SECRET_KNOWLEDGE, NAMES);
const resting = (text: string) => withoutSecretLines(text, secrets, null);

const SUMMARY = "Kel trusts Aria with his life. Kel keeps a silver key for the old vault on his belt.\nThey held the ford until the river fell.";

const record = (id: string, chapterId: string, from: number, to: number, extra: Partial<ChapterRecord> = {}): ChapterRecord => ({
  id, chapterId, part: 1, title: chapterId, playerTitle: chapterId, range: { from, to }, boundaries: { from, to }, checkpoints: [],
  summary: SUMMARY, short: "Kel carries a silver key to the old vault.",
  consequences: [{ text: "Kel carries a silver key to the old vault.", sources: [] }, { text: "The ford held.", sources: [] }],
  people: [
    { rosterId: "bram", name: "Bram", text: "Bram never learned that Kel carries a silver key to the old vault." },
    { rosterId: "aria", name: "Aria", text: "Aria saw Kel carries a silver key to the old vault." },
  ],
  open: [], blackboardDelta: {}, blackboardAt: {}, status: "sealed",
  provenance: { source: "code", messageId: to, boundary: to, pass: "chapterSeal" } as never,
  tokens: { summary: 20, short: 8 }, sealedAt: { boundary: to, messageId: to, at: 0, pathLength: 1 },
  bridge: { text: "The chapter has ended: Kel carries a silver key to the old vault. They rest by the ford." },
  ...extra,
});

const entry = (id: string, text: string, messageId: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, messageId, createdAt: messageId, type: "relationship", importance: 2, expiration: "permanent",
  entities: ["Kel"], confidence: 1, activationTriggers: [], evidence: text, recallCount: 0, ...extra,
}) as unknown as MemoryEntry;

const ENTRIES = [
  entry("whole", "Kel carries a silver key to the old vault.", 7),
  entry("paraphrase", "Kel keeps a silver key for the old vault on his belt.", 7),
  entry("mixed", "Kel trusts Aria with his life. Kel carries a silver key to the old vault.", 7),
  entry("plain", "Kel and Bram fought side by side at the ford.", 7),
  entry("scene", "Kel unlocked the old vault with his silver key at midnight.", 7, { tier: "scene_history" }),
];

const ARCS = [
  { id: "arc-key", text: "Kel carries a silver key to the old vault", status: "open", entities: [], openedAt: 1, openedMessageId: 7 },
  { id: "arc-ford", text: "Who will hold the ford?", status: "open", entities: [], openedAt: 1, openedMessageId: 7 },
  { id: "arc-told", text: "Kel showed Aria the silver key to the old vault", status: "resolved", entities: [], openedAt: 1, resolvedAt: 2, summary: "Aria kept quiet." },
  { id: "arc-river", text: "The river fell", status: "resolved", entities: [], openedAt: 1, resolvedAt: 2, summary: "The river fell at dawn." },
] as unknown as ArcEntry[];

const ERA = { id: "era-1", recordIds: ["old#1"], text: "Kel showed Aria the silver key to the old vault. The company crossed the ford.", messageId: 2 };

function coordinatorHarness(epistemic: EpistemicEntry[]) {
  const context: RunContext = { chatId: "chat-a", storyId: "secret-shared", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const writes = new Map<string, string>();
  const prompt = { setStoryExtensionPrompt: (key: string, value: string) => { writes.set(key, value); }, clearStoryExtensionPrompt: (key: string) => { writes.delete(key); } };
  const hosts = {
    prompt,
    roster: { getActiveGroup: () => ({ id: "g", members: NAMES.map((name) => `${name}.png`), disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }), chatId: () => "chat-a" },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
  };
  const state = { boundary: 8, lastMessageId: 12, activeCheckpointId: "a", visitedPath: ["a"], visitedAnchors: ["a"], checkpointStartedBoundary: 0, blackboard: { values: {}, versions: {}, latched: {} } };
  let memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, chapters: { seal: true, recap: true, storySoFar: true }, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 } },
    entries: ENTRIES, epistemic, ledger: [], arcs: ARCS, derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, wiWrites: {}, wiBook: null,
    canon: null, chronicle: { eras: [ERA] }, chapters: [record("old#1", "old", 0, 2), record("last#1", "last", 3, 6)],
  } as unknown as MemoryRuntimeState;
  const deps = {
    hosts, getStory: () => story, getState: () => state, getMemory: () => memory, setMemory: (next: MemoryRuntimeState) => { memory = next; },
    getFiredTransitions: () => [], getExpansionGateSources: () => [], enqueueExtractorDeltas: () => undefined, enqueueMechanical: () => undefined,
    ownership, judge: () => null, persist: async () => undefined, notify: () => undefined,
  };
  const coordinator = new MemoryCoordinator(deps as never);
  const host = {
    coordinator, deps, memory: () => memory, patch: (next: Partial<MemoryRuntimeState>) => { memory = { ...memory, ...next }; }, record: () => {}, save: async () => {},
  } as unknown as ChapterHost;
  const port = new ChapterPort(host);
  return { coordinator, host, port, writes, memory: () => memory };
}

const unfilter = (coordinator: MemoryCoordinator) => jest.spyOn(coordinator.injector, "restingFilter").mockImplementation(() => identity);

afterEach(() => jest.restoreAllMocks());

describe("chapter seal and held secrets: the seal input is the resting view, so the stored record is built without the secret", () => {
  const later: EngineState = {
    blackboard: { values: { step: 9 }, versions: {}, latched: {} }, activeCheckpointId: "dawn", visitedAnchors: [], visitedPath: ["gate", "market", "fire", "walls", "dawn"],
    boundary: 30, checkpointStartedBoundary: 30, checkpointStartedAt: 0, checkpointStartedMessageId: 10, lastMessageId: 10, chatLength: 11,
  };
  const WRITTEN = "SUMMARY:\nthe span was played through.\nSHORT:\nthe span ended.";

  const sealHarness = (filter: (text: string) => string) => {
    const context: RunContext = { chatId: "chat-a", storyId: "chapters-mini", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
    const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
    let memory = {
      entries: ENTRIES, arcs: ARCS.map((arc) => ({ ...arc, openedMessageId: 7 })), ledger: [{ id: "l1", entity: "Kel", entityType: "person", field: "belt", value: "a silver key to the old vault", createdAt: 7, messageId: 7 }],
      epistemic: [], derived: [] as DerivedRecord[], chapters: [record("arrival#1", "arrival", 0, 2), record("camp#1", "camp", 3, 5)], chronicle: { eras: [] },
      shortTermSummaryEnd: -1, storyStart: 0, settings: { enabled: true, chapters: { seal: true, chronicleTokens: 1 } },
    } as unknown as MemoryRuntimeState;
    const prompts: string[] = [];
    const deps: ChapterSealDeps = {
      getStory: () => mini, getState: () => later, memory: () => memory, patch: (next) => { memory = { ...memory, ...next }; }, record: () => {},
      model: () => async (prompt: string) => { prompts.push(prompt); return { text: WRITTEN } as never; },
      ownership: () => ownership, closeScene: async () => {}, sceneStart: (to) => to + 1, summarizeArcs: async () => true, updateInjection: () => {},
      save: async () => {}, roster: () => [], playerName: () => "You", journal: () => {}, announce: async () => {}, resting: () => filter,
    };
    return { seal: new ChapterSeal(deps), prompts, memory: () => memory };
  };

  const sealFinal = async (filter: (text: string) => string) => {
    const h = sealHarness(filter);
    const sealed = await h.seal.seal({ chapter: mini.chapterById!.siege, part: 1, final: true },
      { boundary: 30, messageId: 10, pathLength: 5, path: [...later.visitedPath], activeCheckpointId: "dawn", blackboard: { step: 9 } });
    return { ...h, sealed };
  };

  it("the record prompt, the saga prompt and the era merge prompt carry neither the secret nor its paraphrase; the rest is kept", async () => {
    const h = await sealFinal(resting);
    expect(h.sealed).not.toBeNull();
    expect(h.prompts.length).toBeGreaterThanOrEqual(3);
    h.prompts.forEach((prompt) => expect(prompt).not.toMatch(SECRET));
    expect(h.prompts[0]).toContain("Kel and Bram fought side by side at the ford.");
    expect(h.prompts[0]).toContain("Kel trusts Aria with his life.");
    expect(h.prompts[0]).toContain("Who will hold the ford?");
    expect(JSON.stringify(h.sealed)).not.toMatch(SECRET);
    expect(JSON.stringify(h.memory().chronicle)).not.toMatch(SECRET);
  });

  it("negative control: with an identity filter the secret reaches the record prompt and a later seal prompt", async () => {
    const h = await sealFinal(identity);
    expect(h.prompts[0]).toMatch(SECRET);
    expect(h.prompts.some((prompt, index) => index > 0 && SECRET.test(prompt))).toBe(true);
  });

  it("control: with no held secret the prompts are byte-identical to the unfiltered seal", async () => {
    const none = heldSecrets([ARIA_KNOWS], NAMES);
    const filtered = await sealFinal((text) => withoutSecretLines(text, none, null));
    const plain = await sealFinal(identity);
    expect(filtered.prompts).toEqual(plain.prompts);
    const eras = (h: typeof plain) => (h.memory().chronicle?.eras ?? []).map((era) => ({ ...era, id: "" }));
    expect(eras(filtered)).toEqual(eras(plain));
    expect(plain.prompts.join("\n")).toMatch(SECRET);
  });

  it("the seal input drops a fact, an open thread and a ledger row that tell the secret, redacts the mixed row and the previous record", () => {
    const raw = assembleChapterInput({
      range: { from: 6, to: 10 }, entries: ENTRIES, arcs: ARCS, ledger: [{ id: "l1", entity: "Kel", entityType: "person", field: "belt", value: "a silver key to the old vault", createdAt: 7, messageId: 7 }] as never,
      blackboardBefore: {}, blackboardAfter: {}, places: [], roster: [], previous: record("camp#1", "camp", 3, 5),
    });
    const shown = restingChapterInput(raw, resting);
    expect(JSON.stringify(shown)).not.toMatch(SECRET);
    expect(shown.items.map((item) => item.id)).toEqual(["mixed", "plain"]);
    expect(shown.items[0].text).toBe("Kel trusts Aria with his life.");
    expect(shown.openArcs.map((arc) => arc.id)).toEqual(["arc-ford"]);
    expect(shown.previous?.summary).toBe("Kel trusts Aria with his life.\nThey held the ford until the river fell.");
    expect(JSON.stringify(raw)).toMatch(SECRET);
    expect(restingChapterInput(raw, identity)).toEqual(raw);
  });

  it("sealDeps hands the seal the injector's resting view", () => {
    const { host } = coordinatorHarness(SECRET_KNOWLEDGE);
    const filter = sealDeps(host).resting();
    expect(filter("Kel carries a silver key to the old vault.")).toBe("");
    expect(filter("Kel and Bram fought side by side at the ford.")).toBe("Kel and Bram fought side by side at the ford.");
  });
});

describe("chapter records on read: the chronicle, the story so far and its open threads go through the resting view", () => {
  it("the story-so-far block drops the secret from the chronicle, the era line and the open threads; the rest is kept", () => {
    const { host } = coordinatorHarness(SECRET_KNOWLEDGE);
    const block = storySoFar(host);
    expect(block).not.toMatch(SECRET);
    expect(block).toContain("Kel trusts Aria with his life.");
    expect(block).toContain("They held the ford until the river fell.");
    expect(block).toContain("- Who will hold the ford?");
  });

  it("negative control: the same block with an identity filter carries the secret from records, eras and threads", () => {
    const { host, coordinator } = coordinatorHarness(SECRET_KNOWLEDGE);
    unfilter(coordinator);
    const block = storySoFar(host);
    expect(block).toContain("silver key for the old vault");
    expect(block).toContain("- Kel carries a silver key to the old vault");
    expect(block).toContain("Earlier: Kel showed Aria the silver key");
  });

  it("control: with no held secret the block is byte-identical to the unfiltered text", () => {
    const { host, memory } = coordinatorHarness([ARIA_KNOWS]);
    const state = memory();
    const unfiltered = storySoFarText({ records: state.chapters ?? [], eras: state.chronicle?.eras ?? [], canon: "", chapterTitle: null,
      threads: ARCS.filter((arc) => arc.status === "open"), settings: chapterSettings(state.settings.chapters) });
    expect(storySoFar(host)).toBe(unfiltered);
    expect(unfiltered).toMatch(SECRET);
  });
});

describe("the \"Previously…\" recap and {{story_previously}} read the last record through the resting view", () => {
  const macro = (port: ChapterPort) => {
    registerChapterMacros({ chapters: port, getCachedSnapshot: () => ({}) } as unknown as RuntimeManager);
    const call = (registerHostMacro as jest.Mock).mock.calls.reverse().find(([key]) => key === "story_previously");
    return (call?.[1] as () => string)();
  };

  it("the popup and the macro show the summary without the secret sentence", () => {
    const { port } = coordinatorHarness(SECRET_KNOWLEDGE);
    expect(macro(port)).toBe("Kel trusts Aria with his life.\nThey held the ford until the river fell.");
    expect(showPreviously(port)).toBe(true);
    const shown = (showTextPopup as jest.Mock).mock.calls.at(-1)?.[0] as string;
    expect(shown).not.toMatch(SECRET);
    expect(shown).toContain("They held the ford until the river fell.");
  });

  it("negative control: an identity filter shows the secret in both", () => {
    const { port, coordinator } = coordinatorHarness(SECRET_KNOWLEDGE);
    unfilter(coordinator);
    expect(macro(port)).toMatch(SECRET);
    showPreviously(port);
    expect((showTextPopup as jest.Mock).mock.calls.at(-1)?.[0]).toMatch(SECRET);
  });

  it("control: with no held secret the macro is the stored summary verbatim", () => {
    const { port } = coordinatorHarness([ARIA_KNOWS]);
    expect(previouslySummary(port)).toBe(SUMMARY);
    expect(macro(port)).toBe(SUMMARY);
  });
});

describe("the chapter bridge note and the returning dossiers are shared or per-member prompt text: filtered at injection", () => {
  it("the bridge note carries the rest of the bridge, not the secret sentence; identity control shows it; no secret is verbatim", () => {
    const run = (epistemic: EpistemicEntry[], off = false) => {
      const h = coordinatorHarness(epistemic);
      if (off) unfilter(h.coordinator);
      carryBridge(h.port, "normal");
      return h.writes.get(INJECTION_REGISTRY.chapterBridge.key) ?? "";
    };
    expect(run(SECRET_KNOWLEDGE)).toBe("They rest by the ford.");
    expect(run(SECRET_KNOWLEDGE, true)).toMatch(SECRET);
    expect(run([ARIA_KNOWS])).toBe(record("x", "x", 0, 0).bridge?.text);
  });

  const dossier = (epistemic: EpistemicEntry[], chId: number) => {
    const h = coordinatorHarness(epistemic);
    jest.spyOn(h.coordinator.chapters, "inject").mockImplementation(() => new Map([
      ["bram", "Returning: Bram — last seen in old: Kel carries a silver key to the old vault. Bram swore to hold the ford."],
      ["aria", "Returning: Aria — last seen in old: Kel carries a silver key to the old vault. Aria swore to hold the ford."],
    ]));
    h.coordinator.updateInjection();
    h.coordinator.injector.onMemberDrafted(chId);
    return h.writes.get(memoryExtensionKey("facts")) ?? "";
  };

  it("a kept-out member's dossier loses the secret sentence; a member who holds it keeps it; with no secret it is verbatim", () => {
    const bram = dossier(SECRET_KNOWLEDGE, 2);
    expect(bram).not.toMatch(SECRET);
    expect(bram).toContain("Bram swore to hold the ford.");
    expect(dossier(SECRET_KNOWLEDGE, 1)).toContain("Kel carries a silver key to the old vault. Aria swore to hold the ford.");
    expect(dossier([ARIA_KNOWS], 2)).toContain("Kel carries a silver key to the old vault. Bram swore to hold the ford.");
  });
});

describe("player surfaces: open and resolved threads, the latest scene and the chapter lines go through the resting view", () => {
  const parts = (epistemic: EpistemicEntry[], off = false) => {
    const h = coordinatorHarness(epistemic);
    if (off) unfilter(h.coordinator);
    const memory = h.memory();
    const sources = {
      extras: { memory }, openThreads: ["x"], promptBlocks: { own: [] }, chat: [], resting: h.coordinator.injector.restingFilter(),
    } as unknown as SnapshotSources;
    const state = { activeCheckpointId: "a", lastMessageId: 12, checkpointStartedBoundary: 0, boundary: 8 } as unknown as EngineState;
    return { ...chapterParts(sources, story, state), resolved: resolvedThreads(memory as never, sources.resting) };
  };

  it("threads, resolved threads and the latest scene drop what tells the secret", () => {
    const shown = parts(SECRET_KNOWLEDGE);
    expect(shown.openThreads).toEqual(["Who will hold the ford?"]);
    expect(shown.resolved).toEqual(["The river fell"]);
    expect(shown.scene).toBeNull();
  });

  it("negative control: an identity filter shows the secret thread, resolved thread and scene", () => {
    const shown = parts(SECRET_KNOWLEDGE, true);
    expect(shown.openThreads.join("\n")).toMatch(SECRET);
    expect(shown.resolved.join("\n")).toMatch(SECRET);
    expect(shown.scene?.text).toMatch(SECRET);
  });

  it("control: with no held secret the parts are identical to the identity-filtered parts", () => {
    expect(parts([ARIA_KNOWS])).toEqual(parts([ARIA_KNOWS], true));
  });

  it("a chapter record read for the player (chapter lines, /story chapter, the chronicle export) loses the secret in every field", () => {
    const shown = restingRecord(record("r", "r", 0, 1), resting);
    expect(JSON.stringify(shown)).not.toMatch(SECRET);
    expect(shown.consequences.map((item) => item.text)).toEqual(["The ford held."]);
    expect(shown.people).toEqual([]);
    expect(shown.short).toBe("");
    expect(restingRecord(record("r", "r", 0, 1), identity)).toEqual(record("r", "r", 0, 1));
  });
});

describe("prompt inputs outside memory: expansion facts, curator threads and warden facts go through the resting view", () => {
  it("restingTexts drops a row that tells the secret and redacts a mixed row; with no secret it returns the rows as they are", () => {
    const rows = ENTRIES.map((row) => ({ id: row.id, text: row.text }));
    const shown = restingTexts(coordinatorHarness(SECRET_KNOWLEDGE).coordinator, rows);
    expect(shown.map((row) => row.text)).toEqual(["Kel trusts Aria with his life.", "Kel and Bram fought side by side at the ford."]);
    const plain = restingTexts(coordinatorHarness([ARIA_KNOWS]).coordinator, rows);
    expect(plain).toEqual(rows);
    plain.forEach((row, index) => expect(row).toBe(rows[index]));
  });

  it("negative control: an identity filter keeps every secret row", () => {
    const { coordinator } = coordinatorHarness(SECRET_KNOWLEDGE);
    unfilter(coordinator);
    expect(restingTexts(coordinator, ENTRIES.map((row) => ({ text: row.text }))).map((row) => row.text).join("\n")).toMatch(SECRET);
  });
});
