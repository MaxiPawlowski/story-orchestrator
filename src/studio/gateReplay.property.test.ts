import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow, type GateLeaf, type GateNode, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { replayGate, type ReplayEdge } from "./gateReplay";

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const pick = <T>(next: () => number, values: T[]): T => values[Math.floor(next() * values.length)];

const leaves = (gate: GateNode): GateLeaf[] => {
  if ("q" in gate) return [gate];
  if ("all" in gate) return gate.all.flatMap(leaves);
  if ("any" in gate) return gate.any.flatMap(leaves);
  return leaves(gate.not);
};

const candidates = (leaf: GateLeaf): PrimitiveValue[] => {
  if (Array.isArray(leaf.v)) return leaf.v;
  if (typeof leaf.v === "number") return [leaf.v - 1, leaf.v, leaf.v + 1];
  if (typeof leaf.v === "boolean") return [leaf.v, !leaf.v];
  return [leaf.v];
};

const root = join(__dirname, "..", "..");
const shipped = [
  "examples/sun-ruins/quest-for-the-sun-ruins.json",
  "test/fixtures/scan-gate/adolion-academy.story.json",
  "test/fixtures/scan-gate/adolion-adventurer.story.json",
  "test/fixtures/branching.story.json",
  "test/fixtures/linear.story.json",
  "test/fixtures/convergence-drift.story.json",
].map((file) => parseStoryV2OrThrow(JSON.parse(readFileSync(join(root, file), "utf8"))));

const play = (story: NormalizedStoryV2, seed: number) => {
  const next = rng(seed);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const writable = story.transitions.flatMap((transition) => leaves(transition.gate)).filter((leaf) => story.qualityByKey[leaf.q]?.source === "extractor");
  let message = 0;
  for (let step = 0; step < 40; step += 1) {
    message += 2;
    const context = { lastMessageId: message, chatLength: message + 1 };
    if (step > 0 && next() < 0.05) {
      engine.activateCheckpoint(pick(next, story.checkpoints).id, context);
      continue;
    }
    const writes = writable.length ? Array.from({ length: Math.floor(next() * 3) }, () => pick(next, writable)) : [];
    if (writes.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: message - 1, to: message }, deltas: writes.map((leaf) => ({ q: leaf.q, v: pick(next, candidates(leaf)), source: "extractor" as const })) });
    engine.commitBoundary(context);
  }
  return engine.serializeHistory();
};

const edgesOf = (story: NormalizedStoryV2): ReplayEdge[] => story.transitions.map((transition, order) => ({ from: transition.from, to: transition.to, gate: transition.gate, priority: transition.priority, order }));

describe("v2.5 plan 07 A3: replaying every UNCHANGED gate reproduces the recording (shipped stories, fixed seeds)", () => {
  it("every boundary at a source: the replay fires exactly where the engine fired, 100%", () => {
    let checked = 0;
    let fires = 0;
    let progressFires = 0;
    for (const story of shipped) {
      const declared = new Set(Object.keys(story.qualityByKey));
      const edges = edgesOf(story);
      for (let seed = 1; seed <= 25; seed += 1) {
        const history = play(story, seed * 7919 + story.transitions.length);
        progressFires += history.log.filter((entry) => entry.fired?.effects?.progress).length;
        for (const edge of edges) {
          const result = replayGate({ edge, siblings: edges, history, declared });
          for (const row of result.rows.filter((candidate) => candidate.atSource && !candidate.manual)) {
            checked += 1;
            if (row.recordedFire) fires += 1;
            expect({ story: story.title, seed, edge: `${edge.from}->${edge.to}#${edge.order}`, boundary: row.boundary, wouldFire: row.wouldFire }).toEqual({ story: story.title, seed, edge: `${edge.from}->${edge.to}#${edge.order}`, boundary: row.boundary, wouldFire: row.recordedFire });
          }
          expect(result.divergesAt).toBeNull();
        }
      }
    }
    expect(fires).toBeGreaterThan(20);
    expect(progressFires).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(500);
  });
});
