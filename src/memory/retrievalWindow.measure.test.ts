import { readFileSync } from "node:fs";
import { join } from "node:path";
import { windowQuery } from "@runtime/scoreContext";
import { scoreAll, type ScoreContext } from "./score";
import type { MemoryEntry } from "./types";

interface FixtureRow { id: string; text: string; entities: string[]; createdAt: number }
interface FixtureCase { id: string; subset: "callback" | "paraphrase" | "distractor"; gold: string; rows: FixtureRow[]; window: string[] }
interface Fixture { cast: string[]; boundary: number; pool: FixtureRow[]; cases: FixtureCase[] }

const fixture: Fixture = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/retrieval-window.json"), "utf8"));

const entry = (row: FixtureRow): MemoryEntry => ({
  id: row.id, tier: "facts", text: row.text, type: "fact", importance: 2, expiration: "permanent", entities: row.entities, confidence: 1, activationTriggers: [],
  evidence: "", createdAt: row.createdAt, messageId: row.createdAt, recallCount: 0, provenance: { source: "extractor", validity: "live" } as MemoryEntry["provenance"],
});

const rankOf = (entries: MemoryEntry[], context: ScoreContext, gold: string): number => {
  const scores = scoreAll(entries, context);
  const order = entries.map((item, index) => ({ id: item.id, index, score: scores.get(item.id) ?? 0 })).sort((a, b) => b.score - a.score || a.index - b.index);
  return order.findIndex((item) => item.id === gold) + 1;
};

const contexts = (item: FixtureCase): { before: ScoreContext; after: ScoreContext } => {
  const last = item.window[item.window.length - 1];
  const before: ScoreContext = { boundary: fixture.boundary, lastMessageId: item.window.length - 1, turnText: last, turnEntities: fixture.cast.filter((name) => last.toLowerCase().includes(name.toLowerCase())) };
  return { before, after: { ...before, ...windowQuery(item.window.map((mes) => ({ mes })), fixture.cast, fixture.cast) } };
};

export function measureRetrievalWindow() {
  const rows = fixture.cases.map((item) => {
    const entries = [...fixture.pool, ...item.rows].map(entry);
    const { before, after } = contexts(item);
    return { id: item.id, subset: item.subset, before: rankOf(entries, before, item.gold), after: rankOf(entries, after, item.gold) };
  });
  const subsets = ["callback", "paraphrase", "distractor"] as const;
  const rate = (ranks: number[], cut: number) => ranks.filter((rank) => rank <= cut).length / Math.max(1, ranks.length);
  return {
    rows,
    subsets: Object.fromEntries(subsets.map((subset) => {
      const picked = rows.filter((row) => row.subset === subset);
      return [subset, {
        cases: picked.length,
        before: { hitAt1: rate(picked.map((row) => row.before), 1), hitAt4: rate(picked.map((row) => row.before), 4) },
        after: { hitAt1: rate(picked.map((row) => row.after), 1), hitAt4: rate(picked.map((row) => row.after), 4) },
      }];
    })),
  };
}

describe("v3.0 41 B4: window/paraphrase/distractor retrieval set (floors in plan 41 §F-B4, informational)", () => {
  it("scores every case before (last line) and after (window query), and prints the subset rates", () => {
    const result = measureRetrievalWindow();
    process.stdout.write(`${JSON.stringify(result.subsets)}\n`);
    expect(result.rows).toHaveLength(18);
    expect(result.rows.every((row) => row.before >= 1 && row.after >= 1)).toBe(true);
  });
});
