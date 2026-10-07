import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { isValidationErrorList, parseStoryV2, type Checkpoint, type GateLeaf, type GateNode, type PrimitiveValue, type Quality, type StoryV2, type Transition } from "@engine/index";
import { passThroughExits, type PassThrough } from "./arrivalDiagnostics";
import { referencePassThroughExits } from "../../test/support/arrivalReference";

const ROOT = join(__dirname, "..", "..");
const GOLDEN = join(ROOT, "test", "goldens", "arrival-findings.json");
const CORPUS_DIRS = ["examples", "test/fixtures", "test/scenarios", "test/journeys"];
const OUT_OF_GOLDEN = /adolion/i;
const RANDOM_STORIES = 200;

interface Finding {
  index: number;
  from: string;
  to: string;
  because: string;
}

const walk = (dir: string): string[] => (existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "records" ? [] : walk(path);
    return entry.name.endsWith(".json") ? [path] : [];
  })
  : []);

const storiesIn = (value: unknown, found: unknown[] = []): unknown[] => {
  if (Array.isArray(value)) value.forEach((entry) => storiesIn(entry, found));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.format === 2 && Array.isArray(record.checkpoints)) found.push(record);
    else Object.values(record).forEach((entry) => storiesIn(entry, found));
  }
  return found;
};

const corpus = CORPUS_DIRS.flatMap((dir) => walk(join(ROOT, dir))).flatMap((path) => {
  const text = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const where = relative(ROOT, path).replace(/\\/g, "/");
  return storiesIn(parsed).flatMap((raw, index) => {
    const story = parseStoryV2(raw);
    return isValidationErrorList(story) ? [] : [{ where: `${where}#${index}`, story: story as StoryV2, golden: !OUT_OF_GOLDEN.test(where) && !OUT_OF_GOLDEN.test(text) }];
  });
});

const findings = (found: PassThrough[]): Finding[] =>
  found.map(({ index, exit, because }) => ({ index, from: exit.from, to: exit.to, because })).sort((left, right) => left.index - right.index);

const seeded = (seed: number) => {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const int = (below: number) => Math.floor(next() * below);
  const pick = <T,>(items: T[]): T => items[int(items.length)];
  return { next, int, pick };
};

const ENUM_VALUES = ["a", "b", "c", "d"];

const randomQualities = (): Quality[] => [
  { key: "phase", type: "enum", source: "extractor", rubric: "phase?", values: ENUM_VALUES },
  { key: "trust", type: "enum", source: "extractor", rubric: "trust?", values: ENUM_VALUES.slice(0, 3), latching: true },
  { key: "found", type: "bool", source: "extractor", rubric: "found?" },
  { key: "clues", type: "int", source: "extractor", rubric: "clues?", monotonic: true },
  { key: "noise", type: "int", source: "extractor", rubric: "noise?" },
];

const randomLeaf = (rng: ReturnType<typeof seeded>, quality: Quality): GateLeaf => {
  if (quality.type === "bool") return { q: quality.key, op: rng.pick(["==", "!="]), v: rng.next() < 0.5 };
  if (quality.type === "enum") {
    const values = quality.values ?? [];
    const op = rng.pick(["==", "!=", "in"] as const);
    return op === "in" ? { q: quality.key, op, v: values.filter(() => rng.next() < 0.5) } : { q: quality.key, op, v: rng.pick(values) };
  }
  return { q: quality.key, op: rng.pick([">=", ">", "<=", "<", "=="] as const), v: rng.int(5) };
};

const randomGate = (rng: ReturnType<typeof seeded>, qualities: Quality[]): GateNode => {
  const count = 1 + rng.int(3);
  const leaves = Array.from({ length: count }, () => randomLeaf(rng, rng.pick(qualities)));
  if (count === 1 && rng.next() < 0.5) return leaves[0];
  return rng.next() < 0.15 ? { any: leaves } : { all: leaves };
};

const randomSnapshot = (rng: ReturnType<typeof seeded>, qualities: Quality[]): Record<string, PrimitiveValue> | undefined => {
  if (rng.next() < 0.7) return undefined;
  const quality = rng.pick(qualities);
  const leaf = randomLeaf(rng, quality);
  return { [quality.key]: Array.isArray(leaf.v) ? rng.pick(ENUM_VALUES) : leaf.v };
};

const randomStory = (seed: number): StoryV2 => {
  const rng = seeded(seed);
  const qualities = randomQualities();
  const size = 4 + rng.int(9);
  const checkpoints: Checkpoint[] = Array.from({ length: size }, (_, at) => ({
    id: `c${at}`, name: `c${at}`, objective: "Play.", type: "anchor", ...(at === 0 ? { start: true } : {}),
    ...(() => {
      const snapshot = randomSnapshot(rng, qualities);
      return snapshot ? { state_snapshot: snapshot } : {};
    })(),
  }));
  const transitions: Transition[] = [];
  for (let at = 1; at < size; at += 1) transitions.push({ from: `c${rng.int(at)}`, to: `c${at}`, priority: 1, gate: randomGate(rng, qualities) });
  const extra = rng.int(size * 2);
  for (let count = 0; count < extra; count += 1) transitions.push({ from: `c${rng.int(size)}`, to: `c${rng.int(size)}`, priority: 1 + rng.int(3), gate: randomGate(rng, qualities) });
  return { format: 2, title: `random ${seed}`, description: "", qualities, checkpoints, transitions, roster: [{ id: "guide", name: "Guide" }] };
};

describe("gate-open-on-arrival: the d321a2b8 rewrite finds exactly what the old algorithm found", () => {
  it("finds the in-repo story corpus", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(57);
  });

  it("agrees with the pre-rewrite algorithm on every in-repo story", () => {
    const disagreeing = corpus.filter(({ story }) => JSON.stringify(findings(passThroughExits(story))) !== JSON.stringify(findings(referencePassThroughExits(story))));
    expect(disagreeing.map(({ where }) => where)).toEqual([]);
  });

  it("agrees with the pre-rewrite algorithm on seeded random branching stories, and the sample is not vacuous", () => {
    const stories = Array.from({ length: RANDOM_STORIES }, (_, seed) => randomStory(seed + 1));
    const pairs = stories.map((story) => ({ title: story.title, fresh: findings(passThroughExits(story)), reference: findings(referencePassThroughExits(story)) }));
    expect(pairs.filter(({ fresh, reference }) => JSON.stringify(fresh) !== JSON.stringify(reference)).map(({ title }) => title)).toEqual([]);
    expect(pairs.filter(({ fresh }) => fresh.length > 0).length).toBeGreaterThanOrEqual(RANDOM_STORIES / 10);
  });

  it("matches the committed findings golden for every in-repo story it covers", () => {
    const current = Object.fromEntries(corpus.filter(({ golden }) => golden).map(({ where, story }) => [where, findings(passThroughExits(story))]));
    if (process.env.SO_RECORD_ARRIVAL_GOLDEN === "1") writeFileSync(GOLDEN, `${JSON.stringify(current, null, 2)}\n`);
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Finding[]>;
    expect(Object.keys(current).sort()).toEqual(Object.keys(golden).sort());
    expect(current).toEqual(golden);
    expect(Object.values(golden).some((entries) => entries.length > 0)).toBe(true);
  });

  it("control: a golden with one finding removed fails the same comparison", () => {
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Finding[]>;
    const [where] = Object.entries(golden).find(([, entries]) => entries.length > 0) ?? [];
    const tampered = { ...golden, [where as string]: golden[where as string].slice(1) };
    const current = Object.fromEntries(corpus.filter(({ golden: covered }) => covered).map(({ where: at, story }) => [at, findings(passThroughExits(story))]));
    expect(current).not.toEqual(tampered);
  });
});
