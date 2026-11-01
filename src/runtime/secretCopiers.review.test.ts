const handlers = new Map<string, (...args: unknown[]) => void>();
const host: { prompts: Record<string, { value: string; position: number; depth: number } | undefined> } = { prompts: {} };

jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: jest.fn(() => ({ chat: [], extensionPrompts: host.prompts })),
  subscribeToHostEvents: jest.fn((entries: Array<{ eventName: string; handler: (...args: unknown[]) => void }>) => {
    entries.forEach((entry) => handlers.set(entry.eventName, entry.handler));
    return () => entries.forEach((entry) => handlers.delete(entry.eventName));
  }),
}));

import { parseStoryOrThrow } from "@engine/index";
import type { EpistemicEntry } from "@memory/index";
import { SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY } from "@services/stHost/transcriptCopiers";
import { startCopierFilter, type CopierFilter } from "./copierFilterHost";
import { MemoryCoordinator } from "./coordinators/memoryCoordinator";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import { copierWarning, secretLeaks } from "./transcriptCopiers";
import type { MemoryRuntimeState } from "./types";

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["aria", "Aria"], ["bram", "Bram"]];
const NAMES = CAST.map(([, name]) => name);
const SECRET = /silver key|vault/i;
const ARIA = 1;
const BRAM = 2;
const STRANGER = 9;

const story = parseStoryOrThrow({
  id: "secret-copiers",
  title: "Secret Copiers",
  description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: CAST.map(([id, name]) => ({ id, name })),
});

const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Bram", content: "that he carries a silver key to the old vault", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const ARIA_KNOWS = { id: "k-aria", subject: "Aria", tag: "knows", content: "Kel carries a silver key to the old vault", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const SECRET_KNOWLEDGE = [HIDING, ARIA_KNOWS];

const SUMMARY = "[Summary: Kel trusts Aria with his life. Kel keeps a silver key for the old vault on his belt.\nThey held the ford until the river fell.]";
const RECALLED = "Past events:\nAria: Kel carries a silver key to the old vault, I saw it.\n\nBram: We held the ford until the river fell.";

function harness(epistemic: EpistemicEntry[]) {
  const context: RunContext = { chatId: "chat-a", storyId: "secret-copiers", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
  const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
  const prompt = { setStoryExtensionPrompt: () => undefined, clearStoryExtensionPrompt: () => undefined };
  const hosts = {
    prompt,
    roster: { getActiveGroup: () => ({ id: "g", members: NAMES.map((name) => `${name}.png`), disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }), chatId: () => "chat-a" },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1] ?? (index === STRANGER ? "Stranger" : undefined), readInjectedPromptBlocks: () => [] },
  };
  const state = { boundary: 8, lastMessageId: 12, activeCheckpointId: "a", visitedPath: ["a"], visitedAnchors: ["a"], checkpointStartedBoundary: 0, blackboard: { values: {}, versions: {}, latched: {} } };
  let memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 } },
    entries: [], epistemic, ledger: [], arcs: [], derived: [], conflicts: [], resolvedConflicts: [], pinnedOverflow: 0, wiWrites: {}, wiBook: null,
    canon: null, chronicle: { eras: [] }, chapters: [],
  } as unknown as MemoryRuntimeState;
  const deps = {
    hosts, getStory: () => story, getState: () => state, getMemory: () => memory, setMemory: (next: MemoryRuntimeState) => { memory = next; },
    getFiredTransitions: () => [], getExpansionGateSources: () => [], enqueueExtractorDeltas: () => undefined, enqueueMechanical: () => undefined,
    ownership, judge: () => null, persist: async () => undefined, notify: () => undefined,
  };
  const coordinator = new MemoryCoordinator(deps as never);
  coordinator.updateInjection();
  return coordinator;
}

const setExtensionPrompt = (key: string, value: string) => { host.prompts[key] = { value, position: 0, depth: 4 }; };

const vectorsInterceptor = jest.fn(async () => { setExtensionPrompt(VECTORS_PROMPT_KEY, RECALLED); });

let filter: CopierFilter | null = null;

beforeEach(() => {
  host.prompts = {};
  handlers.clear();
  Reflect.set(globalThis, "vectors_rearrangeChat", vectorsInterceptor);
  setExtensionPrompt(SUMMARIZE_PROMPT_KEY, SUMMARY);
});

afterEach(() => {
  filter?.dispose();
  filter = null;
  Reflect.deleteProperty(globalThis, "vectors_rearrangeChat");
});

const generate = async (coordinator: MemoryCoordinator, chId: number | null, on = true) => {
  filter ??= startCopierFilter(() => (on ? coordinator.injector.copierView() : null));
  if (chId !== null) coordinator.injector.onMemberDrafted(chId);
  filter.intercept();
  await (Reflect.get(globalThis, "vectors_rearrangeChat") as () => Promise<void>)();
  const sent = { summary: host.prompts[SUMMARIZE_PROMPT_KEY]?.value ?? "", recalled: host.prompts[VECTORS_PROMPT_KEY]?.value ?? "" };
  handlers.get("GENERATE_AFTER_DATA")?.({}, false);
  return sent;
};

describe("v3.0 43 V: Summarize's summary and Vector Storage's recalled messages reach each drafted member through the held-secret rule", () => {
  it("a kept-out member's prompt loses the sentences that restate the secret, and keeps the rest", async () => {
    const sent = await generate(harness(SECRET_KNOWLEDGE), BRAM);
    expect(sent.summary).not.toMatch(SECRET);
    expect(sent.summary).toContain("Kel trusts Aria with his life.");
    expect(sent.summary).toContain("They held the ford until the river fell.");
    expect(sent.recalled).not.toMatch(SECRET);
    expect(sent.recalled).toContain("Bram: We held the ford until the river fell.");
  });

  it("negative control: with the filter off the kept-out member's prompt carries the secret through both", async () => {
    const sent = await generate(harness(SECRET_KNOWLEDGE), BRAM, false);
    expect(sent.summary).toMatch(SECRET);
    expect(sent.recalled).toMatch(SECRET);
  });

  it("a member who holds the secret gets both blocks verbatim, after a kept-out member was drafted first", async () => {
    const coordinator = harness(SECRET_KNOWLEDGE);
    await generate(coordinator, BRAM);
    expect(await generate(coordinator, ARIA)).toEqual({ summary: SUMMARY, recalled: RECALLED });
  });

  it("a drafted card outside the roster gets the resting view", async () => {
    const sent = await generate(harness(SECRET_KNOWLEDGE), STRANGER);
    expect(sent.summary).not.toMatch(SECRET);
    expect(sent.recalled).not.toMatch(SECRET);
  });

  it("with no secret held every member's blocks are byte-identical to what the extensions wrote", async () => {
    const coordinator = harness([ARIA_KNOWS]);
    for (const chId of [ARIA, BRAM, STRANGER]) expect(await generate(coordinator, chId)).toEqual({ summary: SUMMARY, recalled: RECALLED });
  });

  it("after the prompt is built the host holds the raw summary again, so Summarize's next pass and the chat are untouched", async () => {
    await generate(harness(SECRET_KNOWLEDGE), BRAM);
    expect(host.prompts[SUMMARIZE_PROMPT_KEY]?.value).toBe(SUMMARY);
    expect(host.prompts[VECTORS_PROMPT_KEY]?.value).toBe(RECALLED);
  });

  it("a new summary written between drafts is taken as the new raw text", async () => {
    const coordinator = harness(SECRET_KNOWLEDGE);
    filter = startCopierFilter(() => coordinator.injector.copierView());
    coordinator.injector.onMemberDrafted(BRAM);
    filter.intercept();
    setExtensionPrompt(SUMMARIZE_PROMPT_KEY, "[Summary: The river fell at dawn.]");
    filter.intercept();
    expect(host.prompts[SUMMARIZE_PROMPT_KEY]?.value).toBe("[Summary: The river fell at dawn.]");
    coordinator.injector.onMemberDrafted(ARIA);
    filter.intercept();
    expect(host.prompts[SUMMARIZE_PROMPT_KEY]?.value).toBe("[Summary: The river fell at dawn.]");
  });

  it("impersonate and quiet generations withhold private knowledge and leave the copiers' text as written", async () => {
    const coordinator = harness(SECRET_KNOWLEDGE);
    coordinator.injector.onMemberDrafted(BRAM);
    coordinator.injector.withholdPrivateKnowledge();
    expect(await generate(coordinator, null)).toEqual({ summary: SUMMARY, recalled: RECALLED });
  });

  it("the vectors interceptor is wrapped once and given back on dispose", async () => {
    const coordinator = harness(SECRET_KNOWLEDGE);
    await generate(coordinator, BRAM);
    await generate(coordinator, BRAM);
    expect(vectorsInterceptor).toHaveBeenCalled();
    filter?.dispose();
    filter = null;
    expect(Reflect.get(globalThis, "vectors_rearrangeChat")).toBe(vectorsInterceptor);
  });
});

describe("v3.0 43 V: the transcript-copiers check names only what the filter does not cover", () => {
  const SUMMARY_BLOCK = { key: SUMMARIZE_PROMPT_KEY };
  const VECTORS_BLOCK = { key: VECTORS_PROMPT_KEY };

  it("with the filter on, Summarize and Vector Storage are no longer named; VectFox still is", () => {
    expect(secretLeaks(true, [SUMMARY_BLOCK, VECTORS_BLOCK], [], true)).toEqual([]);
    expect(secretLeaks(true, [SUMMARY_BLOCK, { key: "3_vectfox" }], [SUMMARIZE_PROMPT_KEY], true)).toEqual(["VectFox"]);
  });

  it("with the filter off both are named again", () => {
    expect(secretLeaks(true, [SUMMARY_BLOCK, VECTORS_BLOCK], [], false)).toEqual(["Summarize", "Vector Storage"]);
  });

  it("the player-facing warning is the same with and without a held secret", () => {
    const input = { playing: true, groupChat: true, foreign: [SUMMARY_BLOCK, { key: "3_vectfox" }], filtered: true };
    expect(copierWarning({ ...input, secretsHeld: true }).secretLeaks).toEqual(copierWarning({ ...input, secretsHeld: false }).secretLeaks);
  });
});
