import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { deriveScopeWithSources } from "./scope";
import { DISCOVERY_SCOPE_CAP, DISCOVERY_SOURCE, SCOPE_SOURCES, discoveryRotation } from "./scopeSources";
import { labRaw } from "../../test/support/codexLab";

const FLAGS = Array.from({ length: 10 }, (_, at) => `clue_${at}`);

const crowded = (): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, title: "Crowded", description: "Every entry starts unknown.", roster: [],
  qualities: FLAGS.map((key) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key} was found.` })),
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "o" }],
  transitions: [],
  codex: { people: FLAGS.map((key, at) => ({ id: `p${at}`, name: `Person ${at}`, facts: [{ id: "f", text: "A fact.", known_when: { q: key, op: "==", v: true } }] })) },
});

const empty = { values: {}, versions: {}, latched: {} };

const offered = (story: NormalizedStoryV2, rotation: number): string[] =>
  deriveScopeWithSources(story, "start", empty, [], { rotation }).sources.filter((read) => read.kind === "discovery").flatMap((read) => read.keys);

describe("C9: discovery never deadlocks", () => {
  test("every entry gate and first-fact key is offered within ceil(units / per-read cap) + 1 reads", () => {
    const story = crowded();
    const reads = Math.ceil(FLAGS.length / DISCOVERY_SCOPE_CAP) + 1;
    const seen = new Set(Array.from({ length: reads }, (_, rotation) => offered(story, rotation)).flat());
    expect([...seen].sort()).toEqual([...FLAGS].sort());
    expect(offered(story, 0).length).toBeLessThanOrEqual(DISCOVERY_SCOPE_CAP);
  });

  test("control: without the unknown-entry tier nothing is ever read, so every entry would stay unknown", () => {
    const story = crowded();
    const factsOnly = Array.from({ length: 20 }, (_, rotation) => discoveryRotation(story, empty, rotation).facts.flat());
    expect(factsOnly.flat()).toEqual([]);
  });

  test("a read leaves out what it cannot carry and names it as overflow", () => {
    const read = deriveScopeWithSources(crowded(), "start", empty, [], { rotation: 0 }).sources.find((entry) => entry.kind === "discovery")!;
    expect(read.keys.length + read.dropped.length).toBe(FLAGS.length);
    expect(read.dropped.length).toBeGreaterThan(0);
  });
});

describe("C5: a story without a codex reads exactly as before", () => {
  test("scope and pulls are identical with and without the discovery source", () => {
    const story = parseStoryV2OrThrow({ ...labRaw(), codex: undefined });
    const without = SCOPE_SOURCES.filter((source) => source !== DISCOVERY_SOURCE);
    for (let rotation = 0; rotation < 6; rotation += 1) {
      const a = deriveScopeWithSources(story, "start", empty, [], { rotation });
      const b = deriveScopeWithSources(story, "start", empty, [], { rotation }, without);
      expect(a.scope).toEqual(b.scope);
      expect(a.sources.filter((read) => read.kind !== "discovery")).toEqual(b.sources);
    }
  });
});
