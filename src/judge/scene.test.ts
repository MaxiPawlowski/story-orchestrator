import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateJudgeRequest } from "./questions";
import { buildSceneReadRequest, readScene, SCENE_MAX_REACHABLE, sceneBreakTriggered, sceneFacts, sceneTrackerText, type SceneReadInput } from "./scene";
import { runSceneCalibration, sceneFamilyScores, type SceneCalibrationCase } from "./sceneCalibration";
import type { JudgeAnswer, JudgeRequest } from "./types";

const input = (families: Partial<SceneReadInput["families"]> = {}, extra: Partial<SceneReadInput> = {}): SceneReadInput => ({
  storyTitle: "Sun Ruins",
  checkpointName: "The Job Board",
  objective: "Take the job.",
  cast: [{ rosterId: "arin", name: "Arin", role: "The companion" }, { rosterId: "luke", name: "Luke" }],
  player: "Max",
  locations: ["guild hall", "desert road"],
  reachable: [{ id: "cp2", name: "Leave Town", objective: "Head out." }],
  window: [{ speaker: "Arin", text: "Let's go." }],
  families: { sceneBreak: false, tracker: false, lookahead: false, ...families },
  ...extra,
});

describe("scene read questions (v2.2 plan 03)", () => {
  it("asks only the families that are on, over the spike's state shape", () => {
    const trigger = buildSceneReadRequest(input({ sceneBreak: true }));
    expect(Object.keys(trigger.questions)).toEqual(["scene_break", "scene_break_type"]);
    expect(trigger.state).toEqual({ story: { title: "Sun Ruins" }, scene: { checkpoint: "The Job Board", objective: "Take the job." }, cast: [{ name: "Arin", role: "The companion" }, { name: "Luke" }], player: "Max", transcript: [{ id: "msg_1", speaker: "Arin", text: "Let's go." }] });
    const all = buildSceneReadRequest(input({ sceneBreak: true, tracker: true, lookahead: true }));
    expect(Object.keys(all.questions)).toEqual(["scene_break", "scene_break_type", "location", "time", "present:arin", "present:luke", "heading:cp2"]);
    expect(all.state).toMatchObject({ locations: ["guild hall", "desert road"], times: ["dawn", "morning", "midday", "afternoon", "evening", "night"], reachable: [{ name: "Leave Town", objective: "Head out." }] });
    expect(all.questions["present:arin"].instructions).toBe("Is Arin (The companion) physically present in the scene at the end of `transcript`?");
    expect(all.questions["present:luke"].instructions).toBe("Is Luke physically present in the scene at the end of `transcript`?");
    expect(validateJudgeRequest(all)).toEqual([]);
  });

  it("never asks where the scene is without a location vocabulary, and caps the look-ahead", () => {
    const request = buildSceneReadRequest(input({ tracker: true, lookahead: true }, { locations: [], reachable: Array.from({ length: 9 }, (_, index) => ({ id: `cp${index}`, name: `C${index}`, objective: "o" })) }));
    expect(request.questions.location).toBeUndefined();
    expect(request.state).not.toHaveProperty("locations");
    expect(Object.keys(request.questions).filter((id) => id.startsWith("heading:"))).toHaveLength(SCENE_MAX_REACHABLE);
  });

  it("reads answers for the asked families only, and turns them into over-floor facts", () => {
    const families = { sceneBreak: true, tracker: true, lookahead: true };
    const answers: Record<string, JudgeAnswer> = {
      scene_break: { type: "noul", noul: 0.41 },
      scene_break_type: { type: "choice", choice: "time_skip", confidence: 0.8, probabilities: {} },
      location: { type: "choice", choice: "guild hall", confidence: 0.55, probabilities: {} },
      time: { type: "choice", choice: "evening", confidence: 0.9, probabilities: {} },
      "present:arin": { type: "noul", noul: 0.93 },
      "present:luke": { type: "noul", noul: 0.65 },
      "heading:cp2": { type: "noul", noul: 0.81 },
    };
    const read = readScene(answers, input(families));
    expect(read).toEqual({ sceneBreak: { p: 0.41, type: "time_skip" }, location: { value: "guild hall", confidence: 0.55 }, time: { value: "evening", confidence: 0.9 }, present: { arin: 0.93, luke: 0.65 }, headingTo: { cp2: 0.81 } });
    expect(sceneBreakTriggered(read)).toBe(true);
    const facts = sceneFacts(read, input(families).cast);
    expect(facts).toEqual({ location: null, time: "evening", present: ["Arin"], headingTo: ["cp2"] });
    expect(sceneTrackerText(facts)).toBe("[Scene: evening. Present: Arin.]");
    expect(readScene(answers, input({ sceneBreak: true }))).toEqual({ sceneBreak: { p: 0.41, type: "time_skip" } });
  });

  it("never shows `elsewhere` or `unclear`, and writes no block when nothing qualifies", () => {
    const facts = sceneFacts({ location: { value: "elsewhere", confidence: 0.9 }, time: { value: "unclear", confidence: 0.9 }, present: { arin: 0.2 } }, input().cast);
    expect(facts).toEqual({ location: null, time: null, present: [], headingTo: [] });
    expect(sceneTrackerText(facts)).toBeNull();
    expect(sceneTrackerText({ location: "guild hall", time: null, present: [], headingTo: [] })).toBe("[Scene: guild hall.]");
  });
});

describe("scene read calibration (real answers, production shape)", () => {
  const replay = (name: string) => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8")) as { model: string; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
    const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
  };
  const cases = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8")).rows as SceneCalibrationCase[];

  it("R01–R21 + S01–S22 (both shapes): every built family at its Phase A floor", async () => {
    const report = await runSceneCalibration(replay("scene.json"), cases("scene.json"));
    expect(report.rows.filter((row) => row.picked === null)).toEqual([]);
    const scores = sceneFamilyScores(report);
    expect(scores.map((row) => row.family)).toEqual(["present", "location", "time", "heading", "break", "nobreak"]);
    expect(scores.filter((row) => !row.ok)).toEqual([]);
  });

  it("held-out breaks: no false trigger, recall over the regex's 50%", async () => {
    const scores = sceneFamilyScores(await runSceneCalibration(replay("scene-holdout.json"), cases("scene-holdout.json")));
    expect(scores.find((row) => row.family === "nobreak")).toMatchObject({ right: 10, total: 10 });
    expect(scores.find((row) => row.family === "break")?.ok).toBe(true);
  });
});
