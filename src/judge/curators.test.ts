import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runBackgroundCalibration, runContinuityCalibration, type BackgroundCase, type ContinuityCase } from "./curatorCalibration";
import { backgroundCandidates, backgroundDecision, buildBackgroundRequest, buildContinuityRequest, continuityNote, readBackground, sceneDescription } from "./curators";
import { BACKGROUND_MAX_OPTIONS, CONTINUITY_MAX_FACTS } from "./policy";
import { validateJudgeRequest } from "./questions";
import { judgeFamilyScores } from "./selfTest";
import type { JudgeAnswer, JudgeRequest } from "./types";

const noul = (p: number): JudgeAnswer => ({ type: "noul", noul: p });

describe("continuity warden core (v2.2 plan 05)", () => {
  it("asks one question per fact over the reply, capped at 40 facts", () => {
    const facts = Array.from({ length: CONTINUITY_MAX_FACTS + 5 }, (_, index) => `Fact ${index}.`);
    const request = buildContinuityRequest({ speaker: "Arin", text: "Hi." }, facts);
    expect(Object.keys(request.questions)).toHaveLength(CONTINUITY_MAX_FACTS);
    expect(request.state).toEqual({ established_facts: Object.fromEntries(facts.slice(0, CONTINUITY_MAX_FACTS).map((fact, index) => [`fact_${index}`, fact])), reply: { speaker: "Arin", text: "Hi." } });
    expect(request.questions["fact:0"].instructions).toBe("Does `reply` contradict `established_facts.fact_0`?");
    expect(validateJudgeRequest(request)).toEqual([]);
  });

  it("notes at most two broken facts over the cut, most certain first, in code-composed text", () => {
    const facts = ["Arin is wounded.", "The reward is 500 crowns.", "Luke is twelve.", "It is night."];
    const note = continuityNote({ "fact:0": noul(0.75), "fact:1": noul(0.95), "fact:2": noul(0.69), "fact:3": noul(0.9) }, facts);
    expect(note).toEqual({ facts: ["The reward is 500 crowns.", "It is night."], text: "Continuity: established — The reward is 500 crowns. Keep the next reply consistent with it.\nContinuity: established — It is night. Keep the next reply consistent with it." });
    expect(continuityNote({ "fact:0": noul(0.2) }, facts)).toBeNull();
  });
});

describe("scene-setter core (v2.2 plan 05)", () => {
  it("composes the scene from the checkpoint, the scene read and the last two messages", () => {
    const description = sceneDescription({ checkpointName: "Night Market", objective: "Find the fence.", location: "market street", time: "night", messages: [{ speaker: "A", text: "one" }, { speaker: "B", text: "two" }, { speaker: "C", text: "three" }] });
    expect(description).toBe("Night Market — Find the fence. (at market street, at night).\nB: two\nC: three");
    expect(sceneDescription({ checkpointName: "X", objective: "Y.", time: "unclear", messages: [] })).toBe("X — Y..");
  });

  it("drops utility files, and past the cap keeps the names sharing the most words with the scene", () => {
    expect(backgroundCandidates(["_black.jpg", "__transparent.png", "tavern day.jpg", "tavern day.jpg"], "")).toEqual(["tavern day.jpg"]);
    const many = Array.from({ length: BACKGROUND_MAX_OPTIONS + 3 }, (_, index) => `filler ${index}.jpg`);
    const kept = backgroundCandidates([...many, "desert ruins sphinx.jpg"], "The sphinx guards the desert ruins");
    expect(kept).toHaveLength(BACKGROUND_MAX_OPTIONS);
    expect(kept[0]).toBe("desert ruins sphinx.jpg");
  });

  it("changes the background only for a real file, with confidence, that is not already showing", () => {
    const names = ["royal.jpg", "tavern day.jpg"];
    const request = buildBackgroundRequest(names, "A throne room.");
    expect(Object.keys((request.questions.pick as { criteria: Record<string, unknown> }).criteria)).toEqual(["royal.jpg", "tavern day.jpg", "none"]);
    expect(validateJudgeRequest(request)).toEqual([]);
    const pick = (choice: string, confidence: number) => readBackground({ pick: { type: "choice", choice, confidence, probabilities: {} } }, names);
    expect(backgroundDecision(pick("royal.jpg", 0.9), null)).toBe("royal.jpg");
    expect(backgroundDecision(pick("royal.jpg", 0.9), "royal.jpg")).toBeNull();
    expect(backgroundDecision(pick("royal.jpg", 0.5), null)).toBeNull();
    expect(backgroundDecision(pick("none", 0.99), null)).toBeNull();
    expect(pick("invented.jpg", 0.99)).toBeNull();
  });
});

describe("curator calibration (real answers, production shape)", () => {
  const replay = (name: string) => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8")) as { model: string; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
    const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
  };
  const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8"));

  it.each(["continuity.json", "continuity-holdout.json"])("continuity %s: every family at its floor at CONTINUITY_P", async (name) => {
    const data = fixture(name) as { floors: Record<string, number>; rows: ContinuityCase[] };
    const report = await runContinuityCalibration(replay(name), data.rows);
    expect(report.rows.filter((row) => row.picked === null)).toEqual([]);
    expect(judgeFamilyScores(report, data.floors).filter((row) => !row.ok)).toEqual([]);
  });

  it("backgrounds: every no-fit case stays unchanged; the pick family is under its floor (the scene-setter is not built)", async () => {
    const data = fixture("backgrounds.json") as { floors: Record<string, number>; installed: string[]; rows: BackgroundCase[] };
    const scores = judgeFamilyScores(await runBackgroundCalibration(replay("backgrounds.json"), data.rows, data.installed), data.floors);
    expect(scores.find((row) => row.family === "none")).toMatchObject({ right: 3, total: 3 });
    expect(scores.find((row) => row.family === "pick")).toMatchObject({ right: 13, total: 16, ok: false });
  });
});
