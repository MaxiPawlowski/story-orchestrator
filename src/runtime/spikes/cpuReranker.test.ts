import { readFileSync } from "fs";
import { join } from "path";
import { contentWords, wordSimilarity } from "@memory/words";
import { runArm } from "@memory/e0Score";
import type { E0PoolQuestion } from "@memory/e0Ranking";
import { rankingMetrics } from "@judge/loreRanking";
import {
  RERANK_DOCS_MAX, RERANK_FLOORS, RERANK_MODEL_ASK, createRerankClient, parseRerankResponse, recordRerank, rerankBody, rerankE0Arm, rerankLoreTurns, rerankUrl,
  type FetchLike, type RecordedRerank,
} from "./cpuReranker";

const questions = JSON.parse(readFileSync(join(__dirname, "../../../test/measurements/v2.8/21-e0/synthetic.pool.json"), "utf8")).questions as E0PoolQuestion[];

const standIn: FetchLike = async (_url, init) => {
  const body = JSON.parse(init.body) as { query: string; documents: string[] };
  const query = contentWords(body.query);
  return { ok: true, status: 200, json: async () => ({ results: body.documents.map((document, index) => ({ index, relevance_score: wordSimilarity(query, contentWords(document)) })) }) };
};

describe("spike cpuReranker: llama.cpp --reranking plumbing and offline arm stubs (no model downloaded)", () => {
  it("builds the /v1/rerank request: one path whatever the endpoint ends with, capped docs and doc length", () => {
    expect(rerankUrl("http://127.0.0.1:8097/")).toBe("http://127.0.0.1:8097/v1/rerank");
    expect(rerankUrl("http://127.0.0.1:8097/v1")).toBe("http://127.0.0.1:8097/v1/rerank");
    const body = rerankBody("q", Array.from({ length: 40 }, () => "x".repeat(3000)), "m");
    expect(body.documents).toHaveLength(RERANK_DOCS_MAX);
    expect(body.documents[0]).toHaveLength(2000);
    expect(body).toMatchObject({ model: "m", query: "q", top_n: RERANK_DOCS_MAX });
  });

  it("parses llama.cpp's results, sorts by score, refuses a malformed or out-of-range answer", () => {
    expect(parseRerankResponse({ results: [{ index: 1, relevance_score: 0.2 }, { index: 0, relevance_score: 0.9 }] }, 2)).toEqual([{ index: 0, score: 0.9 }, { index: 1, score: 0.2 }]);
    expect(parseRerankResponse({ results: [{ index: 5, relevance_score: 1 }] }, 2)).toBeNull();
    expect(parseRerankResponse({ data: [] }, 2)).toBeNull();
  });

  it("the client answers a typed result: no endpoint, http, shape, network and timeout are reasons, never throws", async () => {
    expect(await createRerankClient({ endpoint: null, fetch: standIn })("q", ["a"])).toEqual({ ok: false, reason: "no-endpoint" });
    expect(await createRerankClient({ endpoint: "http://x", fetch: standIn })("q", [])).toEqual({ ok: false, reason: "empty" });
    expect(await createRerankClient({ endpoint: "http://x", fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) })("q", ["a"])).toEqual({ ok: false, reason: "http", detail: "503" });
    expect(await createRerankClient({ endpoint: "http://x", fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) })("q", ["a"])).toEqual({ ok: false, reason: "shape" });
    expect(await createRerankClient({ endpoint: "http://x", fetch: async () => { throw new Error("refused"); } })("q", ["a"])).toEqual({ ok: false, reason: "network", detail: "refused" });
    const hang: FetchLike = (_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await createRerankClient({ endpoint: "http://x", fetch: hang, timeoutMs: 5 })("q", ["a"])).toEqual({ ok: false, reason: "timeout" });
    const ok = await createRerankClient({ endpoint: "http://x", fetch: standIn, now: () => 0 })("silver ring", ["a ring of silver", "bread"]);
    expect(ok).toEqual({ ok: true, scores: [{ index: 0, score: expect.any(Number) }, { index: 1, score: 0 }], latencyMs: 0 });
  });

  it("E0 arm: owed until recorded scores exist; a recording replays through the E0 scorer (stand-in lexical scores prove the plumbing)", async () => {
    expect(rerankE0Arm(questions, undefined).owed).toMatch(/download OK/);
    const client = createRerankClient({ endpoint: "http://stand-in", fetch: standIn, now: () => 0 });
    const { recorded, failures } = await recordRerank(client, questions.map((question) => ({ id: question.id, query: question.query, documents: question.candidates.map((candidate) => candidate.text) })));
    expect(failures).toEqual([]);
    const arm = rerankE0Arm(questions, recorded);
    const c = runArm("c", questions).metrics;
    process.stdout.write(`cpuReranker stand-in (lexical, not a model): ${JSON.stringify({ questions: arm.metrics?.questions, hitAt4: arm.metrics?.hitAt4, armC: c?.hitAt4, floors: RERANK_FLOORS, ask: RERANK_MODEL_ASK })}\n`);
    expect(arm.metrics?.questions).toBe(questions.length);
    expect(arm.metrics?.callsPerQuestion).toBe(1);
    const short: RecordedRerank = { [questions[0]?.id as string]: { scores: [1], latencyMs: 1 } };
    expect(rerankE0Arm(questions, short).owed).toMatch(/missing or short/);
  });

  it("lore arm: recorded scores become ranked turns for the lore precision@4 metric", () => {
    const turns = rerankLoreTurns([{ id: "t1", query: "the bell", candidates: [{ key: "a", text: "bell" }, { key: "b", text: "bread" }, { key: "c", text: "tower" }], labels: { a: "needed", b: "irrelevant", c: "useful" } }], { t1: { scores: [0.9, 0.1, 0.5], latencyMs: 3 } });
    expect(turns[0]?.ranked.map((pick) => pick.key)).toEqual(["a", "c", "b"]);
    expect(rankingMetrics(turns).precisionAt4).toBeCloseTo(2 / 3, 4);
    expect(rerankLoreTurns([{ id: "t2", query: "q", candidates: [{ key: "a", text: "a" }], labels: {} }], {})).toEqual([]);
  });
});
