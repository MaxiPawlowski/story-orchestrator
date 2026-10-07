jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [] })),
}));

import { parseStoryV2OrThrow } from "@engine/index";
import { getCanonLite } from "@extraction/canonLite";
import type { ModelAsk } from "@extraction/modelRoute";
import { canonHistory, heldSecrets, withoutSecretLines, type ArcEntry, type EpistemicEntry, type MemoryEntry } from "@memory/index";
import { CanonSynthesis } from "./canonSynthesis";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { storySoFar } from "./chapterKit";
import type { ChapterHost } from "./chapterPort";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["aria", "Aria"], ["bram", "Bram"]];
const SECRET = /silver key|vault/i;

const story = parseStoryV2OrThrow({
  format: 2,
  id: "secret-canon",
  title: "Secret Canon",
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
  row("paraphrase", "Kel keeps a silver key for the old vault on his belt."),
  row("mixed", "Kel trusts Aria with his life. Kel carries a silver key to the old vault."),
  row("plain", "Kel and Bram fought side by side at the ford."),
  row("scene-secret", "Kel unlocked the old vault with his silver key at midnight.", { tier: "scene_history" }),
  row("scene-plain", "The company crossed the ford at dawn.", { tier: "scene_history" }),
];

const ARCS = [
  { id: "arc-ford", text: "the ford", status: "resolved", summary: "Kel showed Aria the silver key to the old vault.\nThey held the ford until the river fell." },
] as unknown as ArcEntry[];

const STORED = [
  "WHAT HAS HAPPENED:",
  "Kel trusts Aria with his life. Kel keeps a silver key for the old vault on his belt.",
  "Kel and Bram fought side by side at the ford.",
  "CURRENT STATE:",
  "The company rests at the ford.",
].join("\n");

const REPLY = "WHAT HAS HAPPENED:\nKel and Bram held the ford.\nCURRENT STATE:\nThe company rests.";

function harness(epistemic: EpistemicEntry[], canon: { text: string; stale?: boolean } | null = null, entries: MemoryEntry[] = ENTRIES) {
  const context: RunContext = { chatId: "chat-a", storyId: "secret-canon", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const prompts: string[] = [];
  const model = async (prompt: string, _ask: ModelAsk) => { prompts.push(prompt); return { text: REPLY, finish: "stop" as const }; };
  const hosts = {
    prompt: { setStoryExtensionPrompt: () => undefined, clearStoryExtensionPrompt: () => undefined },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }), chatId: () => "chat-a" },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
  };
  const state = { boundary: 8, lastMessageId: 12, activeCheckpointId: "a", visitedPath: ["a"], visitedAnchors: ["a"], blackboard: { values: {}, versions: {}, latched: {} } };
  let memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, chapters: {}, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 } },
    entries, epistemic, ledger: [], arcs: ARCS, derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, wiWrites: {}, wiBook: null,
    canon: canon ? { inputHash: "old", updatedAt: "2026-10-07T00:00:00.000Z", stale: false, sources: [], ...canon } : null,
    chronicle: { eras: [] }, chapters: [],
  } as Record<string, unknown>;
  const coordinator = new MemoryCoordinator({
    hosts,
    getStory: () => story,
    getState: () => state,
    getMemory: () => memory,
    setMemory: (next: typeof memory) => { memory = next; },
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => undefined,
    enqueueMechanical: () => undefined,
    ownership,
    model,
    judge: () => null,
    persist: async () => undefined,
    notify: () => undefined,
  } as never);
  const unfiltered = new CanonSynthesis({
    getStory: () => story, getState: () => state as never, memory: () => memory as never,
    patch: (next) => { memory = { ...memory, ...(next as object) }; }, record: () => {}, save: async () => {},
    model: () => model, ownership: () => ownership, enabled: () => true, firedTransitions: () => [], facts: () => coordinator.getFacts(),
    restingEntries: (rows) => rows, restingLines: (text) => text,
  });
  const chapterHost = { coordinator, memory: () => memory, deps: { getStory: () => story, getState: () => state } } as unknown as ChapterHost;
  const learn = (next: EpistemicEntry[]) => { memory = { ...memory, epistemic: next }; };
  return { coordinator, unfiltered, prompts, chapterHost, learn, memory: () => memory };
}

describe("canon and held secrets: the synthesis input is the resting view, so the stored canon is built without the secret", () => {
  it("the canon prompt carries neither the secret nor its paraphrase, from facts or arc summaries; the rest is kept", async () => {
    const run = harness(SECRET_KNOWLEDGE);
    expect(await run.coordinator.canon.regenerateCanon(true)).toBe(true);
    expect(run.prompts).toHaveLength(1);
    expect(run.prompts[0]).not.toMatch(SECRET);
    expect(run.prompts[0]).toContain("Kel trusts Aria with his life.");
    expect(run.prompts[0]).toContain("Kel and Bram fought side by side at the ford.");
    expect(run.prompts[0]).toContain("They held the ford until the river fell.");
  });

  it("negative control: without the resting view the secret and its paraphrase reach the canon prompt", async () => {
    const run = harness(SECRET_KNOWLEDGE);
    await run.unfiltered.regenerateCanon(true);
    expect(run.prompts[0]).toMatch(/silver key to the old vault/);
    expect(run.prompts[0]).toContain("Kel keeps a silver key for the old vault on his belt.");
  });

  it("control: with no held secret the prompt is byte-identical to the unfiltered one", async () => {
    const filtered = harness([ARIA_KNOWS]);
    const plain = harness([ARIA_KNOWS]);
    await filtered.coordinator.canon.regenerateCanon(true);
    await plain.unfiltered.regenerateCanon(true);
    expect(filtered.prompts[0]).toBe(plain.prompts[0]);
    expect(filtered.prompts[0]).toMatch(SECRET);
  });

  it("a secret held after the last synthesis changes the input hash, so the next unforced pass rebuilds without it", async () => {
    const run = harness([ARIA_KNOWS]);
    await run.coordinator.canon.regenerateCanon(true);
    expect(await run.coordinator.canon.regenerateCanon()).toBe(false);
    run.learn(SECRET_KNOWLEDGE);
    expect(await run.coordinator.canon.regenerateCanon()).toBe(true);
    expect(run.prompts[1]).not.toMatch(SECRET);
  });
});

describe("canon and held secrets: every reader of the stored text goes through the resting view, line by line", () => {
  const cases: Array<[string, (synthesis: CanonSynthesis) => string]> = [
    ["getCanon (story_canon macro, curator, expansion)", (synthesis) => synthesis.getCanon()],
    ["getCanonAt (driver)", (synthesis) => synthesis.getCanonAt("b")],
    ["getCanonProse (drawer Overview, away recap, /story recap)", (synthesis) => synthesis.getCanonProse()],
  ];

  it.each(cases)("%s drops the secret sentence a canon stored before the secret was held still carries", (_label, read) => {
    const run = harness(SECRET_KNOWLEDGE, { text: STORED });
    const shown = read(run.coordinator.canon);
    expect(shown).not.toMatch(SECRET);
    expect(shown).toContain("Kel trusts Aria with his life.");
    expect(shown).toContain("Kel and Bram fought side by side at the ford.");
  });

  it.each(cases)("negative control: %s without the resting view shows the secret", (_label, read) => {
    const run = harness(SECRET_KNOWLEDGE, { text: STORED });
    expect(read(run.unfiltered)).toMatch(SECRET);
  });

  it.each(cases)("control: %s with no held secret is byte-identical to the unfiltered reader", (_label, read) => {
    const run = harness([ARIA_KNOWS], { text: STORED });
    expect(read(run.coordinator.canon)).toBe(read(run.unfiltered));
  });

  it("the story-so-far block (injected at depth 8 and the story_so_far macro) carries the canon without the secret", () => {
    const run = harness(SECRET_KNOWLEDGE, { text: STORED });
    const block = storySoFar(run.chapterHost);
    expect(block).not.toMatch(SECRET);
    expect(block).toContain("Kel and Bram fought side by side at the ford.");
  });

  it("control: with no held secret the story-so-far block holds the stored canon verbatim", () => {
    const run = harness([ARIA_KNOWS], { text: STORED });
    expect(storySoFar(run.chapterHost)).toBe(`[This chapter]\n${STORED}`);
    expect(storySoFar(run.chapterHost)).toMatch(SECRET);
  });
});

describe("canon and held secrets: the fallbacks are the resting view too", () => {
  it("canon-lite (no canon yet) leaves out the fact that tells the secret or its paraphrase", () => {
    const run = harness(SECRET_KNOWLEDGE);
    const shown = run.coordinator.canon.getCanon();
    expect(shown).not.toMatch(SECRET);
    expect(shown).toContain("Fact(2): Kel and Bram fought side by side at the ford.");
    expect(run.unfiltered.getCanon()).toMatch(SECRET);
  });

  it("control: canon-lite with no held secret is exactly getCanonLite", () => {
    const run = harness([ARIA_KNOWS]);
    expect(run.coordinator.canon.getCanon()).toBe(getCanonLite(story, ["a"], [], run.coordinator.getFacts()));
  });

  it("the scene-history fallback of the player prose withholds the scene that tells the secret", () => {
    const run = harness(SECRET_KNOWLEDGE);
    expect(run.coordinator.canon.getCanonProse()).toBe("The company crossed the ford at dawn.");
    expect(run.unfiltered.getCanonProse()).toMatch(SECRET);
  });

  it("control: with no held secret the scene-history fallback is unchanged", () => {
    const run = harness([ARIA_KNOWS]);
    expect(run.coordinator.canon.getCanonProse()).toBe(run.unfiltered.getCanonProse());
    expect(run.coordinator.canon.getCanonProse()).toMatch(SECRET);
  });
});

describe("withoutSecretLines", () => {
  const secrets = heldSecrets(SECRET_KNOWLEDGE, CAST.map(([, name]) => name));

  it("keeps the line structure canonHistory reads, dropping only what restates a secret", () => {
    const shown = withoutSecretLines(STORED, secrets, null);
    expect(shown).toBe([
      "WHAT HAS HAPPENED:",
      "Kel trusts Aria with his life.",
      "Kel and Bram fought side by side at the ford.",
      "CURRENT STATE:",
      "The company rests at the ford.",
    ].join("\n"));
    expect(canonHistory(shown)).toBe("Kel trusts Aria with his life.\nKel and Bram fought side by side at the ford.");
  });

  it("a member who holds the secret is shown the line; with no secret the text is returned as is", () => {
    expect(withoutSecretLines(STORED, secrets, ["aria"])).toBe(STORED);
    expect(withoutSecretLines(STORED, [], null)).toBe(STORED);
  });
});
