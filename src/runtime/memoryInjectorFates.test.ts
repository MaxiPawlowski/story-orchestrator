import type { MemoryEntry } from "@memory/index";
import { MemoryInjector } from "./memoryInjector";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const setStoryExtensionPrompt = jest.fn();
const hosts = {
  prompt: { setStoryExtensionPrompt, clearStoryExtensionPrompt: jest.fn() },
  roster: { getActiveGroup: () => null, resolveGroupMemberId: () => null, chatRows: () => [], systemUserName: "SillyTavern System" },
  chat: { chatRows: () => [], lastMessageText: () => "" },
  injection: { getCharacterNameById: () => null, readInjectedPromptBlocks: () => [] },
} as unknown as InjectorHosts;

const entry = (id: string, text: string, patch: Partial<MemoryEntry> = {}) => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 1, recallCount: 0, ...patch,
}) as MemoryEntry;

const harness = (entries: MemoryEntry[]) => {
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 4, short_term: 4, scene_history: 6 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 }, scoreWeights: undefined },
    entries,
    epistemic: [],
    ledger: [],
    arcs: [],
    pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const overflow: number[] = [];
  const injector = new MemoryInjector({
    getStory: () => ({ roster: [], checkpointById: {} }) as never,
    getState: () => null,
    memory: () => memory,
    enabled: () => true,
    capable: () => false,
    ledgerBindings: () => [],
    setPinnedOverflow: (count) => { overflow.push(count); },
    beatFor: () => "",
    hosts: () => hosts,
  });
  return { injector, memory, overflow };
};

describe("memory fates ride the injection that wrote the blocks (v2.4 plan 08 T19c, inv 16)", () => {
  it("reports no fates before the first injection, and each row's fate after it", () => {
    const { injector } = harness([entry("a", "The sun-key opens the sanctum."), entry("q", "The gate is sealed.", { provenance: { source: "extractor", messageId: 2, boundary: 1, pass: "shared-read", validity: "source-removed" } })]);
    expect(injector.readModels().memoryInjection).toBeNull();
    injector.update();
    expect(injector.readModels().memoryInjection?.fates).toEqual({ a: "injected", q: "quarantined" });
    expect(setStoryExtensionPrompt).toHaveBeenCalledWith(expect.stringContaining("facts"), "The sun-key opens the sanctum.", 4);
  });

  it("refreshes the fates on the next update, never lagging the block", () => {
    const rows = [entry("a", "The sun-key opens the sanctum.")];
    const { injector, memory } = harness(rows);
    injector.update();
    (memory as { entries: MemoryEntry[] }).entries = [{ ...rows[0], supersededBy: "b" }, entry("b", "The sun-key is broken.")];
    injector.update();
    expect(injector.readModels().memoryInjection?.fates).toEqual({ a: "superseded", b: "injected" });
  });

  it("keeps the session high-water mark per tier, and derives pinned overflow from the fates", () => {
    const { injector, memory, overflow } = harness([entry("p1", "a".repeat(1200), { pinned: true }), entry("p2", "b".repeat(1200), { pinned: true })]);
    injector.update();
    expect(overflow).toEqual([1]);
    const first = injector.readModels().memoryInjection?.trim.facts.highWater ?? 0;
    expect(first).toBeGreaterThan(0);
    (memory as { entries: MemoryEntry[] }).entries = [];
    injector.update();
    expect(injector.readModels().memoryInjection?.trim.facts).toMatchObject({ tokensUsed: 0, highWater: first });
  });
});
