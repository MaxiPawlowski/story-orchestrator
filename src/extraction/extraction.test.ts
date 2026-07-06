import { parseStoryV2OrThrow, type BlackboardSnapshot } from "@engine/index";
import { renderSharedReadPrompt } from "./contract";
import { buildFixtureRun } from "./fixtureRun";
import { parseSharedReadResponse } from "./parse";
import { deriveFullScope, deriveScope } from "./scope";
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

describe("deriveFullScope", () => {
  it("includes every extractor-source quality regardless of reachability from any checkpoint", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const scope = deriveFullScope(story, { values: {}, versions: {}, latched: {} });
    expect(scope.map((entry) => entry.key)).toEqual(["location", "mara_trust", "player_has_key", "tension_current"]);
  });

  it("excludes latched qualities", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const scope = deriveFullScope(story, { values: { player_has_key: true }, versions: { player_has_key: 1 }, latched: { player_has_key: true } });
    expect(scope.map((entry) => entry.key)).not.toContain("player_has_key");
  });

  it("excludes code-source qualities", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const scope = deriveFullScope(story, { values: {}, versions: {}, latched: {} });
    expect(scope.map((entry) => entry.key)).not.toContain("message_count");
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

  it("parses DELTA, legacy FACT, tagged MEMORY, and a confirmed scene break from one combined response", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "DELTA q=player_has_key value=true evidence=\"brass key from the hook\"",
      "FACT importance=2 text=\"Max took the brass key from the hook.\" evidence=\"brass key from the hook\"",
      "MEMORY type=relationship importance=3 expiration=permanent character=\"mara\" text=\"Mara trusts Max after the vault ordeal.\" evidence=\"trusting Max a little more\"",
      "MEMORY type=scene importance=1 expiration=scene text=\"Candlelit hall, late evening.\" evidence=\"the hall was dim and quiet\"",
      "SCENE_BREAK at=5 reason=location",
    ].join("\n"), story);

    expect(parsed.rejected).toEqual([]);
    expect(parsed.deltas.map((entry) => entry.delta.q)).toEqual(["player_has_key"]);
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.memory).toEqual([
      { tier: "facts", type: "relationship", importance: 3, expiration: "permanent", entities: [], characterId: "mara", text: "Mara trusts Max after the vault ordeal.", evidence: "trusting Max a little more" },
      { tier: "session_details", type: "scene", importance: 1, expiration: "scene", entities: [], characterId: undefined, text: "Candlelit hall, late evening.", evidence: "the hall was dim and quiet" },
    ]);
    expect(parsed.sceneBreak).toEqual({ at: 5, reason: "location" });
  });

  it("strips reasoning-channel token prefixes before matching directives", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "<|channel>thought",
      "<channel|>DELTA q=player_has_key value=true evidence=\"I take the brass key\"",
      "[7]<|channel>thought",
      "[3]<channel|>FACT importance=2 text=\"Max took the brass key.\" evidence=\"I take the brass key\"",
    ].join("\n"), story);
    expect(parsed.deltas.map((entry) => entry.delta.q)).toEqual(["player_has_key"]);
    expect(parsed.facts).toHaveLength(1);
    expect(parsed.rejected.map((entry) => entry.line)).toEqual(["thought", "thought"]);
  });

  it("accepts bare known-quality delta lines missing the DELTA prefix, still requiring evidence", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "tension_current=\"tense\" evidence=\"a low growl in the dark\"",
      "player_has_key=true evidence=\"took the key\"",
      "player_has_key=true",
      "not_a_quality=true evidence=\"x\"",
    ].join("\n"), story);
    expect(parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }))).toEqual([
      { q: "tension_current", v: 0.5 },
      { q: "player_has_key", v: true },
    ]);
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(["unrecognized line", "unknown quality"]);
  });

  it("accepts DELTA-prefixed bare and q-less value= delta variants (gemma live quirks)", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "DELTA player_has_key=true evidence=\"I take the brass key\"",
      "<channel|>DELTA tension_current=\"stirring\" evidence=\"the air turns cold\"",
      "DELTA player_has_key value=true evidence=\"the key is in hand\"",
      "DELTA not_a_quality=true evidence=\"x\"",
    ].join("\n"), story);
    expect(parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }))).toEqual([
      { q: "player_has_key", v: true },
      { q: "tension_current", v: 0.25 },
      { q: "player_has_key", v: true },
    ]);
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(["unknown quality"]);
  });

  it("treats SCENE_NONE as an explicit no-break rather than a rejection", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse("SCENE_NONE", story);
    expect(parsed.sceneBreak).toBeUndefined();
    expect(parsed.rejected).toEqual([]);
  });

  it("routes epistemic and state lines into their own buckets without arc collision", () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const parsed = parseSharedReadResponse([
      "[arc] The thief's identity remains unknown to the guard.",
      "[knows] Kael | he took the gem",
      "[hiding] Kael from Lyria | the theft",
      "[believes] Lyria | nothing was taken",
      "[state:Kael:character] location=dungeon | mood=grim",
    ].join("\n"), story);
    expect(parsed.arcs).toHaveLength(1);
    expect(parsed.epistemic.map((entry) => entry.tag)).toEqual(["knows", "hiding", "believes"]);
    expect(parsed.epistemic[1]).toMatchObject({ subject: "Kael", hiddenFrom: "Lyria", content: "the theft" });
    expect(parsed.ledger).toEqual([
      { entity: "Kael", entityType: "character", field: "location", value: "dungeon" },
      { entity: "Kael", entityType: "character", field: "mood", value: "grim" },
    ]);
    expect(parsed.rejected).toEqual([]);
  });

  const fixturesDir = path.join(process.cwd(), "test/fixtures");
  const CORPUS = fs.readdirSync(fixturesDir)
    .filter((file) => /^extractor.+\.story\.json$/.test(file))
    .map((file) => file.replace(/\.story\.json$/, ""))
    .filter((name) => ["transcript", "expected"].every((kind) => fs.existsSync(path.join(fixturesDir, `${name}.${kind}.json`))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  it("discovers the full suite-A corpus (≥20 fixtures)", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(CORPUS)("parses the %s suite-A corpus fixture and lists its scope in the prompt", (name) => {
    const storyRaw = readJson<unknown>(`${name}.story.json`);
    const transcript = readJson<Array<{ index: number; speaker: string; text: string }>>(`${name}.transcript.json`);
    const golden = fs.readFileSync(path.join(process.cwd(), "test/goldens", `${name}.response.txt`), "utf8");
    const expected = readJson<{
      deltas: Array<{ q: string; v: unknown; evidence: string }>;
      rejected: Array<{ reason: string }>;
      facts: { minCount: number; mustContain: string[]; mustNotContain: string[] };
      spec?: { activeCheckpointId?: string; window?: { from: number; to: number }; canon?: string; blackboard?: BlackboardSnapshot };
      promptExcludes?: string[];
    }>(`${name}.expected.json`);

    const run = buildFixtureRun({ story: storyRaw, transcript, ...(expected.spec ?? {}) });
    expected.deltas.forEach((entry) => {
      expect(run.prompt).toContain(entry.q);
    });
    (expected.promptExcludes ?? []).forEach((needle) => {
      expect(run.prompt).not.toContain(needle);
    });

    const parsed = parseSharedReadResponse(golden, run.story);
    expect(parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }))).toEqual(expected.deltas.map((entry) => ({ q: entry.q, v: entry.v })));
    expected.deltas.forEach((entry) => {
      expect(parsed.deltas.find((delta) => delta.delta.q === entry.q)?.evidence).toContain(entry.evidence);
    });
    expect(parsed.rejected.map((entry) => entry.reason)).toEqual(expected.rejected.map((entry) => entry.reason));
    if (expected.facts.minCount > 0) expect(parsed.facts.length).toBeGreaterThanOrEqual(expected.facts.minCount);
    for (const substring of expected.facts.mustContain) {
      if (substring) expect(parsed.facts.some((fact) => fact.text.includes(substring))).toBe(true);
    }
    for (const substring of expected.facts.mustNotContain) {
      if (substring) expect(parsed.facts.some((fact) => fact.text.includes(substring))).toBe(false);
    }
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

  it("buildFixtureRun produces the same live/deterministic prompt path for the base fixture", () => {
    const run = buildFixtureRun({ story: storyFixture, transcript: transcriptFixture, activeCheckpointId: "start", window: { from: 4, to: 5 }, canon: "Anchor start: Find the key." });
    expect(run.activeCheckpointId).toBe("start");
    expect(run.scope.map((entry) => entry.key)).toEqual(["location", "mara_trust", "player_has_key", "tension_current"]);
    expect(run.prompt).toContain("Closed vocabulary");
    expect(run.prompt).toContain("player_has_key");
    expect(run.prompt).toContain("[4] Max");
  });
});
