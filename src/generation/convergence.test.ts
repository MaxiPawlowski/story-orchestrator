import { readFileSync } from "node:fs";
import { join } from "node:path";
import { effectiveThresholdFor, parseStoryV2OrThrow, progressQualityForAnchor, StoryEngine, type NormalizedStoryV2 } from "@engine/index";
import { mergeExpansions } from "./merge";
import type { ExpansionCacheEntry, GeneratedBeat } from "./types";

jest.mock("@services/STAPI", () => ({
  sendConnectionProfileRequest: jest.fn(async () => "{}"),
}));

const root = join(__dirname, "..", "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf-8"));

const driftRaw = readJson("test/fixtures/convergence-drift.story.json");

const beat = (objective: string, tensionTarget: string, gate: object, deltas: object[], progress?: object): GeneratedBeat => ({
  objective,
  guidance: `guidance for ${objective}`,
  tension_target: tensionTarget as GeneratedBeat["tension_target"],
  outcomes: [{ label: objective, gate: gate as GeneratedBeat["outcomes"][0]["gate"], deltas: deltas as GeneratedBeat["outcomes"][0]["deltas"], ...(progress ? { progress: progress as GeneratedBeat["outcomes"][0]["progress"] } : {}) }],
});

const bridgeAChain: GeneratedBeat[] = [
  beat("Secure the approach", "tense", { q: "approach", op: "==", v: "safe" }, [{ q: "approach", v: "safe" }], { anchor: "midway", amount: 2 }),
  beat("Confirm the key", "critical", { q: "key_found", op: "==", v: true }, [{ q: "key_found", v: true }]),
];

const bridgeBChain: GeneratedBeat[] = [
  beat("Open the vault", "tense", { q: "vault_open", op: "==", v: true }, [{ q: "vault_open", v: true }], { anchor: "finale", amount: 2 }),
  beat("Confirm the ally", "critical", { q: "ally_convinced", op: "==", v: true }, [{ q: "ally_convinced", v: true }]),
];

const entry = (key: string, v: string | number | boolean, from = 1, to = 1) => ({
  source: "extractor" as const,
  blackboardVersionSum: 0,
  turnRange: { from, to },
  deltas: [{ q: key, v, source: "extractor" as const }],
});

const cacheEntry = (stubId: string, sourceId: string, targetId: string, beats: GeneratedBeat[]): ExpansionCacheEntry => ({
  key: `${sourceId}->${stubId}->${targetId}`,
  status: "inserted",
  sourceCheckpointId: sourceId,
  stubId,
  targetAnchorId: targetId,
  basis: {},
  blackboardVersionSum: 0,
  beats,
  needsReview: false,
  verdicts: [],
  codeCheck: null,
  insertedCheckpointIds: [`gen_${stubId}_1`, `gen_${stubId}_2`],
  lastError: null,
  attempts: 1,
  updatedAt: "2026-07-05T00:00:00.000Z",
});

const mergedDriftStory = (): NormalizedStoryV2 => {
  const entries = {
    "start->bridge_a->midway": cacheEntry("bridge_a", "start", "midway", bridgeAChain),
    "midway->bridge_b->finale": cacheEntry("bridge_b", "midway", "finale", bridgeBChain),
  };
  return mergeExpansions(driftRaw, entries);
};

describe("convergence in play", () => {
  it("D1: anchor with no convergence_threshold defaults threshold to chain increment sum", () => {
    const story = mergedDriftStory();
    expect(story.checkpointById.midway.convergence_threshold).toBeUndefined();
    expect(story.checkpointById.finale.convergence_threshold).toBeUndefined();
    expect(effectiveThresholdFor(story, "midway")).toBe(2);
    expect(effectiveThresholdFor(story, "finale")).toBe(2);
  });

  it("D2: anchor-entry transition carries progress gate and no increment; non-final carry increments", () => {
    const story = mergedDriftStory();
    const aEntry = story.outgoingByCheckpoint.gen_bridge_a_1?.[0];
    expect(aEntry?.to).toBe("gen_bridge_a_2");
    expect(aEntry?.effects?.progress?.amount).toBe(2);
    const aFinal = story.outgoingByCheckpoint.gen_bridge_a_2?.[0];
    expect(aFinal?.to).toBe("midway");
    expect(aFinal?.effects?.progress).toBeUndefined();

    const startTransition = story.outgoingByCheckpoint.start[0];
    expect(startTransition.to).toBe("gen_bridge_a_1");
    expect(startTransition.effects?.progress).toBeUndefined();
  });

  it("drift fixture converges within bounded horizon with wandering extraction", () => {
    const story = mergedDriftStory();
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    const k = 2;
    const sumTargetTurnLength = (story.checkpointById.start.target_turn_length ?? 4) + (story.checkpointById.midway.target_turn_length ?? 4) + (story.checkpointById.finale.target_turn_length ?? 4);
    const horizon = k * sumTargetTurnLength;
    expect(horizon).toBe(18);

    const progressAt = (anchor: string) => {
      const raw = engine.serialize().blackboard.values[progressQualityForAnchor(anchor)];
      return typeof raw === "number" ? raw : 0;
    };

    const drift = (key: string, v: string | number | boolean) => {
      engine.enqueue(entry(key, v));
      engine.commitBoundary();
    };
    const drive = (key: string, v: string | number | boolean) => {
      engine.enqueue(entry(key, v));
      engine.commitBoundary();
    };

    drift("approach", "blocked");
    expect(engine.serialize().activeCheckpointId).toBe("start");
    expect(progressAt("midway")).toBe(0);

    drive("key_found", true);
    expect(engine.serialize().activeCheckpointId).toBe("gen_bridge_a_1");
    expect(progressAt("midway")).toBe(0);

    drift("approach", "blocked");
    expect(engine.serialize().activeCheckpointId).toBe("gen_bridge_a_1");

    drive("approach", "safe");
    expect(engine.serialize().activeCheckpointId).toBe("gen_bridge_a_2");
    expect(progressAt("midway")).toBe(2);

    drive("key_found", true);
    expect(engine.serialize().activeCheckpointId).toBe("midway");
    expect(progressAt("midway")).toBe(2);

    drive("ally_convinced", true);
    expect(engine.serialize().activeCheckpointId).toBe("gen_bridge_b_1");

    drive("vault_open", true);
    expect(engine.serialize().activeCheckpointId).toBe("gen_bridge_b_2");
    expect(progressAt("finale")).toBe(2);

    drive("ally_convinced", true);
    expect(engine.serialize().activeCheckpointId).toBe("finale");

    const totalBoundaries = engine.serialize().boundary;
    expect(totalBoundaries).toBeLessThanOrEqual(horizon);
    expect(engine.serialize().visitedAnchors).toEqual(expect.arrayContaining(["start", "midway", "finale"]));
  });

  it("refuse fixture: alternative authored path converges when likely branch is refused", () => {
    const refuseRaw = readJson("test/fixtures/convergence-refuse.story.json");
    const story = parseStoryV2OrThrow(refuseRaw);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);

    engine.enqueue(entry("sneaked_in", true));
    engine.commitBoundary();
    expect(engine.serialize().activeCheckpointId).toBe("side_entry");

    engine.enqueue(entry("sneaked_in", true));
    engine.commitBoundary();
    expect(engine.serialize().activeCheckpointId).toBe("finale");
    expect(engine.serialize().visitedAnchors).toEqual(expect.arrayContaining(["start", "finale"]));
    expect(engine.serialize().visitedAnchors).not.toContain("door_stub");
  });
});
