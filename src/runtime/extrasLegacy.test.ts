jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readBackBoundary: () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));

import { isLive } from "@memory/index";
import { EXPANSION_CONTRACT } from "@generation/index";
import { sanitizeExpansion, sanitizeMemory } from "./extras";
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

    const dropped = sanitizeExpansion({ expansion: { entries: { "a->b->c": entry() }, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } } as unknown as RuntimeExtras);
    expect(dropped.entries).toEqual({});
  });
});
