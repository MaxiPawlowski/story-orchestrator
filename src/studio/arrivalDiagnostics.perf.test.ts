import type { Checkpoint, GateNode, Quality, StoryV2, Transition } from "@engine/index";
import { passThroughExits } from "./arrivalDiagnostics";
import { referencePassThroughExits } from "../../test/support/arrivalReference";

const WIDTH = 8;
const LAYERS = 25;
const CROSS_EVERY = 5;
const STAGES = 5;
const SHORTCUT_EVERY = 7;
const ROUTE_CAP = 256;
const READS_PER_STEP = 4;
const WALL_CLOCK_MS = 5000;

class OverBudget extends Error {}

const quality = (key: string, patch: Partial<Quality>): Quality => ({ key, type: "int", source: "extractor", rubric: `${key}?`, ...patch });

const QUALITIES: Quality[] = [
  quality("stage", { type: "enum", values: Array.from({ length: STAGES }, (_, stage) => `s${stage}`) }),
  quality("mood", { type: "enum", values: ["calm", "tense"] }),
  quality("noise_0", {}),
  quality("noise_1", {}),
  quality("noise_2", {}),
];

const node = (layer: number, slot: number): string => (layer === 0 ? "start" : `l${layer}n${slot}`);

const gateInto = (layer: number): GateNode => ({
  all: [
    { q: "stage", op: "==", v: `s${layer % STAGES}` },
    { q: `noise_${layer % 3}`, op: ">=", v: layer },
  ],
});

const layeredStory = (): StoryV2 => {
  const checkpoints: Checkpoint[] = [{ id: "start", name: "start", objective: "Play.", type: "anchor", start: true }];
  const transitions: Transition[] = [];
  for (let layer = 1; layer <= LAYERS; layer += 1) {
    for (let slot = 0; slot < WIDTH; slot += 1) {
      checkpoints.push({ id: node(layer, slot), name: node(layer, slot), objective: "Play.", type: "anchor", ...(slot % 5 === 0 ? { state_snapshot: { mood: "calm" } } : {}) });
      const parents = layer === 1 ? [0] : layer % CROSS_EVERY === 0 ? [slot, (slot + WIDTH - 1) % WIDTH] : [slot];
      parents.forEach((parent) => transitions.push({ from: node(layer - 1, parent), to: node(layer, slot), priority: 1, gate: gateInto(layer) }));
      if (slot === 0 && layer % SHORTCUT_EVERY === 0 && layer + 2 <= LAYERS) transitions.push({ from: node(layer, 0), to: node(layer + 2, 0), priority: 2, gate: { q: "stage", op: "==", v: `s${layer % STAGES}` } });
    }
  }
  return { format: 2, title: "Layers", description: "", qualities: QUALITIES, checkpoints, transitions, roster: [{ id: "guide", name: "Guide" }] };
};

const counted = (story: StoryV2, limit: number) => {
  let reads = 0;
  const trap: ProxyHandler<object> = {
    get(target, key, receiver) {
      reads += 1;
      if (reads > limit) throw new OverBudget();
      return Reflect.get(target, key, receiver);
    },
  };
  const draft: StoryV2 = {
    ...story,
    transitions: story.transitions.map((entry) => new Proxy(entry, trap) as Transition),
    checkpoints: story.checkpoints.map((entry) => new Proxy(entry, trap) as Checkpoint),
  };
  return { draft, reads: () => reads };
};

const routeShape = (story: StoryV2): Map<string, { routes: number; depth: number }> => {
  const shape = new Map<string, { routes: number; depth: number }>([["start", { routes: 1, depth: 0 }]]);
  story.transitions.forEach((entry) => {
    const before = shape.get(entry.from) ?? { routes: 1, depth: 0 };
    const now = shape.get(entry.to) ?? { routes: 0, depth: 0 };
    shape.set(entry.to, { routes: Math.min(ROUTE_CAP, now.routes + before.routes), depth: Math.max(now.depth, before.depth + 1) });
  });
  return shape;
};

const ceilingFor = (story: StoryV2): number => {
  const shape = routeShape(story);
  const work = (id: string) => (shape.get(id)?.routes ?? 0) * (shape.get(id)?.depth ?? 0);
  const walks = story.checkpoints.reduce((sum, checkpoint) => sum + work(checkpoint.id), 0);
  const exits = story.transitions.reduce((sum, exit) => sum + work(exit.from), 0);
  return READS_PER_STEP * (walks + exits);
};

describe("gate-open-on-arrival stays linear in edges x routes on a large branching story", () => {
  const story = layeredStory();
  const ceiling = ceilingFor(story);
  const planted = story.transitions.flatMap((entry, index) => (entry.priority === 2 ? [index] : []));

  it("builds a story large enough to matter", () => {
    expect(story.checkpoints.length).toBeGreaterThanOrEqual(200);
    expect(story.transitions.length).toBeGreaterThanOrEqual(story.checkpoints.length);
  });

  it("reads each edge and checkpoint under the ceiling, inside the wall-clock backstop", () => {
    const run = counted(story, Number.POSITIVE_INFINITY);
    const started = Date.now();
    const found = passThroughExits(run.draft);
    const elapsed = Date.now() - started;
    console.log(`arrival perf: new reads ${run.reads()} ceiling ${ceiling} ms ${elapsed}`);
    expect(found.map((entry) => entry.index)).toEqual(planted);
    expect(run.reads()).toBeLessThan(ceiling);
    expect(elapsed).toBeLessThan(WALL_CLOCK_MS);
  });

  it("control: the pre-d321a2b8 algorithm blows through the same ceiling on the same story", () => {
    const run = counted(story, ceiling);
    const started = Date.now();
    expect(() => referencePassThroughExits(run.draft)).toThrow(OverBudget);
    console.log(`arrival perf: old reads > ${run.reads() - 1} ms ${Date.now() - started}`);
    expect(run.reads()).toBeGreaterThan(ceiling);
  });

  it("control: the counter sees the old algorithm agree on a story small enough to finish", () => {
    const kept = new Set(story.checkpoints.slice(0, 1 + WIDTH * 12).map((checkpoint) => checkpoint.id));
    const small: StoryV2 = { ...story, checkpoints: story.checkpoints.filter((checkpoint) => kept.has(checkpoint.id)), transitions: story.transitions.filter((entry) => kept.has(entry.to)) };
    const fresh = counted(small, Number.POSITIVE_INFINITY);
    const reference = counted(small, Number.POSITIVE_INFINITY);
    const found = passThroughExits(fresh.draft);
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(referencePassThroughExits(reference.draft));
    expect(reference.reads()).toBeGreaterThan(fresh.reads());
  });
});
