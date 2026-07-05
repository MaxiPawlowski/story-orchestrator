import { parseStoryV2OrThrow } from "@engine/index";
import { renderSharedReadPrompt } from "./contract";
import { parseSharedReadResponse } from "./parse";
import { deriveScope } from "./scope";
import * as fs from "node:fs";
import * as path from "node:path";

const readJson = <T,>(name: string): T => {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "test/fixtures", name), "utf8")) as T;
};

const storyFixture = readJson<unknown>("extractor.story.json");
const transcriptFixture = readJson<Array<{ index: number; speaker: string; text: string }>>("extractor.transcript.json");
const expectedFixture = readJson<{ deltas: Array<{ q: string; v: unknown; evidence: string }>; facts: { minCount: number; mustContain: string[]; mustNotContain: string[] } }>("extractor.expected.json");

describe("extraction scope", () => {
  it("derives extractor qualities gated ahead of the active checkpoint", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const scope = deriveScope(story, "start", { values: {}, versions: {}, latched: {} });
    expect(scope.map((entry) => entry.key)).toEqual(["location", "mara_trust", "player_has_key", "tension_current"]);
    expect(scope.find((entry) => entry.key === "player_has_key")?.hints).toEqual(["Look for explicit possession of the brass key."]);
  });

  it("excludes latched qualities", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const scope = deriveScope(story, "start", { values: { player_has_key: true }, versions: { player_has_key: 1 }, latched: { player_has_key: true } });
    expect(scope.map((entry) => entry.key)).not.toContain("player_has_key");
  });

  it("includes active and reachable checkpoint snapshots", () => {
    const story = parseStoryV2OrThrow({
      ...(storyFixture as Record<string, unknown>),
      checkpoints: [
        { id: "start", name: "Search", objective: "Find the key.", type: "anchor", start: true, state_snapshot: { location: "hall" } },
        { id: "door", name: "Door", objective: "Open the vault door.", type: "anchor", state_snapshot: { mara_trust: 3 } },
      ],
      transitions: [{ from: "start", to: "door", priority: 1, gate: { q: "player_has_key", op: "==", v: true } }],
    });
    const scope = deriveScope(story, "start", { values: {}, versions: {}, latched: {} });
    expect(scope.map((entry) => entry.key)).toEqual(["location", "mara_trust", "player_has_key", "tension_current"]);
  });
});

describe("shared read parser", () => {
  it("parses golden deltas and facts", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const golden = fs.readFileSync(path.join(process.cwd(), "test/goldens/extractor.response.txt"), "utf8");
    const parsed = parseSharedReadResponse(golden, story);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }))).toEqual(expectedFixture.deltas.map((entry) => ({ q: entry.q, v: entry.v })));
    expectedFixture.deltas.forEach((entry) => {
      expect(parsed.deltas.find((delta) => delta.delta.q === entry.q)?.evidence).toContain(entry.evidence);
    });
    expect(parsed.facts.length).toBeGreaterThanOrEqual(expectedFixture.facts.minCount);
    expect(parsed.facts.some((fact) => fact.text.includes(expectedFixture.facts.mustContain[0]))).toBe(true);
    expect(parsed.facts.some((fact) => fact.text.includes(expectedFixture.facts.mustNotContain[0]))).toBe(false);
  });

  it("rejects unknown qualities, bad enum values, and missing evidence", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "DELTA q=unknown value=true evidence=\"x\"",
      "DELTA q=location value=\"tower\" evidence=\"tower\"",
      "DELTA q=player_has_key value=true evidence=\"\"",
    ].join("\n"), story);
    expect(parsed.deltas).toEqual([]);
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(["unknown quality", "invalid value", "missing evidence"]);
  });

  it("maps a tension level label to a numeric delta and keeps the raw level", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "DELTA q=tension_current value=\"critical\" evidence=\"the walls begin to shake\"",
      "DELTA q=tension_current value=\"frantic\" evidence=\"panic sets in\"",
    ].join("\n"), story);
    expect(parsed.deltas).toEqual([
      { delta: { q: "tension_current", v: 0.75, source: "extractor" }, evidence: "the walls begin to shake", rawLevel: "critical" },
    ]);
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(["invalid value"]);
  });

  it.each(["extractor2", "extractor3", "extractor4"])("parses the %s suite-A corpus fixture", (name) => {
    const story = parseStoryV2OrThrow(readJson<unknown>(`${name}.story.json`));
    const golden = fs.readFileSync(path.join(process.cwd(), "test/goldens", `${name}.response.txt`), "utf8");
    const expected = readJson<{
      deltas: Array<{ q: string; v: unknown; evidence: string }>;
      rejected: Array<{ reason: string }>;
      facts: { minCount: number; mustContain: string[]; mustNotContain: string[] };
    }>(`${name}.expected.json`);
    const parsed = parseSharedReadResponse(golden, story);

    expect(parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }))).toEqual(expected.deltas.map((entry) => ({ q: entry.q, v: entry.v })));
    expected.deltas.forEach((entry) => {
      expect(parsed.deltas.find((delta) => delta.delta.q === entry.q)?.evidence).toContain(entry.evidence);
    });
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(expected.rejected.map((entry) => entry.reason));
    expect(parsed.facts.length).toBeGreaterThanOrEqual(expected.facts.minCount);
    expect(parsed.facts.some((fact) => fact.text.includes(expected.facts.mustContain[0]))).toBe(true);
    expect(parsed.facts.some((fact) => fact.text.includes(expected.facts.mustNotContain[0]))).toBe(false);
  });
});

describe("shared read contract", () => {
  it("renders closed vocabulary and transcript", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const qualities = deriveScope(story, "start", { values: {}, versions: {}, latched: {} });
    const prompt = renderSharedReadPrompt({
      storyTitle: story.title,
      activeCheckpointId: "start",
      qualities,
      window: { from: 4, to: 5, messages: transcriptFixture },
      canon: "Anchor start: Find the key.",
    });
    expect(prompt).toContain("Closed vocabulary");
    expect(prompt).toContain("player_has_key");
    expect(prompt).toContain("[4] Max");
  });
});
