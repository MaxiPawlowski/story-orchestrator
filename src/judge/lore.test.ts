import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCuratorFilterRequest, curatorFilterKeep, runCuratorFilterCalibration, type CuratorFilterCase } from "./curatorFilter";
import { buildLoreRequests, loreCandidates, loreChunks, loreKey, loreTopK, pickLore, readLore, type LoreEntry } from "./lore";
import { resolveLoreCases, runLoreCalibration, type LoreCalibrationFixture } from "./loreCalibration";
import { LORE_CONTENT_CHARS } from "./policy";
import { estimateJudgeTotalTokens, validateJudgeRequest } from "./questions";
import { JUDGE_MAX_ESTIMATED_TOTAL_TOKENS } from "./types";
import { judgeFamilyScores } from "./selfTest";
import type { JudgeAnswer, JudgeRequest } from "./types";

const entry = (uid: number, patch: Partial<LoreEntry> = {}): LoreEntry => ({ world: "Story Lore", uid, comment: `Entry ${uid}`, content: `Content ${uid}`, ...patch });
const scene = { checkpointName: "The Guild", objective: "Sign up.", window: [{ speaker: "Max", text: "Who is the receptionist?" }] };

describe("lore-select core (v2.2 plan 04)", () => {
  it("keeps only scoped, enabled, non-constant entries with content", () => {
    const entries = [entry(1), entry(2, { disable: true }), entry(3, { constant: true }), entry(4, { world: "Other Book" }), entry(5, { content: "  " })];
    expect(loreCandidates(entries, ["Story Lore"]).map((item) => item.uid)).toEqual([1]);
    expect(loreCandidates(entries, [])).toEqual([]);
  });

  it("asks one question per entry over one scene state, clipped at 600 chars, in one request while it fits", () => {
    const many = Array.from({ length: 66 }, (_, index) => entry(index, { content: "x".repeat(LORE_CONTENT_CHARS + 50) }));
    const chunks = buildLoreRequests(many, scene);
    expect(chunks.map((chunk) => chunk.entries.length)).toEqual([66]);
    expect(chunks[0].request.state).toEqual({ scene: { name: "The Guild", goal: "Sign up." }, transcript: [{ id: "msg_1", speaker: "Max", text: "Who is the receptionist?" }] });
    expect(chunks[0].request.questions["e:65"].instructions).toContain('Entry "Entry 65"');
    expect(chunks[0].request.questions["e:0"].instructions).toContain(`${"x".repeat(LORE_CONTENT_CHARS)}…`);
    chunks.forEach((chunk) => expect(validateJudgeRequest(chunk.request)).toEqual([]));
  });

  it("F16: 263 lore-sized candidates take two even requests inside TypeSafe's whole-request limit, not five of 64", () => {
    const window = Array.from({ length: 12 }, (_, index) => ({ speaker: index % 2 ? "Guide" : "Max", text: "y".repeat(400) }));
    const many = Array.from({ length: 263 }, (_, index) => entry(index, { comment: `Entry ${index} of the realm`, content: "x".repeat(LORE_CONTENT_CHARS + 50) }));
    const chunks = buildLoreRequests(many, { ...scene, window });
    expect(chunks).toHaveLength(2);
    expect(Math.abs(chunks[0].entries.length - chunks[1].entries.length)).toBeLessThanOrEqual(1);
    expect(chunks.flatMap((chunk) => chunk.entries.map((item) => item.uid))).toEqual(many.map((item) => item.uid));
    chunks.forEach((chunk) => {
      expect(validateJudgeRequest(chunk.request)).toEqual([]);
      expect(estimateJudgeTotalTokens(chunk.request)).toBeLessThanOrEqual(JUDGE_MAX_ESTIMATED_TOTAL_TOKENS);
      expect(Object.keys(chunk.request.questions)).toEqual(chunk.entries.map((_, index) => `e:${index}`));
    });
    expect(buildLoreRequests(many, { ...scene, window }, 20_000).length).toBeGreaterThan(2);
  });

  it("packs to the limit and splits evenly only when that takes no extra request", () => {
    expect(loreChunks([5, 5, 5, 5, 5], 100)).toEqual([[0, 1, 2, 3, 4]]);
    expect(loreChunks([4, 4, 4, 4, 4], 12)).toEqual([[0, 1, 2], [3, 4]]);
    expect(loreChunks([3, 3, 3, 3], 9)).toEqual([[0, 1], [2, 3]]);
    expect(loreChunks([50, 1], 10)).toEqual([[0], [1]]);
    expect(loreChunks([], 10)).toEqual([]);
  });

  it("picks by p over the floor, capped at top_k (default 4, max 12)", () => {
    const answers: Record<string, JudgeAnswer> = { "e:0": { type: "noul", noul: 0.9 }, "e:1": { type: "noul", noul: 0.55 }, "e:2": { type: "noul", noul: 0.7 }, "e:3": { type: "noul", noul: 0.95 } };
    const scored = readLore(answers, [entry(1), entry(2), entry(3), entry(4), entry(5)]);
    expect(scored).toHaveLength(4);
    expect(pickLore(scored, {}).map((pick) => pick.entry.uid)).toEqual([4, 1, 3]);
    expect(pickLore(scored, { topK: 2 }).map((pick) => pick.entry.uid)).toEqual([4, 1]);
    expect(pickLore(scored, { minP: 0.5 }).map((pick) => pick.entry.uid)).toEqual([4, 1, 3, 2]);
    expect([loreTopK({}), loreTopK({ topK: 40 }), loreTopK({ topK: 0 })]).toEqual([4, 12, 1]);
    expect(loreKey(entry(7))).toBe("Story Lore.7");
  });
});

describe("curator pre-filter core (v2.2 plan 04)", () => {
  const entries = Array.from({ length: 14 }, (_, index) => ({ title: `E${index}`, content: "c", enabled: index !== 3 }));
  const answers = Object.fromEntries(entries.map((_, index) => [`entry:${index}`, { type: "noul" as const, noul: index % 2 ? 0.1 : 0.9 }]));

  it("drops only switched-on entries under the cut, and never narrows a small scope", () => {
    const keep = curatorFilterKeep(answers, entries);
    expect(keep.filter(Boolean)).toHaveLength(8);
    expect(keep[3]).toBe(true);
    expect(keep[1]).toBe(false);
    expect(curatorFilterKeep(answers, entries.slice(0, 12)).every(Boolean)).toBe(true);
    expect(curatorFilterKeep(null, entries).every(Boolean)).toBe(true);
  });

  it("keeps an entry the judge did not answer", () => {
    const partial = { ...answers };
    delete partial["entry:1"];
    expect(curatorFilterKeep(partial, entries)[1]).toBe(true);
  });

  it("uses the Phase A state shape and question", () => {
    const request = buildCuratorFilterRequest({ checkpoint: { name: "Gate", objective: "Enter" }, canon: "c".repeat(1300), openThreads: ["t"], entries: entries.slice(0, 1) });
    expect(request.state).toMatchObject({ checkpoint: { name: "Gate", objective: "Enter" }, open_threads: ["t"], entries: [{ title: "E0", switched_on: true, content: "c" }] });
    expect(String((request.state as { canon: string }).canon).length).toBe(1201);
    expect(request.questions["entry:0"].instructions).toContain("made it newly needed");
    expect(validateJudgeRequest(request)).toEqual([]);
  });
});

describe("lore calibration (real answers, production shape)", () => {
  const replay = (name: string) => {
    const golden = JSON.parse(readFileSync(join(process.cwd(), "test/goldens/judge", name), "utf8")) as { model: string; calls: Array<{ state: unknown; questions: unknown; answers: Record<string, JudgeAnswer> }> };
    const byQuestion = new Map(golden.calls.flatMap((call) => Object.entries(call.questions as Record<string, unknown>).map(([id, question]) => [JSON.stringify([call.state, question]), call.answers[id]] as const)));
    return async (request: JudgeRequest) => {
      const answers = Object.entries(request.questions).map(([id, question]) => [id, byQuestion.get(JSON.stringify([request.state, question]))] as const);
      return { answers: answers.every(([, answer]) => answer) ? Object.fromEntries(answers) as Record<string, JudgeAnswer> : null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: answers.length, cached: false };
    };
  };
  const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8"));

  it("Adolion (64 entries, keys avoided) + spike scenes: recall and precision at their floors", async () => {
    const data = fixture("lore.json") as LoreCalibrationFixture & { floors: Record<string, number> };
    const report = await runLoreCalibration(replay("lore.json"), resolveLoreCases(data));
    expect(judgeFamilyScores(report, data.floors).map((row) => [row.family, row.ok])).toEqual([["recall", true], ["precision", true]]);
    expect(report.rows.some((row) => row.id.endsWith(".precision:SO-J11 Adolion World.1"))).toBe(false);
  });

  it("held-out windows (66 entries, recorded as two calls of 64 + 2, replayed per question as one): recall and precision at their floors", async () => {
    const data = fixture("lore-holdout.json") as LoreCalibrationFixture & { floors: Record<string, number> };
    const report = await runLoreCalibration(replay("lore-holdout.json"), resolveLoreCases(data));
    expect(judgeFamilyScores(report, data.floors).every((row) => row.ok)).toBe(true);
  });

  it("curator pre-filter: every entry that needs attention still reaches the curator", async () => {
    const data = fixture("curator-filter.json") as { floors: Record<string, number>; rows: CuratorFilterCase[] };
    const report = await runCuratorFilterCalibration(replay("curator-filter.json"), data.rows);
    const recall = judgeFamilyScores(report, data.floors).find((row) => row.family === "recall");
    expect(recall).toMatchObject({ right: 10, total: 10 });
  });
});
