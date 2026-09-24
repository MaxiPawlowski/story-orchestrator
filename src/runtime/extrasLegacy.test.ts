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

// v2.3 plan 05. A chat saved before envelopes existed hydrates and plays unchanged (v2.1 rule 6), and
// every row it brings is a STATED unknown: stamped `legacy`, still live, never dressed as an extractor
// read that nobody can point at.

const blob = (overrides: Record<string, unknown> = {}): RuntimeExtras => ({
  memory: {
    entries: [{ id: "m1", tier: "facts", text: "The bridge fell.", type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "e", createdAt: 1, recallCount: 0 }],
    epistemic: [{ id: "e1", subject: "Luke", tag: "knows", content: "the letter", createdAt: 2 }],
    ledger: [{ id: "l1", entity: "Mira", entityType: "character", field: "hp", value: "3", createdAt: 3 }],
    ...overrides,
  },
} as unknown as RuntimeExtras);

describe("hydrating a chat written before envelopes (v2.3 plan 05)", () => {
  it("stamps every row legacy, and legacy is live", () => {
    const memory = sanitizeMemory(blob());
    expect(memory.entries[0].provenance).toMatchObject({ source: "legacy", messageId: -1, validity: "live" });
    expect(memory.epistemic[0].provenance?.source).toBe("legacy");
    expect(memory.ledger[0].provenance?.source).toBe("legacy");
    expect(memory.entries.every(isLive)).toBe(true);
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

// v2.3 plan 07. A chain generated before R9 was read with `outcomes[0]`, so it carries no outcome ids
// and cannot express the branches its siblings were authored with. The cache does not survive the
// contract that produced it: the entry is dropped and the stub re-generates on arrival.
describe("expansion cache contract", () => {
  const entry = (contract?: number) => ({ key: "a->b->c", status: "inserted", sourceCheckpointId: "a", stubId: "b", targetAnchorId: "c", basis: {}, blackboardVersionSum: 0, beats: [], needsReview: false, verdicts: [], codeCheck: null, insertedCheckpointIds: [], lastError: null, attempts: 1, updatedAt: "x", ...(contract === undefined ? {} : { contract }) });

  it("drops a pre-R9 chain and keeps a current one", () => {
    const kept = sanitizeExpansion({ expansion: { entries: { "a->b->c": entry(EXPANSION_CONTRACT) }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(Object.keys(kept.entries)).toEqual(["a->b->c"]);
    expect(kept.entries["a->b->c"].contract).toBe(EXPANSION_CONTRACT);

    const dropped = sanitizeExpansion({ expansion: { entries: { "a->b->c": { ...entry(), status: "cached" } }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(dropped.entries).toEqual({});
  });

  it("V12: a pre-R9 chain the chat is PLAYING is upgraded in place, not dropped — its checkpoints are where the player stands", () => {
    const legacy = { ...entry(), status: "inserted", beats: [{ objective: "o", guidance: "g", tension_target: "calm", outcomes: [{ label: "a", gate: { q: "x", op: "==", v: true } }, { label: "b", gate: { q: "y", op: "==", v: true } }] }] };
    const kept = sanitizeExpansion({ expansion: { entries: { "a->b->c": legacy }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    const upgraded = kept.entries["a->b->c"];
    expect(upgraded.contract).toBe(EXPANSION_CONTRACT);
    expect(upgraded.beats[0].id).toBe("0");
    expect(upgraded.beats[0].outcomes.map((outcome) => outcome.id)).toEqual(["0:0", "0:1"]);
  });
});

describe("v2.4 plan 03 D3: the scheduler snapshot is a display cache, not state", () => {
  const saved = (scheduler: unknown) => ({ extraction: { audits: [], reconciliationEvents: [], lastReadBoundary: 4, scheduler, judgedReads: [] } }) as unknown as RuntimeExtras;

  it("hydrate resets the persisted scheduler snapshot", () => {
    expect(sanitizeExtraction(saved({ queueDepth: 3, inFlight: true, lastError: "API request failed" })).scheduler).toEqual({ queueDepth: 0, inFlight: false, lastError: null });
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
