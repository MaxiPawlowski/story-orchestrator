import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDirectorCriticRequest, canonFacts, directorCriticVerdict, readDirectorCritic, type DirectorCriticRead } from "./livingCritic";
import { scoreDirectorCritic, type DirectorCriticCase } from "./livingCriticCalibration";
import { validateJudgeRequest } from "./questions";
import type { JudgeAnswer } from "./types";

const fixture = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge/director-critic.json"), "utf8")) as { floors: { playerActRecall: number; falseRefusalMax: number }; rows: DirectorCriticCase[] };
const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge/director-critic.json"), "utf8")) as { calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
const reads = new Map(fixture.rows.map((row) => {
  const request = buildDirectorCriticRequest(row.input);
  const answers = byRequest.get(JSON.stringify([request.state, request.questions]));
  return [row.id, answers ? readDirectorCritic(answers) : null] as const;
}));

const clean: DirectorCriticRead = { playerAct: 0.05, contradicts: 0.05, outcomeName: 0.05, newPerson: 0.05, followsThread: 0.9 };

describe("v3.0 43 P2: director critic judge questions", () => {
  it("asks the five nouls over a short state with the player in the cast", () => {
    const request = buildDirectorCriticRequest({ player: "Max", cast: ["Hask", "Max"], frontier: "\"The Ford\" — a crossing", facts: ["The bridge is gone."], threads: [], name: "Rising Water", objective: "The river rises." });
    expect(Object.keys(request.questions)).toEqual(["playerAct", "contradicts", "outcomeName", "newPerson", "followsThread"]);
    expect((request.state as { cast: string[] }).cast).toEqual(["Max", "Hask"]);
    expect(validateJudgeRequest(request)).toEqual([]);
  });

  it("decides in code, one composed issue per failing question, and refuses a partial answer", () => {
    expect(directorCriticVerdict(clean)).toEqual({ pass: true, issues: [] });
    expect(directorCriticVerdict({ playerAct: 0.5, contradicts: 0.5, outcomeName: 0.7, newPerson: 0.7, followsThread: 0.1 }).issues).toHaveLength(5);
    expect(directorCriticVerdict({ ...clean, playerAct: 0.49 }).pass).toBe(true);
    expect(readDirectorCritic({ playerAct: { type: "noul", noul: 0.2 } })).toBeNull();
  });

  it("reads canon lines as facts without headers or bullets", () => {
    expect(canonFacts("WHAT HAS HAPPENED:\n- The bridge washed away.\n2. Hask found a ford.\n\n")).toEqual(["The bridge washed away.", "Hask found a ford."]);
  });

  it("every fixture row has a recorded answer", () => {
    expect([...reads.entries()].filter(([, read]) => !read).map(([id]) => id)).toEqual([]);
  });

  it("floors on the labelled drafts: player-act recall >= 0.9, false refusals <= 0.15", () => {
    const score = scoreDirectorCritic(fixture.rows, reads);
    process.stdout.write(`${JSON.stringify(score)}\n`);
    expect(score.playerActRecall).toBeGreaterThanOrEqual(fixture.floors.playerActRecall);
    expect(score.falseRefusalRate).toBeLessThanOrEqual(fixture.floors.falseRefusalMax);
    expect(score).toMatchObject({ playerActCaught: 14, playerActTotal: 14, falseRefusals: 1, acceptTotal: 28 });
  });
});
