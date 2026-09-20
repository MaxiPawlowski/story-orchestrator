import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2, type Quality, type ValidationError } from "@engine/index";
import { buildStallRequest, buildTypedPlan, readTypedDeltas, stallVerdict, typedFloor, type StallLeaf } from "./extraction";
import { runStallCalibration, runTypedCalibration, type StallCase, type TypedCase } from "./extractionCalibration";
import { validateJudgeRequest } from "./questions";
import { judgeFamilyScores } from "./selfTest";
import type { JudgeAnswer, JudgeRequest } from "./types";

const story = { title: "Sun Ruins", checkpointName: "The Gate", objective: "Enter." };
const window = [{ id: 4, speaker: "Max", text: "I answer the sphinx: \"the moon\". It cost 250 crowns to get here." }, { id: 5, speaker: "Sphinx", text: "Correct. You may pass." }];
const q = (patch: Partial<Quality> & Pick<Quality, "key" | "type">): Quality => ({ source: "extractor", rubric: `What about ${patch.key}?`, ...patch });

describe("typed read core (v2.2 plan 06)", () => {
  it("asks only hinted extractor qualities, one question per hint plus an evidence choice", () => {
    const plan = buildTypedPlan([
      q({ key: "riddle", type: "enum", values: ["moon", "wrong"], read_as: "choice", criteria: { moon: { what: "The player answers the moon", not_for: "A companion suggesting it" } } }),
      q({ key: "passed", type: "bool", read_as: "choice" }),
      q({ key: "fee", type: "int", read_as: "stated" }),
      q({ key: "respect", type: "int", rubric: "Respect from 0 (none) to 4 (awe)", read_as: "rating" }),
      q({ key: "unhinted", type: "bool" }),
      q({ key: "code", type: "bool", source: "code", read_as: "choice" }),
    ], window, story);
    expect(plan).not.toBeNull();
    expect(Object.keys(plan!.request.questions)).toEqual(["q:riddle", "evidence:riddle", "q:passed", "evidence:passed", "q:fee", "evidence:fee", "presence:respect", "q:respect", "evidence:respect"]);
    expect((plan!.request.questions["q:riddle"] as { criteria: Record<string, unknown> }).criteria).toEqual({ moon: { what: "The player answers the moon", not_for: "A companion suggesting it" }, wrong: null, "not shown": "The transcript does not settle this" });
    expect(Object.keys((plan!.request.questions["q:fee"] as { criteria: Record<string, unknown> }).criteria)).toEqual(['"250" in msg_4', "none"]);
    expect(plan!.request.state).toMatchObject({ story: { title: "Sun Ruins", current_scene: "The Gate", scene_goal: "Enter." } });
    expect(validateJudgeRequest(plan!.request)).toEqual([]);
    expect(buildTypedPlan([q({ key: "unhinted", type: "bool" })], window, story)).toBeNull();
  });

  it("writes only over the floor (latching raises it), checks the value like the LLM parser, and cites the chosen message", () => {
    const qualities = [q({ key: "riddle", type: "enum", values: ["moon", "wrong"], read_as: "choice" }), q({ key: "passed", type: "bool", read_as: "choice", latching: true }), q({ key: "fee", type: "int", read_as: "stated" })];
    const plan = buildTypedPlan(qualities, window, story)!;
    const answers: Record<string, JudgeAnswer> = {
      "q:riddle": { type: "choice", choice: "moon", confidence: 0.85, probabilities: {} },
      "evidence:riddle": { type: "choice", choice: "msg_4", confidence: 0.9, probabilities: {} },
      "q:passed": { type: "choice", choice: "yes", confidence: 0.85, probabilities: {} },
      "q:fee": { type: "choice", choice: '"250" in msg_4', confidence: 0.97, probabilities: {} },
    };
    const read = readTypedDeltas(answers, plan, qualities, window);
    expect(typedFloor({ latching: true })).toBeCloseTo(0.9);
    expect(read.answered).toEqual(["riddle", "fee"]);
    expect(read.deltas).toEqual([
      { q: "riddle", v: "moon", confidence: 0.85, evidence: window[0].text, messageId: 4 },
      { q: "fee", v: 250, confidence: 0.97, evidence: window[0].text, messageId: 4 },
    ]);
  });

  it("a 'not shown' answer over the floor counts as answered but writes nothing", () => {
    const qualities = [q({ key: "passed", type: "bool", read_as: "choice" })];
    const plan = buildTypedPlan(qualities, window.slice(0, 1), story)!;
    const read = readTypedDeltas({ "q:passed": { type: "choice", choice: "not shown", confidence: 0.99, probabilities: {} } }, plan, qualities, window.slice(0, 1));
    expect(read).toEqual({ deltas: [], answered: ["passed"] });
  });
});

describe("stall pre-check core (v2.2 plan 06)", () => {
  const leaves: StallLeaf[] = [
    { q: "riddle", rubric: "What did the player answer?", type: "enum", op: "==", v: "moon" },
    { q: "passed", rubric: "Did the party pass the gate?", type: "bool", op: "==", v: true },
    { q: "fee", rubric: "How much was paid?", type: "int", op: ">=", v: 200 },
  ];
  const noul = (...ps: number[]) => Object.fromEntries(ps.map((p, index) => [`leaf:${index}`, { type: "noul" as const, noul: p }]));

  it("phrases each leaf from its rubric and value", () => {
    const request = buildStallRequest(leaves, window);
    expect(request.questions["leaf:0"].instructions).toBe('Does `transcript` show that the answer to "What did the player answer?" is "moon"?');
    expect(request.questions["leaf:1"].instructions).toBe('Does `transcript` show that the answer to "Did the party pass the gate?" is yes?');
    expect(validateJudgeRequest(request)).toEqual([]);
  });

  it("writes directly only equality bool/enum leaves at 0.95, keeps a genuine stall under 0.1, re-reads otherwise", () => {
    expect(stallVerdict(noul(0.97, 0.4, 0.99), leaves)).toEqual({ kind: "direct", deltas: [{ q: "riddle", v: "moon", p: 0.97 }] });
    expect(stallVerdict(noul(0.05, 0.02, 0.08), leaves)).toEqual({ kind: "genuine", maxP: 0.08 });
    expect(stallVerdict(noul(0.5, 0.02, 0.99), leaves)).toEqual({ kind: "reread", maxP: 0.99 });
    expect(stallVerdict(null, leaves).kind).toBe("reread");
  });
});

describe("read_as validation (v2.2 plan 06)", () => {
  const story = (quality: Record<string, unknown>) => ({ format: 2, id: "hints", title: "Hints", description: "", qualities: [{ key: "x", source: "extractor", rubric: "What?", ...quality }], checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }], transitions: [], roster: [] });
  const errors = (quality: Record<string, unknown>) => {
    const parsed = parseStoryV2(story(quality));
    return Array.isArray(parsed) ? (parsed as ValidationError[]).map((error) => `${error.path}: ${error.message}`) : [];
  };

  it("accepts each hint on the types it fits", () => {
    expect(errors({ type: "bool", read_as: "choice", criteria: { true: "Shown", false: { what: "Not shown", not_for: "Guesses", examples: ["no"] } } })).toEqual([]);
    expect(errors({ type: "enum", values: ["a", "b"], read_as: "choice", criteria: { a: "The a one" } })).toEqual([]);
    expect(errors({ type: "float", read_as: "stated" })).toEqual([]);
    expect(errors({ type: "int", rubric: "Trust from 0 (none) to 5 (total)", read_as: "rating" })).toEqual([]);
    expect(errors({ type: "int", read_as: "rating", criteria: { levels: [{ value: 1, label: "low" }, { value: 2, label: "high" }] } })).toEqual([]);
  });

  it("rejects every hint that cannot work", () => {
    expect(errors({ type: "int", read_as: "choice" })).toEqual(["qualities.0.read_as: read_as choice does not fit a int quality"]);
    expect(errors({ type: "bool", read_as: "guess" })).toEqual(["qualities.0.read_as: read_as must be choice, stated or rating"]);
    expect(errors({ type: "bool", source: "code", read_as: "choice" })).toEqual(["qualities.0.read_as: only extractor qualities can be read by the judge"]);
    expect(errors({ type: "enum", values: ["a"], read_as: "choice", criteria: { b: "x" } })).toEqual(["qualities.0.criteria.b: 'b' is not one of the enum values"]);
    expect(errors({ type: "int", read_as: "rating" })).toEqual(['qualities.0.criteria: a rating needs criteria.levels or a rubric that reads "from N (low) to M (high)", for example "from 1 (barely) to 5 (completely)"']);
    expect(errors({ type: "string", read_as: "stated", criteria: { a: "x" } })).toEqual(["qualities.0.criteria: a stated quality takes no criteria: its options are found in the text"]);
    expect(errors({ type: "bool", criteria: { true: "x" } })).toEqual(["qualities.0.criteria: criteria need a read_as hint"]);
  });
});

describe("typed read and stall calibration (real answers, production shape)", () => {
  const replay = (name: string) => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8")) as { model: string; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
    const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
  };
  const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8"));

  it("hard set + live-suite fixtures: judged answers over the floor are right at the floor", async () => {
    const data = fixture("typed.json") as { floors: Record<string, number>; rows: TypedCase[] };
    const scores = judgeFamilyScores(await runTypedCalibration(replay("typed.json"), data.rows), data.floors);
    expect(scores.find((row) => row.family === "answered")?.ok).toBe(true);
  });

  it("Phase A leaves: every direct write was shown, and no real stall is taken as genuine", async () => {
    const data = fixture("stall.json") as { floors: Record<string, number>; rows: StallCase[] };
    const scores = judgeFamilyScores(await runStallCalibration(replay("stall.json"), data.rows), data.floors);
    expect(scores.filter((row) => !row.ok)).toEqual([]);
  });
});
