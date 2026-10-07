jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [] })),
}));

import { parseStoryV2OrThrow } from "@engine/index";
import { memoryExtensionKey, type EpistemicEntry, type MemoryEntry } from "@memory/index";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { recall } from "./chapterKit";
import type { ChapterPort } from "./chapterPort";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["aria", "Aria"], ["bram", "Bram"]];
const SECRET = /silver key|vault/i;

const story = parseStoryV2OrThrow({
  format: 2,
  id: "secret-mirror",
  title: "Secret Mirror",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }, { id: "b", name: "B", objective: "", type: "anchor" }],
  transitions: [{ from: "a", to: "b", priority: 1, gate: { q: "done", op: "==", v: true } }],
  roster: CAST.map(([id, name]) => ({ id, name })),
});

const row = (id: string, text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, messageId: 10, createdAt: 10, type: "relationship", importance: 2, expiration: "permanent",
  entities: ["Kel"], confidence: 1, activationTriggers: [], evidence: text, recallCount: 0, ...extra,
}) as unknown as MemoryEntry;

const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 10, createdAt: 10 } as unknown as EpistemicEntry;
const ARIA_KNOWS = { id: "k-aria", subject: "Aria", tag: "knows", content: "Kel carries a silver key to the old vault", messageId: 10, createdAt: 10 } as unknown as EpistemicEntry;
const SECRET_KNOWLEDGE = [HIDING, ARIA_KNOWS];

const ENTRIES: MemoryEntry[] = [
  row("whole", "Kel carries a silver key to the old vault."),
  row("mixed", "Kel trusts Aria with his life. Kel carries a silver key to the old vault."),
  row("plain", "Kel and Bram fought side by side at the ford."),
];

function mirrorBook() {
  const book = new Map<string, { content: string; disable: boolean }>();
  const writes = { count: 0 };
  let created = false;
  const host = {
    ensureLorebook: async (name: string) => { const first = !created; created = true; return { name, created: first }; },
    loadLorebook: async () => ({ entries: Object.fromEntries([...book].map(([comment, entry], uid) => [uid, { uid, comment, content: entry.content, disable: entry.disable }])) }),
    upsertWIEntry: async (_book: string, comment: string, content: string) => { writes.count += 1; const had = book.has(comment); book.set(comment, { content, disable: false }); return had ? "updated" : "created"; },
    disableWIEntry: async (_book: string, comments: string | string[]) => { [comments].flat().forEach((comment) => { const entry = book.get(comment); if (entry) entry.disable = true; }); return { ok: true, changed: true }; },
    bindChatLorebook: () => "bound",
    currentChatOwner: () => null,
  };
  const live = () => [...book].filter(([comment, entry]) => comment.startsWith("so_") && !entry.disable).map(([, entry]) => entry.content).join("\n");
  return { book, host, live, writes };
}

function coordinatorHarness(epistemic: EpistemicEntry[], entries: MemoryEntry[] = ENTRIES) {
  const context: RunContext = { chatId: "chat-a", storyId: "secret-mirror", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const mirror = mirrorBook();
  const hosts = {
    prompt: { setStoryExtensionPrompt: () => undefined, clearStoryExtensionPrompt: () => undefined },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }), chatId: () => "chat-a" },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
    mirror: mirror.host,
  };
  let memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 } },
    entries, epistemic, ledger: [], arcs: [], derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, wiWrites: {}, wiBook: null,
  } as Record<string, unknown>;
  const coordinator = new MemoryCoordinator({
    hosts,
    getStory: () => story,
    getState: () => ({ boundary: 8, lastMessageId: 12, activeCheckpointId: "a", visitedPath: ["a"], blackboard: { values: {}, versions: {}, latched: {} } }),
    getMemory: () => memory,
    setMemory: (next: typeof memory) => { memory = next; },
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => undefined,
    enqueueMechanical: () => undefined,
    ownership,
    judge: () => null,
    persist: async () => undefined,
    notify: () => undefined,
  } as never);
  const learn = (next: EpistemicEntry[]) => { memory = { ...memory, epistemic: next }; };
  const switchChat = () => { context.chatId = "chat-b"; };
  return { coordinator, mirror, learn, ownership, switchChat };
}

describe("Sol finding 8: player-facing prose handed to the suggestion request goes through the same resting view", () => {
  const prose = "Kel keeps a silver key for the old vault on his belt. Kel and Bram crossed the ford at dawn.";

  it("a paraphrase of the held secret is cut from the prose, the rest is kept", () => {
    const { coordinator } = coordinatorHarness(SECRET_KNOWLEDGE);
    const shown = coordinator.injector.restingText(prose);
    expect(shown).not.toMatch(SECRET);
    expect(shown).toBe("Kel and Bram crossed the ford at dawn.");
    expect(coordinator.injector.restingText("Kel carries a silver key to the old vault.")).toBe("");
  });

  it("control: with no held secret the prose is returned verbatim", () => {
    const { coordinator } = coordinatorHarness([ARIA_KNOWS]);
    expect(coordinator.injector.restingText(prose)).toBe(prose);
  });
});

describe("T7-1 review: the World Info mirror is the resting view, because ST scans the mirror book for every member", () => {
  it("a row that tells the secret is not mirrored, a row that tells it in one sentence mirrors the rest, a plain row mirrors whole", async () => {
    const { coordinator, mirror } = coordinatorHarness(SECRET_KNOWLEDGE);
    await coordinator.syncWorldInfo();
    expect(mirror.book.has("so_whole")).toBe(false);
    expect(mirror.book.get("so_mixed")?.content).toBe("Kel trusts Aria with his life.");
    expect(mirror.book.get("so_plain")?.content).toBe("Kel and Bram fought side by side at the ford.");
    expect(mirror.live()).not.toMatch(SECRET);
  });

  it("a row mirrored before the secret was held is switched off on the next sync, and the mixed row is rewritten", async () => {
    const { coordinator, mirror, learn } = coordinatorHarness([]);
    await coordinator.syncWorldInfo();
    expect(mirror.live()).toMatch(SECRET);
    learn(SECRET_KNOWLEDGE);
    await coordinator.syncWorldInfo();
    expect(mirror.book.get("so_whole")?.disable).toBe(true);
    expect(mirror.book.get("so_mixed")).toEqual({ content: "Kel trusts Aria with his life.", disable: false });
    expect(mirror.live()).not.toMatch(SECRET);
  });

  it("negative control: the same coordinator sync with the resting-view filter stubbed off puts the secret in the book, so the assertions above can fail", async () => {
    const { coordinator, mirror } = coordinatorHarness(SECRET_KNOWLEDGE);
    jest.spyOn(coordinator.injector, "restingEntries").mockImplementation((entries) => entries);
    await coordinator.syncWorldInfo();
    expect(mirror.book.get("so_whole")?.content).toBe(ENTRIES[0].text);
    expect(mirror.live()).toMatch(SECRET);
  });

  it("control: with no secret held every live relationship row mirrors verbatim", async () => {
    const { coordinator, mirror } = coordinatorHarness([ARIA_KNOWS]);
    await coordinator.syncWorldInfo();
    expect(mirror.book.get("so_whole")?.content).toBe(ENTRIES[0].text);
    expect(mirror.book.get("so_mixed")?.content).toBe(ENTRIES[1].text);
  });
});

const LEARN_SECRET = [
  { tag: "hiding" as const, subject: "Kel", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault" },
  { tag: "knows" as const, subject: "Aria", content: "Kel carries a silver key to the old vault" },
];

describe("review follow-up: a read that adds a held secret re-syncs the mirror in the same unit, without waiting for a consolidation", () => {
  it("a row mirrored before the secret is redacted or switched off as soon as the knowledge lines apply", async () => {
    const { coordinator, mirror } = coordinatorHarness([]);
    await coordinator.syncWorldInfo();
    expect(mirror.live()).toMatch(SECRET);
    coordinator.applyEpistemic(LEARN_SECRET, 12);
    await coordinator.mirror.settled();
    expect(mirror.book.get("so_whole")?.disable).toBe(true);
    expect(mirror.book.get("so_mixed")).toEqual({ content: "Kel trusts Aria with his life.", disable: false });
    expect(mirror.live()).not.toMatch(SECRET);
  });

  it("a chat switch before the re-sync writes nothing into the book", async () => {
    const { coordinator, mirror, switchChat } = coordinatorHarness([]);
    await coordinator.syncWorldInfo();
    const before = mirror.writes.count;
    coordinator.applyEpistemic(LEARN_SECRET, 12);
    switchChat();
    await coordinator.mirror.settled();
    expect(mirror.writes.count).toBe(before);
    expect(mirror.book.get("so_whole")?.disable).toBe(false);
  });

  it("negative control: knowledge that changes no held secret starts no re-sync, so the book still holds the row (the assertions above can fail)", async () => {
    const { coordinator, mirror } = coordinatorHarness([]);
    await coordinator.syncWorldInfo();
    const before = mirror.writes.count;
    coordinator.applyEpistemic([{ tag: "knows", subject: "Aria", content: "the river ford is shallow near the willow grove" }], 12);
    await coordinator.mirror.settled();
    expect(mirror.writes.count).toBe(before);
    expect(mirror.live()).toMatch(SECRET);
  });

  it("control: with no mirror book adopted yet, a learned secret starts no sync (nothing was mirrored to redact)", async () => {
    const { coordinator, mirror } = coordinatorHarness([]);
    coordinator.applyEpistemic(LEARN_SECRET, 12);
    await coordinator.mirror.settled();
    expect(mirror.writes.count).toBe(0);
  });
});

const FOLDED: MemoryEntry[] = [
  row("f-secret", "Kel carries a silver key to the old vault.", { foldedInto: "arrival#1" } as Partial<MemoryEntry>),
  row("f-mixed", "Kel trusts Aria with his life. Kel carries a silver key to the old vault.", { foldedInto: "arrival#1" } as Partial<MemoryEntry>),
  row("f-plain", "Kel and Bram fought side by side at the ford.", { foldedInto: "arrival#1" } as Partial<MemoryEntry>),
];

function recallHarness(epistemic: EpistemicEntry[], filtered = true) {
  const { coordinator } = coordinatorHarness(epistemic, FOLDED);
  const context: RunContext = { chatId: "chat-a", storyId: "secret-mirror", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const memory = {
    entries: FOLDED, arcs: [], chapters: [{ id: "arrival#1", chapterId: "arrival", playerTitle: "Arrival", status: "sealed", range: { from: 0, to: 9 } }],
    settings: { enabled: true, chapters: { archiveRecall: true, recallTokens: 400 }, injectionDepths: { scene_history: 6 } },
  };
  const prompt = { setStoryExtensionPrompt: jest.fn(), clearStoryExtensionPrompt: jest.fn() };
  const injector = filtered ? coordinator.injector : { restingEntries: (entries: MemoryEntry[]) => entries };
  const port = {
    recalled: false,
    host: {
      coordinator: { updateInjection: jest.fn(), injector },
      memory: () => memory,
      deps: {
        getStory: () => story,
        getState: () => ({ boundary: 8, lastMessageId: 12, activeCheckpointId: "a", visitedPath: ["a"] }),
        ownership,
        chapterHost: { journal: jest.fn() },
        hosts: {
          vectors: { source: "transformers", capabilityState: async () => "absent" },
          prompt,
          injection: { readInjectedPromptBlocks: () => [{ key: memoryExtensionKey("scene_history"), value: "[Recent scenes]\n- the ford" }] },
        },
      },
    },
  };
  const written = () => prompt.setStoryExtensionPrompt.mock.calls.map((call) => String(call[1])).join("\n");
  return { port: port as unknown as ChapterPort, written };
}

const turn = [{ is_user: true, mes: "Kel, what do you remember?" }];

describe("T7-1 review: archive recall appends folded rows through the resting view (the drafted member is not known at the interceptor)", () => {
  it("the folded row that tells the secret is not recalled, the mixed row is recalled without its secret sentence", async () => {
    const r = recallHarness(SECRET_KNOWLEDGE);
    expect(await recall(r.port, turn, "normal")).toBe(2);
    expect(r.written()).not.toMatch(SECRET);
    expect(r.written()).toContain("Recalled from Arrival: Kel trusts Aria with his life.");
    expect(r.written()).toContain("Recalled from Arrival: Kel and Bram fought side by side at the ford.");
  });

  it("negative control: without the filter the secret is recalled into the shared block", async () => {
    const r = recallHarness(SECRET_KNOWLEDGE, false);
    await recall(r.port, turn, "normal");
    expect(r.written()).toMatch(SECRET);
  });

  it("control: with no secret held the secret row is recalled verbatim", async () => {
    const r = recallHarness([ARIA_KNOWS]);
    await recall(r.port, turn, "normal");
    expect(r.written()).toContain("Recalled from Arrival: Kel carries a silver key to the old vault.");
  });
});
