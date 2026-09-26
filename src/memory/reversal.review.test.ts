// Promoted from the 2026-09-18 external review (scripts/review/memory-engine.test.ts, "Sol").
// Rollback ≡ replay without the removed input is a layer-1 property (spec v2 line 299); these are
// the seven places it does not hold. v2.3 plan 01 §A; owners in test/findings/ledger.json.

import { selectWithinBudget } from "@memory/budget";
import { applyConsolidation, consolidateTier, type MatchSets } from "@memory/consolidate";
import { activeEpistemic, applyEpistemicSignals, renderPrivateEpistemicBlock, rollbackEpistemic } from "@memory/epistemic";
import { applyLedgerSignals, rollbackLedger } from "@memory/ledger";
import { buildMemoryInjectionBlocks } from "@memory/inject";
import { provenance, withOverride } from "@memory/provenance";
import { addMemoryEntries, capTier, createMemoryState, dropByMessageId, editEntryText, expireScoped } from "@memory/stores";
import type { EpistemicEntry, MemoryEntry, MemoryStoreState } from "@memory/types";
// The injector reaches the host for the extension-prompt calls; these tests only read the builder.
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));
import { control, finding, must } from "../../test/findings/ledger";

const memory = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "memory-1",
  tier: "facts",
  text: "Mara trusts the player and helps freely",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: ["Mara"],
  confidence: 1,
  activationTriggers: [],
  evidence: "Mara offered help",
  createdAt: 1,
  messageId: 1,
  recallCount: 0,
  provenance: provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }),
  ...overrides,
});

const duplicatePairMatches = (): MatchSets => ({ dup: [new Set([1]), new Set([0])], sameTopic: [new Set(), new Set()] });

describe("review: memory rollback is equivalent to never applied", () => {
  control("a superseding fact retires its unpinned predecessor", () => {
    const entries = [
      memory({ id: "old", messageId: 1, createdAt: 1 }),
      memory({ id: "new", messageId: 10, createdAt: 10, text: "Mara no longer trusts the player and helps freely" }),
    ];
    expect(consolidateTier(entries, duplicatePairMatches()).supersededPairs).toEqual([{ loserId: "old", winnerId: "new" }]);
  });

  finding("M1", () => {
    const old = memory({ id: "old", messageId: 1, createdAt: 1 });
    const newer = memory({ id: "new", messageId: 10, createdAt: 10, text: "Mara no longer trusts the player and helps freely" });
    // The link is made at the point the pass ran, which is what a rollback keys on.
    const state = applyConsolidation({ ...createMemoryState(), entries: [old, newer] }, consolidateTier([old, newer], duplicatePairMatches()), { messageId: 10 });
    const rolled = dropByMessageId(state, 10);
    must(
      rolled.entries.length === 1 && rolled.entries[0].id === "old" && !rolled.entries[0].supersededBy,
      `rolling back the superseding fact left its predecessor retired by a winner that no longer exists (entries: ${JSON.stringify(rolled.entries.map((entry) => ({ id: entry.id, supersededBy: entry.supersededBy })))})`,
    );
  });

  finding("M2", () => {
    const first = addMemoryEntries(createMemoryState(), [memory({ id: "before", messageId: 5 })], { from: 0, to: 9 }).state;
    const rolled = dropByMessageId(first, 0);
    const reread = addMemoryEntries(rolled, [memory({ id: "after", messageId: 5, text: "Mara distrusts the player after the corrected scene" })], { from: 0, to: 9 });
    must(
      reread.accepted.map((entry) => entry.id).join() === "after",
      `rollback left the read-coverage log in place, so the forced re-read of the corrected window was discarded as already covered (accepted: ${JSON.stringify(reread.accepted.map((entry) => entry.id))})`,
    );
  });

  control("a newly-created ledger row is removed by rollback", () => {
    const rows = applyLedgerSignals([], [{ entity: "Mara", entityType: "character", field: "condition", value: "injured" }], new Set(), { boundary: 10, messageId: 10 });
    expect(rollbackLedger(rows, 10)).toEqual([]);
  });

  finding("M3", () => {
    const before = applyLedgerSignals([], [{ entity: "Mara", entityType: "character", field: "condition", value: "healthy" }], new Set(), { boundary: 1, messageId: 1 });
    const updated = applyLedgerSignals(before, [{ entity: "Mara", entityType: "character", field: "condition", value: "injured" }], new Set(), { boundary: 10, messageId: 10 });
    const rolled = rollbackLedger(updated, 10);
    must(
      rolled.length === 1 && rolled[0].value === "healthy",
      `rolling back a ledger update dropped the row instead of restoring the prior value (rows after rollback: ${JSON.stringify(rolled.map((row) => row.value))})`,
    );
  });

  finding("M4", () => {
    const initial = applyEpistemicSignals([], [{ subject: "Mara", tag: "believes", content: "the bridge is safe" }], { boundary: 1, messageId: 1 }).entries;
    const retired = applyEpistemicSignals(initial, [], { boundary: 10, messageId: 10 }, [initial[0].id]).entries;
    expect(activeEpistemic(retired)).toHaveLength(0);
    const rolled = rollbackEpistemic(retired, 10);
    must(
      activeEpistemic(rolled).length === 1,
      `rolling back the reveal left the belief it retired still retired (${activeEpistemic(rolled).length} active beliefs after rollback)`,
    );
  });
});

describe("review: pinning preserves records without freezing stale truth", () => {
  control("pinning protects records from count trimming and ordinary expiry", () => {
    const pinned = memory({ id: "pinned", pinned: true, expiration: "scene" });
    const state: MemoryStoreState = { ...createMemoryState(), entries: [pinned, memory({ id: "new", createdAt: 2 })] };
    expect(capTier(state, "facts", 1).entries.map((entry) => entry.id)).toContain("pinned");
    expect(expireScoped(state, "scene").entries.map((entry) => entry.id)).toContain("pinned");
  });

  finding("M5", () => {
    const old = memory({ id: "old", pinned: true, createdAt: 1 });
    const newer = memory({ id: "new", createdAt: 2, text: "Mara no longer trusts the player and helps freely" });
    const result = consolidateTier([old, newer], duplicatePairMatches());
    must(
      !result.droppedIds.includes("new") && result.supersededPairs.some((pair) => pair.loserId === "old" && pair.winnerId === "new"),
      `a pinned record blocked a later state change: the newer fact was discarded as a duplicate instead of superseding the pin (dropped: ${JSON.stringify(result.droppedIds)}, superseded: ${JSON.stringify(result.supersededPairs)})`,
    );
  });

  finding("M6", () => {
    const secret: EpistemicEntry = { id: "secret", subject: "Mara", tag: "knows", content: "the player is the masked traitor", createdAt: 10, messageId: 10, pinned: true, provenance: provenance({ source: "extractor", messageId: 10, boundary: 10, pass: "epistemic-pass" }) };
    const rolled = rollbackEpistemic([secret], 10);
    // "…until reconfirm" is the title's other half, and it was NOT true until 2026-09-22: nothing
    // could reconfirm a private row, so this contract's second clause had no implementation to pass
    // against and the test stopped at the withholding. Both halves are asserted now.
    const reconfirmed = [{ ...rolled[0], ...withOverride(rolled[0], "reconfirm", "2026-09-22T00:00:00.000Z", 12) }];
    must(
      renderPrivateEpistemicBlock(rolled, ["Mara"]) === "",
      "a pinned private fact whose only source message was rolled back is still injected into the private block",
    );
    must(
      reconfirmed[0].provenance?.validity === "live" && renderPrivateEpistemicBlock(reconfirmed, ["Mara"]).includes("masked traitor"),
      `the author's reconfirmation did not bring the private fact back: ${JSON.stringify(reconfirmed[0].provenance)}`,
    );
  });
});

describe("review: token budgets survive manual edits", () => {
  control("uncached oversized text is rejected by a small token budget", () => {
    const oversized = memory({ id: "long", text: "x".repeat(80), tokens: undefined });
    expect(selectWithinBudget([oversized], 4, () => 1).kept.has("long")).toBe(false);
  });

  finding("C3", () => {
    // The queue's hard exclusion (v2.3 plan 05). `contradicted` stays a score penalty for the
    // heuristic that reads it; a QUEUED conflict is a different thing and cannot be outweighed.
    // The title says "conflicted OR source-removed", so both are asserted — the second was the half
    // nothing checked until the private-quarantine gap turned up on 2026-09-22.
    const conflicted: MemoryEntry = memory({ id: "conflicted", importance: 3, provenance: { ...provenance({ source: "extractor", messageId: 5, boundary: 5, pass: "shared-read" }), validity: "conflicted" } });
    const removed: MemoryEntry = memory({ id: "removed", importance: 3, text: "Mara's only source is gone", provenance: { ...provenance({ source: "extractor", messageId: 5, boundary: 5, pass: "shared-read" }), validity: "source-removed" } });
    const quiet = memory({ id: "quiet", importance: 1, messageId: 6, text: "Mara keeps her own counsel" });
    const blocks = buildMemoryInjectionBlocks([conflicted, removed, quiet], null, { tokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 }, scoreContext: { boundary: 6, turnText: "", turnEntities: [] } });
    must(
      !blocks.facts.includes(conflicted.text) && blocks.facts.includes(quiet.text),
      `a conflicted record still reached the prompt: the block was ${JSON.stringify(blocks.facts)}`,
    );
    must(
      !blocks.facts.includes(removed.text),
      `a source-removed record still reached the prompt: the block was ${JSON.stringify(blocks.facts)}`,
    );
  });

  finding("M7", () => {
    const state: MemoryStoreState = { ...createMemoryState(), entries: [memory({ id: "edited", text: "tiny", tokens: 1 })] };
    const edited = editEntryText(state, "edited", "x".repeat(80), "t", 0).entries[0];
    must(
      !selectWithinBudget([edited], 4, () => 1).kept.has("edited"),
      "an edited entry kept the token count of the text it replaced, so an 80-character entry fitted a four-token budget",
    );
  });
});
