import * as branchingStory from "../../test/fixtures/branching.story.json";
import { progressQualityForAnchor } from "./convergence";
import { StoryEngine } from "./engine";
import { parseStoryV2OrThrow } from "./validate";
import type { ApplyQueueEntry, PrimitiveValue } from "./schema";

const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const STORY = parseStoryV2OrThrow(branchingStory);
const PROGRESS_KEY = progressQualityForAnchor("exit");
const RUNS = 1000;

describe("convergence progress monotonicity (seeded fuzz)", () => {
  for (let run = 0; run < RUNS; run += 1) {
    it(`progress_toward_exit never decreases across random event ordering (run ${run})`, () => {
      const random = mulberry32(0x9e3779b9 + run * 2654435761);
      const engine = new StoryEngine({ now: () => 0 });
      engine.loadStory(STORY);
      let maxProgress = typeof engine.serialize().blackboard.values[PROGRESS_KEY] === "number"
        ? (engine.serialize().blackboard.values[PROGRESS_KEY] as number)
        : 0;

      const steps = 20 + Math.floor(random() * 30);
      for (let step = 0; step < steps; step += 1) {
        if (random() < 0.5) {
          engine.enqueue(randomQueueEntry(random));
        } else {
          engine.commitBoundary({ lastMessageId: step, chatLength: step + 1 });
          const current = engine.serialize().blackboard.values[PROGRESS_KEY];
          const progress = typeof current === "number" ? current : 0;
          expect(progress).toBeGreaterThanOrEqual(maxProgress);
          maxProgress = progress;
        }
      }
    });
  }

  it("extractor deltas to progress_toward_* are rejected by source mismatch", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(STORY);
    engine.enqueue({
      source: "extractor",
      blackboardVersionSum: 0,
      turnRange: { from: 0, to: 0 },
      deltas: [{ q: PROGRESS_KEY, v: 5, source: "extractor" }],
    });
    engine.commitBoundary();
    expect(engine.serialize().blackboard.values[PROGRESS_KEY]).toBeUndefined();
  });
});

const QUALITY_KEYS = ["route", "noise", "guard_asleep", PROGRESS_KEY, "message_count"];
const SOURCES = ["extractor", "code", "reconciliation"] as const;

const randomQueueEntry = (random: () => number): ApplyQueueEntry => {
  const key = QUALITY_KEYS[Math.floor(random() * QUALITY_KEYS.length)];
  const source = SOURCES[Math.floor(random() * SOURCES.length)];
  const value = randomValue(key, random);
  return {
    source,
    blackboardVersionSum: 0,
    turnRange: { from: Math.floor(random() * 3), to: Math.floor(random() * 3) },
    deltas: [{ q: key, v: value, source }],
  };
};

const randomValue = (key: string, random: () => number): PrimitiveValue => {
  if (key === "route") return ["stealth", "alarm"][Math.floor(random() * 2)];
  if (key === "guard_asleep") return random() < 0.5;
  if (key === PROGRESS_KEY) return Math.floor(random() * 5);
  return Math.floor(random() * 10);
};
