import { applyConsolidation, consolidateTier, type MatchSets } from "./consolidate";
import { detectConflicts, liveLedgerRows, markConflicted, resolveConflict } from "./conflicts";
import { activeEpistemic, applyEpistemicSignals, renderPrivateEpistemicBlock, rollbackEpistemic } from "./epistemic";
import { buildMemoryInjectionBlocks } from "./inject";

// The injector reaches the host for the extension-prompt calls; this test only reads the builder.
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));
import { applyLedgerSignals, buildLedgerView } from "./ledger";
import { describeProvenance, isLive, originLabel, provenance, withOverride } from "./provenance";
import { createMemoryState, dropByMessageId, editEntryText, setLocked } from "./stores";
import type { LedgerEntry, MemoryEntry } from "./types";

// v2.3 plan 05. One envelope, two meanings that used to be one: a PIN is retention (trimming and
// expiry spare the row) and a LOCK is truth (nothing supersedes it). What a record's source did to
// it decides whether it can still steer a reply.

const entry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "m1",
  tier: "facts",
  text: "Mara trusts the player",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: ["Mara"],
  confidence: 1,
  activationTriggers: [],
  evidence: "she said so",
  createdAt: 1,
  messageId: 1,
  recallCount: 0,
  provenance: provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }),
  ...overrides,
});

const duplicatePairMatches = (): MatchSets => ({ dup: [new Set([1]), new Set([0])], sameTopic: [new Set(), new Set()] });
const injectionOptions = { tokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 }, scoreContext: { boundary: 5, turnText: "", turnEntities: [] } };

describe("the provenance envelope", () => {
  it("carries an override with the boundary it was made at", () => {
    const kept = withOverride(entry(), "store-anyway", "2026-09-21T00:00:00.000Z", 7);
    expect(kept.provenance).toMatchObject({ source: "author", validity: "live", override: { by: "author", boundary: 7, from: "store-anyway" } });
  });
});

describe("pin is retention, lock is truth", () => {
  it("supersedes a pinned fact with a newer contradicting one, and refuses to touch a locked one", () => {
    const pinned = entry({ id: "old", pinned: true, createdAt: 1 });
    const newer = entry({ id: "new", createdAt: 2, text: "Mara no longer trusts the player" });
    expect(consolidateTier([pinned, newer], duplicatePairMatches()).supersededPairs).toEqual([{ loserId: "old", winnerId: "new" }]);

    const locked = entry({ id: "old", locked: true, createdAt: 1 });
    const challenged = entry({ id: "new", createdAt: 2, text: "Mara no longer trusts the player" });
    const result = consolidateTier([locked, challenged], duplicatePairMatches());
    expect(result.supersededPairs).toEqual([]);
    expect(result.uncertain).toEqual([{ candidateId: "new", existingId: "old" }]);
    // And the link is not applied either, so a pass cannot quietly retire a lock.
    const applied = applyConsolidation({ ...createMemoryState(), entries: [locked, challenged] }, result, { messageId: 5 });
    expect(applied.entries.find((row) => row.id === "old")?.supersededBy).toBeUndefined();
  });
});

describe("a record whose source was rolled back is quarantined, not injected", () => {
  it("keeps the record, marks it, and drops it from the private block", () => {
    const secret = { id: "s1", subject: "Mara", tag: "knows" as const, content: "the player is the masked traitor", createdAt: 10, messageId: 10, pinned: true };
    const rolled = rollbackEpistemic([secret], 10);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].provenance?.validity).toBe("source-removed");
    expect(renderPrivateEpistemicBlock(rolled, ["Mara"])).toBe("");
    expect(activeEpistemic(rolled)).toEqual([]);
  });

  it("still drops an unpinned row outright", () => {
    const loose = { id: "s2", subject: "Mara", tag: "knows" as const, content: "a rumour", createdAt: 10, messageId: 10 };
    expect(rollbackEpistemic([loose], 10)).toEqual([]);
  });

  it("reconfirmation makes it the author's claim, and it steers again", () => {
    const secret = { id: "s1", subject: "Mara", tag: "knows" as const, content: "the player is the masked traitor", createdAt: 10, messageId: 10, pinned: true };
    const quarantined = rollbackEpistemic([secret], 10)[0];
    const kept = { ...quarantined, ...withOverride(quarantined, "reconfirm", "2026-09-21T00:00:00.000Z", 12) };
    expect(renderPrivateEpistemicBlock([kept], ["Mara"])).toContain("masked traitor");
  });
});

describe("quarantined rows are excluded from every injection", () => {
  it("keeps a conflicted fact out of the memory block even when it is the strongest entry", () => {
    const strong = entry({ id: "strong", importance: 3, text: "Mara trusts the player", provenance: { ...provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }), validity: "conflicted" } });
    const weak = entry({ id: "weak", importance: 1, messageId: 2, text: "Mara keeps her own counsel" });
    const blocks = buildMemoryInjectionBlocks([strong, weak], null, injectionOptions);
    expect(blocks.facts).not.toContain("Mara trusts the player");
    expect(blocks.facts).toContain("Mara keeps her own counsel");
  });

  it("falls back to the newest live ledger version when the newest is quarantined", () => {
    const rows = applyLedgerSignals([], [{ entity: "Mara", entityType: "character", field: "condition", value: "healthy" }], new Set(), { boundary: 1, messageId: 1 });
    const updated = applyLedgerSignals(rows, [{ entity: "Mara", entityType: "character", field: "condition", value: "injured" }], new Set(), { boundary: 10, messageId: 10 });
    const marked = markConflicted(updated, [updated[1].id], (row) => row.id);
    expect(liveLedgerRows(marked).map((row) => row.value)).toEqual(["healthy"]);
    expect(buildLedgerView(marked, [], {}, {}).map((row) => row.value)).toEqual(["healthy"]);
  });
});

describe("conflict detection and resolution", () => {
  const ledgerRow = (value: string, messageId = 5): LedgerEntry => ({ id: `l-${value}`, entity: "Mara", entityType: "character", field: "condition", value, createdAt: messageId, messageId });

  it("queues a ledger row that disagrees with the blackboard binding", () => {
    const pairs = detectConflicts([], [ledgerRow("injured")], { quality: { entity: "Mara", field: "condition", value: "healthy" } });
    expect(pairs).toHaveLength(1);
    expect(pairs[0].key).toBe("bound:mara|condition");
    expect(pairs[0].sides.map((side) => side.label)).toEqual(["Mara condition = injured (ledger)", "Mara condition = healthy (blackboard)"]);
  });

  it("queues a fact that names the same entity and field with a different value", () => {
    const fact = entry({ text: "Mara's condition is steady", entities: ["Mara"] });
    const pairs = detectConflicts([fact], [ledgerRow("injured")], {});
    expect(pairs.map((pair) => pair.key)).toEqual(["fact:m1:mara|condition"]);
  });

  it("does not queue a fact that only mentions the entity", () => {
    expect(detectConflicts([entry({ text: "Mara went to the market", entities: ["Mara"] })], [ledgerRow("injured")], {})).toEqual([]);
  });

  it("does not re-queue a pair the author already resolved", () => {
    const fact = entry({ text: "Mara's condition is steady", entities: ["Mara"] });
    expect(detectConflicts([fact], [ledgerRow("injured")], {}, ["fact:m1:mara|condition"])).toEqual([]);
  });

  it("marks both sides and lets the author keep one", () => {
    const conflicted = markConflicted([entry({ id: "a" }), entry({ id: "b" })], ["a", "b"], (row) => row.id);
    expect(conflicted.every((row) => row.provenance?.validity === "conflicted")).toBe(true);
    const resolved = resolveConflict(conflicted, { keep: "a", drop: "b", at: "2026-09-21T00:00:00.000Z", boundary: 9 });
    expect(resolved[0].provenance).toMatchObject({ source: "author", validity: "live", override: { from: "reconciled" } });
    expect(resolved[1].supersededBy).toBe("a");
  });

  // v2.3 plan 05: a free-text claim and a ledger row are about the same thing when they share the
  // words, not only when the fact happens to contain the field's name verbatim.
  it("uses same-topic wording, not a literal field mention, for free-text facts", () => {
    const row: LedgerEntry = { ...ledgerRow("injured"), field: "condition state" };
    const fact = entry({ text: "Mara's condition looks steady again", entities: [] });
    expect(detectConflicts([fact], [row], {}).map((pair) => pair.key)).toEqual(["fact:m1:mara|condition state"]);
    // And a claim that merely shares a word is left alone: no shared subject, no disagreement.
    expect(detectConflicts([entry({ text: "The condition of the road is poor", entities: [] })], [row], {})).toEqual([]);
  });

  it("names a side's provenance and the message span the claims came from", () => {
    const fact = entry({ text: "Mara's condition is steady", entities: ["Mara"], messageId: 3 });
    const pairs = detectConflicts([fact], [ledgerRow("injured", 7)], {}, [], [], "2026-09-21T00:00:00.000Z");
    expect(pairs[0].detectedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(pairs[0].window).toEqual({ from: 3, to: 7 });
    expect(pairs[0].sides[0].messageId).toBe(3);
    expect(pairs[0].sides[1].messageId).toBe(7);
  });

  it("queues a scene read that disagrees with the ledger or the blackboard", () => {
    const scene = [{ field: "location" as const, value: "the desert road", confidence: 0.9, messageId: 4 }];
    const ledger = [{ ...ledgerRow("guild hall"), field: "location" }];
    expect(detectConflicts([], ledger, {}, [], scene).map((pair) => pair.key)).toEqual(["scene:location"]);
    const bound = { q: { entity: "Scene", field: "location", value: "town gate" } };
    expect(detectConflicts([], [], bound, [], scene).map((pair) => pair.key)).toEqual(["scene:location"]);
  });
});

describe("an edit re-costs the row", () => {
  it("clears the cached token count so the estimator applies", () => {
    const state = { ...createMemoryState(), entries: [entry({ id: "edited", text: "tiny", tokens: 1 })] };
    expect(editEntryText(state, "edited", "x".repeat(200), "t", 0).entries[0].tokens).toBeUndefined();
  });
});

describe("rollback keeps a quarantined pinned row instead of resurrecting it", () => {
  it("marks the memory row whose source went, and still drops an unpinned one", () => {
    const pinned = entry({ id: "pinned", pinned: true, messageId: 10, createdAt: 10 });
    const loose = entry({ id: "loose", messageId: 10, createdAt: 10 });
    const rolled = dropByMessageId({ ...createMemoryState(), entries: [pinned, loose] }, 10);
    expect(rolled.entries.map((row) => row.id)).toEqual(["pinned"]);
    expect(rolled.entries[0].provenance?.validity).toBe("source-removed");
  });
});

describe("a lock freezes the story's truth, under consolidation and under rollback alike", () => {
  it("locks, pins, and clears the decision again on unlock", () => {
    const state = { ...createMemoryState(), entries: [entry({ id: "m1" })] };
    const locked = setLocked(state, "m1", true, "2026-09-21T00:00:00.000Z", 7).entries[0];
    expect(locked).toMatchObject({ locked: true, pinned: true });
    expect(locked.provenance?.override).toMatchObject({ by: "author", boundary: 7, from: "lock" });
    const unlocked = setLocked({ ...state, entries: [locked] }, "m1", false, "2026-09-21T00:00:00.000Z", 8).entries[0];
    expect(unlocked.locked).toBe(false);
    expect(unlocked.provenance?.override).toBeUndefined();
  });

  it("keeps a locked row when the rollback only reaches its source message", () => {
    const locked = setLocked({ ...createMemoryState(), entries: [entry({ id: "m1", messageId: 10, createdAt: 10, pinned: true })] }, "m1", true, "2026-09-21T00:00:00.000Z", 12).entries[0];
    const rolled = dropByMessageId({ ...createMemoryState(), entries: [locked] }, 10, 13);
    expect(rolled.entries).toHaveLength(1);
    expect(rolled.entries[0].provenance?.validity).toBe("live");
  });

  it("restores the source's verdict when the rollback reaches the lock's own boundary", () => {
    const locked = setLocked({ ...createMemoryState(), entries: [entry({ id: "m1", messageId: 10, createdAt: 10, pinned: true })] }, "m1", true, "2026-09-21T00:00:00.000Z", 12).entries[0];
    const rolled = dropByMessageId({ ...createMemoryState(), entries: [locked] }, 10, 12);
    expect(rolled.entries[0].provenance?.override).toBeUndefined();
    expect(rolled.entries[0].provenance?.validity).toBe("source-removed");
  });

  it("removes a fact the author wrote outright when its creation boundary is undone, and spares it otherwise", () => {
    const manual = entry({ id: "m1", messageId: undefined, provenance: provenance({ source: "author", messageId: -1, boundary: 4, pass: "manual" }) });
    expect(dropByMessageId({ ...createMemoryState(), entries: [manual] }, 20, 5).entries).toHaveLength(1);
    expect(dropByMessageId({ ...createMemoryState(), entries: [manual] }, 20, 4).entries).toEqual([]);
  });
});

describe("the author view can say where a row came from", () => {
  it("names the source, the pass, the message and the override", () => {
    expect(describeProvenance(entry())).toBe("extractor · shared-read · message 1 · live");
    const bare = { provenance: undefined };
    expect(describeProvenance(bare)).toBe("unknown origin");
    const kept = { ...entry(), ...withOverride(entry(), "verify-drop", "2026-09-21T00:00:00.000Z", 7) };
    expect(describeProvenance(kept)).toContain("kept by you at boundary 7");
  });

  it("renders an absent envelope as a stated unknown, never as a source", () => {
    // One rule for both author-facing panels, so this asserts the rule they share.
    expect(originLabel(undefined)).toBe("origin unknown");
    expect(originLabel(provenance({ source: "extractor", messageId: 3, boundary: 3, pass: "shared-read" }))).toBe("extractor · shared-read");
    expect(originLabel(provenance({ source: "blackboard", messageId: -1, boundary: 0, pass: "blackboard" }))).toBe("blackboard · blackboard");
    expect(originLabel(provenance({ source: "author", messageId: 4, boundary: 4, pass: "reconfirm" }))).toBe("author · reconfirm");
  });
});
