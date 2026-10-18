import { parseStoryOrThrow, type BoundaryResult } from "@engine/index";
import { EPISTEMIC_INJECTION_KEY, LEDGER_INJECTION_KEY, MEMORY_INJECTION_KEY_PREFIX } from "@constants/defaults";
import type { EpistemicEntry, MemoryEntry } from "@memory/index";
import { createRumors } from "@memory/rumors/state";
import { MemoryInjector } from "./memoryInjector";
import { createRumorPort, rumorAuthorSlice } from "./rumorPort";
import { testOwnership } from "../../test/findings/testOwnership";
import { runRollback, type RollbackDeps } from "./rollback";
import type { MemoryRuntimeState, RuntimeExtras } from "./types";
import type { InjectorHosts } from "./hostPorts";

jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

const CAST: Array<[string, string]> = [["narrator", "Narrator"], ["kel", "Kel"], ["tam", "Tam"], ["cora", "Cora"]];
const SECRET = /silver key|vault/i;

const story = parseStoryOrThrow({
  id: "rumor-secret", title: "Rumor secret", description: "",
  qualities: [{ key: "confess", type: "bool", source: "extractor", rubric: "Did Kel confess?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [
    { id: "narrator", name: "Narrator" },
    { id: "kel", name: "Kel", gossip: { talks_to: ["narrator"], contact: "any", delay: { boundaries: [0, 0] } } },
    { id: "tam", name: "Tam" },
    { id: "cora", name: "Cora" },
  ],
  rumors: [
    { id: "vault-key", from: "kel", claim: "Kel carries a silver key to the old vault", leaks_to: [{ member: "tam", when: { q: "confess", op: "==", v: true } }] },
    { id: "ford", from: "kel", claim: "the river ford flooded at dawn" },
  ],
});

const entry = (id: string, text: string): MemoryEntry => ({
  id, tier: "session_details", text, messageId: 3, createdAt: 3, type: "detail", importance: 2, expiration: "session",
  entities: [], confidence: 1, activationTriggers: [], evidence: text, recallCount: 0,
}) as unknown as MemoryEntry;

const HIDING = { id: "h-kel", subject: "Kel", tag: "hiding", hiddenFrom: "Tam, Cora", content: "that he carries a silver key to the old vault", messageId: 2, createdAt: 2, provenance: { validity: "live" } } as unknown as EpistemicEntry;

function harness(extras: RuntimeExtras) {
  const blocks = new Map<string, string>();
  const hosts = {
    prompt: { setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); }, clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); } },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => CAST[index]?.[1], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const budgets = { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 };
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: budgets },
    entries: [entry("secret", "Kel carries a silver key to the old vault."), entry("plain", "The river ford is shallow near the willows.")],
    epistemic: [HIDING], ledger: [], arcs: [], derived: [], pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const injector = new MemoryInjector({
    getStory: () => story,
    getState: () => ({ boundary: 8, activeCheckpointId: "a", blackboard: { values: {}, versions: {} } }) as never,
    memory: () => memory, enabled: () => true, capable: () => true, ledgerBindings: () => [], setPinnedOverflow: () => undefined, beatFor: () => "", hosts: () => hosts,
  });
  const calls = { refresh: 0, resync: 0, persist: 0, journal: [] as string[] };
  let values: Record<string, boolean> = { confess: false };
  const port = createRumorPort({
    getStory: () => story, values: () => values, extras: () => extras, chatId: () => "chat-r", storyId: () => "rumor-secret", enabledIds: () => CAST.map(([id]) => id),
    revisionAt: () => ({ swipeId: null, hash: "h" }), historyFloor: () => null, epistemic: () => memory.epistemic,
    refresh: () => { calls.refresh += 1; injector.update(); }, heldKey: () => injector.heldSecretsKey(), resync: () => { calls.resync += 1; },
    persist: () => { calls.persist += 1; }, notify: () => undefined, journal: (summary) => { calls.journal.push(summary); },
  });
  injector.addPrivateSource((rosterId) => port.lines(rosterId));
  injector.addDisclosureSource(() => port.disclosures());
  injector.update();
  const shared = () => [...blocks].filter(([key]) => key.startsWith(MEMORY_INJECTION_KEY_PREFIX) || key === LEDGER_INJECTION_KEY).map(([, value]) => value).join("\n");
  const draft = (name: string) => {
    injector.onMemberDrafted(CAST.findIndex(([, cast]) => cast === name));
    return { shared: shared(), private: blocks.get(EPISTEMIC_INJECTION_KEY) ?? "" };
  };
  const finish = () => { injector.releaseDraft(); injector.update(); return shared(); };
  const boundary = (n: number) => port.onBoundary({ boundary: n, context: { lastMessageId: n * 2 } } as unknown as BoundaryResult);
  return { port, injector, draft, finish, shared, calls, boundary, confess: () => { values = { confess: true }; } };
}

const extrasOf = (): RuntimeExtras => ({ memory: { settings: { rumors: true } }, ui: { authorView: false } }) as unknown as RuntimeExtras;

describe("plan 44 G11: a rumor's secret reaches its one recipient and no other member, through every tier", () => {
  it("before the leak no barred member gets it; open news still travels", () => {
    const extras = extrasOf();
    const h = harness(extras);
    h.boundary(1);
    h.boundary(2);
    expect(extras.rumors?.hearsay.map((row) => [row.receiver, row.rumorId])).toEqual([["narrator", "ford"]]);
    expect(h.draft("Tam").private).not.toMatch(SECRET);
    expect(h.draft("Tam").shared).not.toMatch(SECRET);
    expect(h.draft("Narrator").private).toContain("Kel told you: the river ford flooded at dawn");
  });

  it("after the leak Tam knows it in its private block and shared tiers; Cora and the resting view do not", () => {
    const extras = extrasOf();
    const h = harness(extras);
    h.boundary(1);
    const keyBefore = h.injector.heldSecretsKey();
    h.confess();
    h.boundary(2);
    expect(extras.rumors?.disclosures).toEqual([expect.objectContaining({ entryId: "h-kel", member: "tam" })]);
    expect(h.injector.heldSecretsKey()).not.toBe(keyBefore);
    expect(h.calls.resync).toBe(1);
    const tam = h.draft("Tam");
    expect(tam.private).toContain("Kel told you: Kel carries a silver key to the old vault");
    expect(tam.shared).toMatch(SECRET);
    const cora = h.draft("Cora");
    expect(cora.private).not.toMatch(SECRET);
    expect(cora.shared).not.toMatch(SECRET);
    expect(h.finish()).not.toMatch(SECRET);
  });

  it("a rollback past the leak bars Tam again, and the hop waits to land at the same point", async () => {
    const extras = extrasOf();
    const h = harness(extras);
    h.confess();
    h.boundary(1);
    h.boundary(2);
    const leak = extras.rumors?.events.find((event) => event.to === "tam");
    await runRollback(rollbackDeps(extras), leak?.landedAt?.messageId ?? 0);
    expect(extras.rumors?.disclosures).toEqual([]);
    h.injector.update();
    expect(h.draft("Tam").private).not.toMatch(SECRET);
    expect(h.draft("Tam").shared).not.toMatch(SECRET);
    h.boundary(leak?.landedAt?.boundary ?? 0);
    expect(extras.rumors?.events.find((event) => event.to === "tam")).toEqual(leak);
  });

  it("the held-secret backstop still redacts a hearsay line that restates a secret without a disclosure", () => {
    const extras = extrasOf();
    const h = harness(extras);
    extras.rumors = { ...createRumors(), hearsay: [{ occurrenceId: "x", receiver: "cora", teller: "kel", rumorId: "vault-key", claim: "Kel carries a silver key to the old vault", stance: "unsure", told: { messageId: 2, revision: null } }] };
    h.injector.update();
    expect(h.draft("Cora").private).not.toMatch(SECRET);
  });

  it("G6: player surfaces and the resting view are identical with and without rumors in flight", () => {
    const quiet = harness(extrasOf());
    const busyExtras = extrasOf();
    const busy = harness(busyExtras);
    busy.confess();
    busy.boundary(1);
    busy.boundary(2);
    expect(busy.finish()).toBe(quiet.finish());
    expect(busy.injector.restingEntries([entry("secret", "Kel carries a silver key to the old vault.")])).toEqual(quiet.injector.restingEntries([entry("secret", "Kel carries a silver key to the old vault.")]));
    expect(rumorAuthorSlice(story, busyExtras)).toBeNull();
    expect(rumorAuthorSlice(story, { ...busyExtras, ui: { authorView: true } } as RuntimeExtras)?.length).toBeGreaterThan(0);
  });

  it("switched off: nothing spreads, no line, no disclosure", () => {
    const extras = { memory: { settings: { rumors: false } }, ui: { authorView: false } } as unknown as RuntimeExtras;
    const h = harness(extras);
    h.confess();
    h.boundary(1);
    h.boundary(2);
    expect(extras.rumors).toBeUndefined();
    expect(h.port.disclosures()).toEqual([]);
    expect(h.calls.persist).toBe(0);
  });
});

function rollbackDeps(extras: RuntimeExtras): RollbackDeps {
  Object.assign(extras, { extraction: { audits: [] }, judge: { calls: [], meter: {} }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] } });
  return {
    ownership: testOwnership(),
    engine: {
      shouldRollbackFromMessage: () => false, boundaryBeforeMessage: () => 0, serialize: () => ({ boundary: 1, checkpointStartedMessageId: 0 }),
      clampToChat: () => false, discardPendingFrom: () => [], rollbackTo: () => ({ ok: true, result: "applied" }), ensureActiveCheckpoint: () => null, activeCheckpoint: null,
    },
    journal: { record: () => undefined },
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    extras: () => extras,
    refreshRequirements: () => undefined, reapplyCheckpoint: async () => undefined, persist: async () => undefined, notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null }, setStatus: () => undefined, onApplied: () => undefined,
  } as unknown as RollbackDeps;
}
