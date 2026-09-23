import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow, progressQualityForAnchor } from "@engine/index";
import { runCodeChecks } from "./critic";
import { mergeExpansions } from "./merge";
import { parseGeneratedBeats } from "./parse";
import { findStubExpansionCandidate, planExpansion } from "./planner";
import { outcomePaths } from "./paths";
import type { ExpansionCacheEntry } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
}));

const root = join(__dirname, "..", "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf-8"));
const readText = (path: string) => readFileSync(join(root, path), "utf-8");
const raw = readJson("test/fixtures/generated-fork.story.json");
const story = parseStoryV2OrThrow(raw);

const beatsOf = (name: string) => {
  const parsed = parseGeneratedBeats(readText(`test/goldens/generation/generated-fork.${name}.response.txt`), story);
  if (parsed.issues.length) throw new Error(parsed.issues.join("; "));
  return parsed.beats;
};

const entry = (name: string): ExpansionCacheEntry => ({
  key: "start->fork_stub->finish",
  status: "validated",
  contract: 2,
  sourceCheckpointId: "start",
  stubId: "fork_stub",
  targetAnchorId: "finish",
  basis: { key_found: false, approach: "unknown" },
  blackboardVersionSum: 0,
  beats: beatsOf(name),
  needsReview: false,
  verdicts: [],
  codeCheck: null,
  insertedCheckpointIds: ["gen_fork_stub_1", "gen_fork_stub_2"],
  lastError: null,
  attempts: 1,
  updatedAt: "2026-09-22T00:00:00.000Z",
});

const input = () => {
  const candidate = findStubExpansionCandidate(story, "start");
  if (!candidate) throw new Error("no candidate");
  return planExpansion(story, { values: { key_found: false, approach: "unknown" } }, candidate, "", []);
};

const mergedTransitions = (from: string) => mergeExpansions(raw, { "start->fork_stub->finish": entry("2") }).outgoingByCheckpoint[from] ?? [];

describe("R9: a generated beat's outcomes are routes", () => {
  it("gives the outcomes stable ids at parse, in the order they were written", () => {
    const beats = beatsOf("2");
    expect(beats.map((beat) => beat.id)).toEqual(["0", "1"]);
    expect(beats[0].outcomes.map((outcome) => outcome.id)).toEqual(["0:0", "0:1"]);
    expect(beats[1].outcomes.map((outcome) => outcome.id)).toEqual(["1:0", "1:1"]);
  });

  it("merges one outgoing transition per outcome, in declaration order", () => {
    const merged = mergeExpansions(raw, { "start->fork_stub->finish": entry("2") });
    const first = merged.outgoingByCheckpoint.gen_fork_stub_1;
    // Descending: the engine takes the first transition whose gate holds, so the first DECLARED
    // outcome must come first.
    expect(first.map((transition) => transition.priority)).toEqual([2, 1]);
    expect(first.every((transition) => transition.to === "gen_fork_stub_2")).toBe(true);
    // The two routes ask different questions, which is the whole point: the discarding merge kept
    // only the first and a player whose state matched the second had no exit at all.
    expect(first.map((transition) => JSON.stringify(transition.gate))).toEqual([
      JSON.stringify({ q: "guard_aware", op: "==", v: false }),
      JSON.stringify({ q: "guard_aware", op: "==", v: true }),
    ]);
  });

  it("sets the anchor-entry threshold from the WORST route, so no route starves it", () => {
    const merged = mergeExpansions(raw, { "start->fork_stub->finish": entry("3") });
    const key = progressQualityForAnchor("finish");
    const entryGates = merged.outgoingByCheckpoint.gen_fork_stub_2.filter((transition) => transition.to === "finish");
    expect(entryGates).toHaveLength(3);
    // The golden's three outcomes carry 3, 2 and 1. Taking `outcomes[0]` would set the threshold to
    // 3 and starve the two quieter routes at their own anchor gate, which is the defect R9 names.
    const incoming = merged.outgoingByCheckpoint.gen_fork_stub_1;
    expect(incoming.map((transition) => transition.effects?.progress?.amount)).toEqual([3, 2, 1]);
    entryGates.forEach((transition) => {
      expect(JSON.stringify(transition.gate)).toContain(`"q":"${key}","op":">=","v":1`);
    });
  });

  it("fails the code check when one of a beat's outcomes is invalid, rather than dropping it", () => {
    const invalid = parseGeneratedBeats(readText("test/goldens/generation/generated-fork.invalid.response.txt"), story);
    expect(invalid.issues.some((issue) => issue.includes("unknown quality"))).toBe(true);
    // The parse keeps the beat it could read; the issues are what make the caller take needs-review,
    // so the chain is never inserted with the invalid route silently removed.
    const check = runCodeChecks(story, input(), invalid.beats);
    expect(invalid.issues.length).toBeGreaterThan(0);
    expect(check.progressTotal).toBe(1);
  });

  it("checks every route of every beat, and the routes are enumerable", () => {
    const beats = beatsOf("3");
    const paths = outcomePaths({ key_found: false, approach: "unknown" }, beats);
    expect(paths.length).toBeGreaterThan(0);
    const check = runCodeChecks(story, input(), beats);
    expect({ ok: check.ok, issues: check.issues }).toEqual({ ok: true, issues: [] });
    // Every route must bridge: a chain where one route cannot reach the anchor is a stall waiting
    // for the player who takes it, and the check names the key rather than passing on route 0.
    const broken = beats.map((beat, index) => index === 0 ? { ...beat, outcomes: [beat.outcomes[0], { ...beat.outcomes[1], deltas: [] }] } : beat);
    const failed = runCodeChecks(story, input(), broken);
    expect(failed.ok).toBe(false);
    expect(failed.issues.some((issue) => issue.includes("does not bridge"))).toBe(true);
  });

  it("lets an authored convergence_threshold win over the chain sum", () => {
    const authored = { ...raw, checkpoints: raw.checkpoints.map((checkpoint: { id: string }) => checkpoint.id === "finish" ? { ...checkpoint, convergence_threshold: 5 } : checkpoint) };
    const merged = mergeExpansions(authored, { "start->fork_stub->finish": entry("3") });
    const key = progressQualityForAnchor("finish");
    // The author said five, so five: the worst-route rule is what the chain sum is when nobody said.
    (merged.outgoingByCheckpoint.gen_fork_stub_2 ?? []).filter((transition) => transition.to === "finish").forEach((transition) => {
      expect(JSON.stringify(transition.gate)).toContain(`"q":"${key}","op":">=","v":5`);
    });
  });

  it("is deterministic: the same golden merges to the same graph twice", () => {
    const a = mergeExpansions(raw, { "start->fork_stub->finish": entry("2") });
    const b = mergeExpansions(raw, { "start->fork_stub->finish": entry("2") });
    expect(JSON.stringify(a.outgoingByCheckpoint)).toBe(JSON.stringify(b.outgoingByCheckpoint));
    expect(mergedTransitions("start").map((transition) => transition.to)).toEqual(["gen_fork_stub_1"]);
  });
});
