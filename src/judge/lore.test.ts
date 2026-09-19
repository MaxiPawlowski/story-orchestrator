import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCuratorFilterRequest, curatorFilterKeep, runCuratorFilterCalibration, type CuratorFilterCase } from "./curatorFilter";
import { buildLoreRequests, loreCandidates, loreKey, loreTopK, pickLore, readLore, type LoreEntry } from "./lore";
import { resolveLoreCases, runLoreCalibration, type LoreCalibrationFixture } from "./loreCalibration";
import { LORE_CHUNK, LORE_CONTENT_CHARS } from "./policy";
import { validateJudgeRequest } from "./questions";
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

  it("asks one question per entry over one scene state, chunked at 64 and clipped at 600 chars", () => {
    const many = Array.from({ length: LORE_CHUNK + 2 }, (_, index) => entry(index, { content: "x".repeat(LORE_CONTENT_CHARS + 50) }));
    const chunks = buildLoreRequests(many, scene);
    expect(chunks.map((chunk) => chunk.entries.length)).toEqual([LORE_CHUNK, 2]);
    expect(chunks[0].request.state).toEqual({ scene: { name: "The Guild", goal: "Sign up." }, transcript: [{ id: "msg_1", speaker: "Max", text: "Who is the receptionist?" }] });
    expect(chunks[1].request.questions["e:1"].instructions).toContain(`Entry "Entry ${LORE_CHUNK + 1}"`);
    expect(chunks[0].request.questions["e:0"].instructions).toContain(`${"x".repeat(LORE_CONTENT_CHARS)}…`);
    chunks.forEach((chunk) => expect(validateJudgeRequest(chunk.request)).toEqual([]));
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
    const byRequest = new Map(golden.calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
    return async (request: JudgeRequest) => ({ answers: byRequest.get(JSON.stringify([request.state, request.questions])) ?? null, model: golden.model, latencyMs: 0, stateChars: 0, questionCount: Object.keys(request.questions).length, cached: false });
  };
  const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/judge", name), "utf8"));

  it("Adolion (64 entries, keys avoided) + spike scenes: recall and precision at their floors", async () => {
    const data = fixture("lore.json") as LoreCalibrationFixture & { floors: Record<string, number> };
    const report = await runLoreCalibration(replay("lore.json"), resolveLoreCases(data));
    expect(judgeFamilyScores(report, data.floors).map((row) => [row.family, row.ok])).toEqual([["recall", true], ["precision", true]]);
    expect(report.rows.some((row) => row.id.endsWith(".precision:SO-J11 Adolion World.1"))).toBe(false);
  });

  it("held-out windows (66 entries, two calls each): recall and precision at their floors", async () => {
    const data = fixture("lore-holdout.json") as LoreCalibrationFixture & { floors: Record<string, number> };
    const report = await runLoreCalibration(replay("lore-holdout.json"), resolveLoreCases(data));
    expect(judgeFamilyScores(report, data.floors).every((row) => row.ok)).toBe(true);
  });

  it("curator pre-filter: every entry that needs attention still reaches the curator", async () => {
    const data = fixture("curator-filter.json") as { floors: Record<string, number>; rows: CuratorFilterCase[] };
    const report = await runCuratorFilterCalibration(replay("curator-filter.json"), data.rows);
    const recall = judgeFamilyScores(report, data.floors).find((row) => row.family === "recall");
    expect(recall).toMatchObject({ right: 13, total: 13 });
  });
});
