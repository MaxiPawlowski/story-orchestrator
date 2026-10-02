import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createJudgeHarness } from "../runtime/judgeHarness";
import type { JudgeRuntime } from "../runtime/judge";
import type { JudgeRequest, JudgeResult } from "./types";

const ROOT = join(__dirname, "..", "..");
const fixture = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf-8"));
const judgeFixture = (name: string) => fixture(`test/fixtures/judge/${name.replace(/.json$/, "")}.json`);

const USES: Array<{ use: string; fixture: string; rows: () => unknown[]; floors: () => Record<string, number> }> = [
  ...["director", "memory-verify", "memory-pairs", "scene", "curator-filter", "continuity", "typed", "stall", "critic", "variants", "agency", "house-rules", "warden-lore"].map((use) => ({
    use, fixture: use, rows: () => judgeFixture(use).rows, floors: () => judgeFixture(use).floors ?? {},
  })),
  { use: "continuity", fixture: "continuity-combined", rows: () => judgeFixture("continuity-combined").rows, floors: () => judgeFixture("continuity-combined").floors ?? {} },
  { use: "house-rules", fixture: "adolion-house-rules", rows: () => judgeFixture("adolion-house-rules").rows, floors: () => judgeFixture("adolion-house-rules").floors ?? {} },
  { use: "warden-lore-facts", fixture: "warden-lore", rows: () => judgeFixture("warden-lore").rows, floors: () => judgeFixture("warden-lore").floors ?? {} },
  {
    use: "lore", fixture: "lore",
    rows: () => { const f = judgeFixture("lore"); return f.rows.map((row: { candidates?: unknown[]; pool?: string }) => ({ ...row, candidates: row.candidates ?? f.pools?.[row.pool ?? ""] ?? [] })); },
    floors: () => judgeFixture("lore").floors ?? {},
  },
  {
    use: "backgrounds", fixture: "backgrounds",
    rows: () => { const f = judgeFixture("backgrounds"); return f.rows.map((row: object) => ({ ...row, installed: f.installed })); },
    floors: () => judgeFixture("backgrounds").floors ?? {},
  },
  {
    use: "contradiction-release", fixture: "contradiction-release (K0)",
    rows: () => fixture("test/fixtures/memory/contradictions.json").rows.map(({ id, lang, label, established, claim }: Record<string, unknown>) => ({ id, lang, label, established, claim })),
    floors: () => ({}),
  },
];

const FAMILY_USES = new Set(["scene", "lore", "curator-filter", "continuity", "backgrounds", "typed", "stall", "critic", "variants", "agency", "house-rules", "warden-lore", "warden-lore-facts"]);

const familyScores = (rows: Array<{ id: string; right: boolean }>, floors: Record<string, number>) =>
  Object.entries(floors).flatMap(([family, floor]) => {
    const own = rows.filter((row) => row.id.slice(row.id.indexOf(".") + 1).split(":")[0] === family);
    if (!own.length) return [];
    const right = own.filter((row) => row.right).length;
    return [{ family, right, total: own.length, floor, ok: right / own.length >= floor }];
  });

const offRuntime = (seen: JudgeRequest[]) => ({
  probe: (request: JudgeRequest): Promise<JudgeResult> => {
    seen.push(request);
    return Promise.resolve({ answers: null, model: null, latencyMs: 0, stateChars: JSON.stringify(request.state).length, questionCount: Object.keys(request.questions).length, fallback: "disabled", cached: false });
  },
}) as unknown as JudgeRuntime;

describe("v2.6 plan 12 Phase B: judge-off column and call census", () => {
  it("scores every calibration fixture with no judgment and counts the calls each provider would make", async () => {
    const results = [];
    for (const entry of USES) {
      const seen: JudgeRequest[] = [];
      const harness = createJudgeHarness(offRuntime(seen));
      const report = await harness.calibrate(entry.use, entry.rows());
      const families = FAMILY_USES.has(entry.use) ? familyScores(report.rows, entry.floors()) : [];
      const questions = seen.reduce((sum, request) => sum + Object.keys(request.questions).length, 0);
      expect(report.rows.every((row) => row.fallback === "disabled" || row.fallback === undefined)).toBe(true);
      results.push({
        use: entry.use, fixture: entry.fixture, cases: entry.rows().length, scoredRows: report.total, offRight: report.right,
        offRate: report.total ? Number((report.right / report.total).toFixed(4)) : null, families,
        calls: { typesafe: seen.length, llamaLogprob: questions },
        stateCharsMax: Math.max(0, ...seen.map((request) => JSON.stringify(request.state).length)),
      });
    }
    const seenRelevance: JudgeRequest[] = [];
    const relevanceFixture = judgeFixture("lore-relevance");
    const pools = { ...(relevanceFixture.pools ?? {}), ...(relevanceFixture.poolsFrom ? judgeFixture(relevanceFixture.poolsFrom).pools ?? {} : {}) };
    const relevanceRows = relevanceFixture.rows.map((row: { candidates?: unknown[]; pool?: string }) => ({ ...row, candidates: row.candidates ?? pools[row.pool ?? ""] ?? [] }));
    const relevance = await createJudgeHarness(offRuntime(seenRelevance)).calibrateLoreRelevance(relevanceRows);
    results.push({
      use: "lore-relevance", fixture: "lore-relevance", cases: relevanceRows.length, floor: relevanceFixture.floor ?? null,
      arms: [relevance.noul, relevance.score].map((arm) => ({ arm: arm.arm, precisionAt4: arm.precisionAt4, ndcgAt4: arm.ndcgAt4, tieRate: arm.tieRate })),
      calls: { typesafe: seenRelevance.length, llamaLogprob: seenRelevance.reduce((sum, request) => sum + Object.keys(request.questions).length, 0) },
      stateCharsMax: Math.max(0, ...seenRelevance.map((request) => JSON.stringify(request.state).length)),
    });
    expect(results.length).toBe(USES.length + 1);
    const out = process.env.SO_MEASURE_OUT;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify({ measuredAt: new Date().toISOString(), arm: "judge-off (no answer: every probe returns fallback 'disabled')", note: "offRate is what each use's scorer counts right with no judgment; for chooser uses (director, scene, lore, typed, backgrounds) the real fallback is another component (LLM director, heuristic, keyword scan, extractor) and is measured by its own suite, not here", results }, null, 2)}\n`);
    }
  });
});
