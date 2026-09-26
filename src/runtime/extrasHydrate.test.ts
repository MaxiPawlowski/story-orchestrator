jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));

import { isLive } from "@memory/index";
import { EXPANSION_CONTRACT } from "@generation/index";
import { sanitizeExpansion, sanitizeExtraction, sanitizeMemory } from "./extras";
import { repairActiveCheckpoint, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import type { RuntimeExtras } from "./types";

// v2.5 plan 11. Every stored row carries its envelope; one that does not is dropped at hydrate, and
// the drop is counted rather than silent.

const blob = (overrides: Record<string, unknown> = {}): RuntimeExtras => ({
  memory: {
    entries: [{ id: "m1", tier: "facts", text: "The bridge fell.", type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 1, recallCount: 0 }],
    epistemic: [{ id: "e1", subject: "Luke", tag: "knows", content: "the letter", createdAt: 2 }],
    ledger: [{ id: "l1", entity: "Mira", entityType: "character", field: "hp", value: "3", createdAt: 3 }],
    ...overrides,
  },
} as unknown as RuntimeExtras);

describe("hydrating stored rows and their envelopes", () => {
  it("drops a row without an envelope, and counts it", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const valid = { source: "extractor" as const, messageId: 4, boundary: 2, pass: "shared-read", validity: "live" as const };
    const memory = sanitizeMemory(blob({ entries: [blob().memory.entries[0], { ...blob().memory.entries[0], id: "m2", provenance: valid }, { ...blob().memory.entries[0], id: "m3", provenance: { source: "legacy", messageId: -1, boundary: -1, pass: "hydrate", validity: "live" } }] }));
    expect(memory.entries.map((entry) => entry.id)).toEqual(["m2"]);
    expect(memory.epistemic).toEqual([]);
    expect(memory.ledger).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("2 memory, 1 epistemic, 1 ledger"));
    warn.mockRestore();
  });

  it("keeps an envelope the blob already carries", () => {
    const existing = { source: "extractor" as const, messageId: 4, boundary: 2, pass: "shared-read", validity: "live" as const };
    const memory = sanitizeMemory(blob({ entries: [{ ...blob().memory.entries[0], provenance: existing }] }));
    expect(memory.entries[0].provenance).toEqual(existing);
  });

  it("hydrates a row that was quarantined before the save as still quarantined", () => {
    const memory = sanitizeMemory(blob({ entries: [{ ...blob().memory.entries[0], pinned: true, provenance: { source: "extractor" as const, messageId: 4, boundary: 2, pass: "shared-read", validity: "source-removed" as const } }] }));
    expect(memory.entries[0].provenance?.validity).toBe("source-removed");
    expect(isLive(memory.entries[0])).toBe(false);
  });
});

// v2.3 plan 07. The cache does not survive the contract that produced it: the entry is dropped and the
// stub re-generates on arrival.
describe("expansion cache contract", () => {
  const entry = (contract?: number) => ({ key: "a->b->c", status: "inserted", sourceCheckpointId: "a", stubId: "b", targetAnchorId: "c", basis: {}, blackboardVersionSum: 0, beats: [], needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [], lastError: null, attempts: 1, origin: "active", updatedAt: "x", ...(contract === undefined ? {} : { contract }) });

  it("a chain from another contract is dropped, and a current one is kept", () => {
    const kept = sanitizeExpansion({ expansion: { entries: { "a->b->c": entry(EXPANSION_CONTRACT) }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(Object.keys(kept.entries)).toEqual(["a->b->c"]);
    expect(kept.entries["a->b->c"].contract).toBe(EXPANSION_CONTRACT);

    const dropped = sanitizeExpansion({ expansion: { entries: { "a->b->c": { ...entry(), status: "cached" } }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(dropped.entries).toEqual({});
  });

  it("a playing chain from another contract is dropped too, and so is one with no origin", () => {
    const other = sanitizeExpansion({ expansion: { entries: { "a->b->c": { ...entry(), status: "inserted" } }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(other.entries).toEqual({});
    const { origin: _origin, ...unmarked } = entry(EXPANSION_CONTRACT);
    const originless = sanitizeExpansion({ expansion: { entries: { "a->b->c": unmarked }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(originless.entries).toEqual({});
  });
});

describe("v2.4 plan 03 D3: the scheduler snapshot is a display cache, not state", () => {
  const saved = (scheduler: unknown) => ({ extraction: { audits: [], reconciliationEvents: [], lastReadBoundary: 4, scheduler, judgedReads: [] } }) as unknown as RuntimeExtras;

  it("hydrate resets the persisted scheduler snapshot", () => {
    expect(sanitizeExtraction(saved({ queueDepth: 3, inFlight: true, lastError: "API request failed" })).scheduler).toEqual({ queueDepth: 0, inFlight: false, lastError: null });
  });

  it("hydrate carries no breaker, even from a blob that recorded one", () => {
    const hydrated = sanitizeExtraction(saved({ queueDepth: 1, inFlight: false, lastError: null, health: { kind: "transport", detail: "down", since: 1, nextProbeAt: 2, probing: false } }));
    expect(hydrated.scheduler).toEqual({ queueDepth: 0, inFlight: false, lastError: null });
  });

  it("control: hydrate keeps the rest of the extraction slice", () => {
    const hydrated = sanitizeExtraction(saved({ queueDepth: 0, inFlight: false, lastError: null }));
    expect(hydrated.lastReadBoundary).toBe(4);
    expect(hydrated.scheduler).toEqual({ queueDepth: 0, inFlight: false, lastError: null });
  });
});

describe("V12: a saved checkpoint the merged graph no longer has", () => {
  const story = { startCheckpointId: "cp1", checkpointById: { cp1: {}, cp2: {} } } as unknown as NormalizedStoryV2;
  const saved = (activeCheckpointId: string, visitedPath: string[]) => ({ activeCheckpointId, visitedPath, visitedAnchors: ["cp1"] }) as unknown as EngineState;

  it("resumes at the newest visited checkpoint that still exists, and says why", () => {
    const fixed = repairActiveCheckpoint(saved("gen_stub_2", ["cp1", "cp2", "gen_stub_1", "gen_stub_2"]), story);
    expect(fixed.state.activeCheckpointId).toBe("cp2");
    expect(fixed.detail).toContain("gen_stub_2");
  });

  it("control: a checkpoint that exists is left alone", () => {
    const state = saved("cp2", ["cp1", "cp2"]);
    expect(repairActiveCheckpoint(state, story)).toEqual({ state, detail: null });
  });
});
