import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateGate, parseStoryV2OrThrow, progressQualityForAnchor } from "@engine/index";
import { runCodeChecks } from "./critic";
import { mergeExpansions } from "./merge";
import { findStubExpansionCandidate, planExpansion } from "./planner";
import type { ExpansionCacheEntry, GeneratedBeat, GeneratedOutcome } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
}));

const root = join(__dirname, "..", "..");
const raw = JSON.parse(readFileSync(join(root, "test/fixtures/generated-fork.story.json"), "utf-8"));
const story = parseStoryV2OrThrow(raw);
const ANCHOR = "finish";
const PROGRESS = progressQualityForAnchor(ANCHOR);

// A deterministic PRNG: the property has to be reproducible from its seed when it fails, which is the
// whole reason the rollback property suite carries seeds too.
const rng = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const outcome = (index: number, kind: "quiet" | "heard" | "blocked", amount: number, final: boolean): GeneratedOutcome => ({
  id: `0:${index}`,
  label: kind,
  gate: kind === "quiet" ? { q: "guard_aware", op: "==", v: false } : kind === "heard" ? { q: "guard_aware", op: "==", v: true } : { q: "approach", op: "==", v: "blocked" },
  deltas: kind === "safe"
    ? [{ q: "approach", v: "safe" }]
    // Every route has to reach the anchor's snapshot, so each one sets what the anchor needs.
    : [{ q: "key_found", v: true }, { q: "approach", v: "safe" }],
  ...(final ? {} : { progress: { anchor: ANCHOR, amount } }),
});

const chain = (random: () => number, beatCount: number): GeneratedBeat[] =>
  Array.from({ length: beatCount }, (_, beatIndex) => {
    const final = beatIndex === beatCount - 1;
    const outcomeCount = 2 + Math.floor(random() * 2);
    return {
      id: String(beatIndex),
      objective: `Beat ${beatIndex}`,
      guidance: `Guidance ${beatIndex}`,
      tension_target: "tense",
      outcomes: Array.from({ length: outcomeCount }, (_, outcomeIndex) => {
        const kinds: Array<"quiet" | "heard" | "blocked"> = ["quiet", "heard", "blocked"];
        return outcome(outcomeIndex, final ? "quiet" : kinds[outcomeIndex % kinds.length], Math.floor(random() * 4), final);
      }),
    };
  });

const entry = (beats: GeneratedBeat[]): ExpansionCacheEntry => ({
  key: "start->fork_stub->finish",
  status: "validated",
  contract: 2,
  sourceCheckpointId: "start",
  stubId: "fork_stub",
  targetAnchorId: ANCHOR,
  basis: { key_found: false, approach: "unknown" },
  blackboardVersionSum: 0,
  beats,
  needsReview: false,
  verdicts: [],
  codeCheck: null,
  insertedCheckpointIds: ["gen_fork_stub_1", "gen_fork_stub_2", "gen_fork_stub_3"],
  lastError: null,
  attempts: 1,
  updatedAt: "2026-09-22T00:00:00.000Z",
});

/** Every route through a chain as the progress it accumulates and the outcome it took per beat. */
const routes = (beats: GeneratedBeat[]) => {
  let open: Array<{ progress: number; taken: number[] }> = [{ progress: 0, taken: [] }];
  beats.forEach((beat, index) => {
    const next: Array<{ progress: number; taken: number[] }> = [];
    for (const route of open) {
      beat.outcomes.forEach((outcomeValue, outcomeIndex) => {
        next.push({
          progress: route.progress + (index === beats.length - 1 ? 0 : outcomeValue.progress?.amount ?? 0),
          taken: [...route.taken, outcomeIndex],
        });
      });
    }
    open = next;
  });
  return open;
};

describe("R9 property: no route through a generated chain starves the anchor", () => {
  it("holds for every route of every chain, over 400 seeded chains", () => {
    let routeCount = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const random = rng(seed);
      const beats = chain(random, 2 + Math.floor(random() * 2));
      const merged = mergeExpansions(raw, { "start->fork_stub->finish": entry(beats) });
      const all = routes(beats);
      routeCount += all.length;
      beats.forEach((beat, index) => {
        const from = `gen_fork_stub_${index + 1}`;
        const outgoing = merged.outgoingByCheckpoint[from] ?? [];
        expect({ seed, from, count: outgoing.length }).toEqual({ seed, from, count: beat.outcomes.length });
        expect(outgoing.map((transition) => transition.priority)).toEqual([...beat.outcomes.keys()].map((position) => beat.outcomes.length - position));
      });
      // One threshold for the whole chain, taken from the worst route: hence the smallest amount any
      // route can accumulate. (The fixture's anchor authors no convergence_threshold, so the chain sum
      // decides; an authored one is checked separately.)
      const worst = Math.min(...all.map((route) => route.progress));
      const lastFrom = `gen_fork_stub_${beats.length}`;
      const gate = (merged.outgoingByCheckpoint[lastFrom] ?? []).find((transition) => transition.to === ANCHOR);
      const outcomeGate = { q: "guard_aware", op: "==", v: false };
      expect({ seed, threshold: JSON.stringify(gate?.gate) }).toEqual({ seed, threshold: JSON.stringify(worst > 0 ? { all: [outcomeGate, { q: PROGRESS, op: ">=", v: worst }] } : outcomeGate) });
      // And the property itself: every route reaches it.
      all.forEach((route) => {
        expect({ seed, route: route.taken, enough: route.progress >= worst }).toEqual({ seed, route: route.taken, enough: true });
      });
    }
    expect(routeCount).toBeGreaterThan(1000);
  });

  // V13: the worst route carries 0, and `progress >= 0` is not vacuous: an unset progress quality
  // compares false, so that route used to stall at its final beat. The final gate is the outcome's own.
  it("holds when an outcome declares no progress at all: the zero route enters on its outcome gate", () => {
    const beats: GeneratedBeat[] = [
      { id: "0", objective: "A", guidance: "a", tension_target: "tense", outcomes: [
        { id: "0:0", label: "loud", gate: { q: "guard_aware", op: "==", v: true }, deltas: [{ q: "key_found", v: true }], progress: { anchor: ANCHOR, amount: 3 } },
        { id: "0:1", label: "free", gate: { q: "approach", op: "==", v: "blocked" }, deltas: [{ q: "key_found", v: true }] },
      ] },
      { id: "1", objective: "B", guidance: "b", tension_target: "critical", outcomes: [
        { id: "1:0", label: "done", gate: { q: "key_found", op: "==", v: true }, deltas: [{ q: "approach", v: "safe" }] },
      ] },
    ];
    const merged = mergeExpansions(raw, { "start->fork_stub->finish": entry(beats) });
    const gate = (merged.outgoingByCheckpoint.gen_fork_stub_2 ?? []).find((transition) => transition.to === ANCHOR);
    expect(gate?.gate).toEqual({ q: "key_found", op: "==", v: true });
    expect(Math.min(...routes(beats).map((route) => route.progress))).toBe(0);
    const unsetProgress = { get: (key: string) => (key === "key_found" ? true : undefined) } as unknown as Parameters<typeof evaluateGate>[1];
    expect(evaluateGate(gate!.gate, unsetProgress)).toBe(true);
    expect(evaluateGate({ all: [gate!.gate, { q: PROGRESS, op: ">=", v: 0 }] }, unsetProgress)).toBe(false);
  });

  it("refuses a chain whose anchor-entry transition also carries a progress increment, on ANY outcome", () => {
    // The engine applies a transition's progress on entry, so an increment on the last hop would let
    // a chain clear its own threshold twice. The check is per outcome, so an increment on the second
    // outcome of the last beat — the one the discarding merge used to ignore — is refused too.
    const beats = chain(rng(7), 2);
    const last = beats.length - 1;
    const withProgress = beats.map((beat, index) => index === last
      ? { ...beat, outcomes: beat.outcomes.map((one, outcomeIndex) => outcomeIndex === 1 ? { ...one, progress: { anchor: ANCHOR, amount: 5 } } : one) }
      : beat);
    const candidate = findStubExpansionCandidate(story, "start");
    if (!candidate) throw new Error("no candidate");
    const input = planExpansion(story, { values: { key_found: false, approach: "unknown" } }, candidate, "", []);
    expect(runCodeChecks(story, input, withProgress).issues).toContain("final anchor-entry transition must not carry progress increment");
    expect(runCodeChecks(story, input, beats).issues).not.toContain("final anchor-entry transition must not carry progress increment");
  });
});
