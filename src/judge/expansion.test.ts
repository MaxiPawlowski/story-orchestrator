import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildChainRequest, buildPickPrompt, chainScore, judgeVerdict, parsePick, pickChain, readChain, type ChainRead } from "./expansion";
import { runCriticCalibration, runVariantCalibration, type CriticCase, type VariantStub } from "./expansionCalibration";
import { validateJudgeRequest } from "./questions";
import { judgeFamilyScores } from "./selfTest";
import type { JudgeAnswer, JudgeRequest } from "./types";

const read = (patch: Partial<ChainRead> = {}): ChainRead => ({ contradicts: 0.05, advances: 0.9, newCharacter: 0.05, shape: 0.75, ...patch });

describe("expansion judge core (v2.2 plan 07)", () => {
  it("asks the three critic checks, plus the shape score only with a trajectory", () => {
    const base = { facts: ["Luke travels with the party."], target: { name: "The Gate", objective: "Reach the gate." }, cast: ["Arin", "Max"], beats: [{ objective: "Cross the dunes.", guidance: "Heat." }] };
    const plain = buildChainRequest(base);
    expect(Object.keys(plain.questions)).toEqual(["contradicts", "advances", "newCharacter"]);
    expect(plain.state).toEqual({ established_facts: base.facts, target_checkpoint: base.target, cast: base.cast, generated_beats: [{ objective: "Cross the dunes.", guidance: "Heat." }] });
    const shaped = buildChainRequest({ ...base, trajectory: ["calm", "tense"] });
    expect(Object.keys(shaped.questions)).toEqual(["contradicts", "advances", "newCharacter", "shape"]);
    expect(validateJudgeRequest(shaped)).toEqual([]);
  });

  it("reads the answers, normalizing the shape level to 0-1", () => {
    const answers: Record<string, JudgeAnswer> = { contradicts: { type: "noul", noul: 0.1 }, advances: { type: "noul", noul: 0.8 }, newCharacter: { type: "noul", noul: 0.2 }, shape: { type: "score", score: 3, confidence: 0.9, probabilities: {} } };
    expect(readChain(answers)).toEqual({ contradicts: 0.1, advances: 0.8, newCharacter: 0.2, shape: 0.75 });
    expect(readChain({ contradicts: { type: "noul", noul: 0.1 } })).toBeNull();
  });

  it("passes only a chain clear on all three checks, with issues composed in code", () => {
    expect(judgeVerdict(read())).toEqual({ pass: true, issues: [] });
    expect(judgeVerdict(read({ contradicts: 0.3, advances: 0.49, newCharacter: 0.5 })).issues).toHaveLength(3);
    expect(judgeVerdict(read({ contradicts: 0.29 })).pass).toBe(true);
  });

  it("picks the best passing chain, lowest index on a tie, none when nothing passes", () => {
    expect(pickChain([read({ advances: 0.6 }), read({ advances: 0.95 }), read({ contradicts: 0.8, advances: 1 })])).toBe(1);
    expect(pickChain([read(), read(), null])).toBe(0);
    expect(pickChain([read({ contradicts: 0.9 }), null])).toBeNull();
    expect(chainScore(read({ advances: 1, shape: 1, contradicts: 0, newCharacter: 0 }))).toBe(2);
    expect(chainScore(read({ shape: null, advances: 0.5, contradicts: 0, newCharacter: 0 }))).toBe(0.5);
  });

  it("asks the LLM for a strict A/B pick and parses only that", () => {
    const prompt = buildPickPrompt({ name: "The Gate", objective: "Reach it." }, [[{ objective: "Walk." }], [{ objective: "Run." }]]);
    expect(prompt).toContain("A:\n1. Walk.");
    expect(prompt).toContain("PICK: A or PICK: B");
    expect([parsePick("PICK: A"), parsePick("pick: b"), parsePick("Thinking...\nPICK: B"), parsePick("I pick A"), parsePick("PICK: C")]).toEqual([0, 1, 1, null, null]);
  });
});

describe("expansion judge calibration (real answers, production shape)", () => {
  const replay = (name: string) => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8")) as { model: string; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
    const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
  };
  const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8"));

  it("critic: K01-K10 (relabelled) + Phase A chains, every verdict right and each check at its floor", async () => {
    const data = fixture("critic.json") as { floors: Record<string, number>; rows: CriticCase[] };
    const scores = judgeFamilyScores(await runCriticCalibration(replay("critic.json"), data.rows), data.floors);
    expect(scores.filter((row) => !row.ok)).toEqual([]);
    expect(scores.find((row) => row.family === "verdict")).toMatchObject({ right: 34, total: 34 });
  });

  it("variants: code picks the clean chain and rejects every contradicting one", async () => {
    const data = fixture("variants.json") as { floors: Record<string, number>; rows: VariantStub[] };
    const scores = judgeFamilyScores(await runVariantCalibration(replay("variants.json"), data.rows), data.floors);
    expect(scores).toEqual([expect.objectContaining({ family: "pick", right: 8, total: 8 }), expect.objectContaining({ family: "rejected", right: 8, total: 8 })]);
  });
});
