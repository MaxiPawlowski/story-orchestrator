import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { SCENE_STALE_AFTER } from "@judge/index";
import { buildNextTurnPreview, clearableContributors, type NextTurnSourceBlock } from "./nextTurn";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
}));

const block = (key: string, depth: number, value = "x".repeat(10)): NextTurnSourceBlock => ({ key, depth, role: 0, value });

const facts = (patch: Partial<Parameters<typeof buildNextTurnPreview>[1]> = {}) => ({ draftedMember: null, scene: null, sceneFallback: null, ...patch });

describe("next-turn preview (v2.3 plan 09)", () => {
  it("names every block the registry knows, with its owner and the tab that owns it", () => {
    const rows = buildNextTurnPreview([block(INJECTION_REGISTRY.pacing.key, 2), block("story_orchestrator_memory_facts", 4)], facts());
    expect(rows.map((row) => row.label)).toEqual(["Pacing steering", "Memory — established facts"]);
    expect(rows.map((row) => row.owner)).toEqual(["runtime/runtimeManager.applyPacingSteering", "memory/inject.applyMemoryInjection"]);
    expect(rows.map((row) => row.ownerTab)).toEqual(["config", "memory"]);
  });

  it("keeps the order ST assembles the prompt in, not the order it was handed", () => {
    const rows = buildNextTurnPreview([block(INJECTION_REGISTRY.memorySceneHistory.key, 6), block(INJECTION_REGISTRY.continuityNote.key, 0), block(INJECTION_REGISTRY.ledger.key, 3)], facts());
    expect(rows.map((row) => row.depth)).toEqual([0, 3, 6]);
  });

  it("reports a block the registry does not know instead of dropping it", () => {
    const rows = buildNextTurnPreview([block("story_something_new", 7)], facts());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "story_something_new", owner: "unknown", ownerTab: "payload" });
  });

  it("marks the private block with the member ST drafted, and the one-shot note as one-shot", () => {
    const rows = buildNextTurnPreview([block(INJECTION_REGISTRY.epistemic.key, 4), block(INJECTION_REGISTRY.continuityNote.key, 0), block(INJECTION_REGISTRY.ledger.key, 3)], facts({ draftedMember: "Dalan" }));
    expect(rows.find((row) => row.key === INJECTION_REGISTRY.epistemic.key)?.target).toBe("Dalan");
    // The ledger is not private even in a group: only the epistemic block is swapped per speaker.
    expect(rows.find((row) => row.key === INJECTION_REGISTRY.ledger.key)?.target).toBeNull();
    expect(clearableContributors(rows).map((row) => row.key)).toEqual([INJECTION_REGISTRY.continuityNote.key]);
  });

  it("says the scene block is unknown without a read, and stale only when the tracker stopped answering", () => {
    const key = INJECTION_REGISTRY.sceneTracker.key;
    expect(buildNextTurnPreview([block(key, 1)], facts())[0].freshness).toBe("unknown");
    const read = { at: new Date().toISOString(), boundary: 3, messageId: 5, facts: { location: "hall", time: "dusk", present: ["Dalan"] }, confidence: 1 };
    const live = read as unknown as Parameters<typeof buildNextTurnPreview>[1]["scene"];
    expect(buildNextTurnPreview([block(key, 1)], facts({ scene: live }))[0].freshness).toBe("live");
    // Staleness is consecutive failed confirmations (SCENE_STALE_AFTER), never age: an old read the
    // tracker has not contradicted is still asserted, and the preview must use the same rule.
    const aged = { ...read, at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() } as unknown as Parameters<typeof buildNextTurnPreview>[1]["scene"];
    expect(buildNextTurnPreview([block(key, 1)], facts({ scene: aged }))[0].freshness).toBe("live");
    const failing = { ...read, freshness: { failures: SCENE_STALE_AFTER, lastConfirmedAt: read.at } } as unknown as Parameters<typeof buildNextTurnPreview>[1]["scene"];
    expect(buildNextTurnPreview([block(key, 1)], facts({ scene: failing }))[0].freshness).toBe("stale");
    expect(buildNextTurnPreview([block(key, 1)], facts({ scene: failing, sceneFallback: "timeout" }))[0].fallback).toBe("timeout");
  });

  it("truncates a long block's preview without hiding that it is long", () => {
    const rows = buildNextTurnPreview([block(INJECTION_REGISTRY.memoryFacts.key, 4, "y".repeat(5000))], facts());
    expect(rows[0].preview.length).toBeLessThanOrEqual(240);
    expect(rows[0].preview.endsWith("…")).toBe(true);
    expect(rows[0].characters).toBe(5000);
  });

  it("reports nothing at all when nothing is injected", () => {
    expect(buildNextTurnPreview([], facts())).toEqual([]);
  });
});
