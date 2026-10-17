import { armB, armE } from "./e0Ranking";
import { buildE0Pool, e0Collection, e0Query, e0StubProvider, e0StubSimilarity, readE0Chat, readE0Labels, type E0ChatRow, type E0VectorProvider } from "./e0Pool";

const chat = (count: number): E0ChatRow[] => Array.from({ length: count }, (_, id) => ({ id, name: id % 2 ? "Tobin" : "Wren", isUser: id % 2 === 0, text: `message number ${id}` }));

const label = (overrides: Record<string, unknown> = {}) => ({ id: "q1", session: "s1", askMessageId: 20, asker: "Wren", text: "what did tobin say", gold: [3], review: null, ...overrides });

const labels = (source: string, questions: unknown[]) => ({ format: "so-e0-labels/1", source, questions });

describe("E0 labels (review rule)", () => {
  it("drops a private label the two models disagree on, and refuses one without two different models", () => {
    const review = (writer: string, checker: string, agreed: boolean) => ({ writer, checker, agreed });
    const read = readE0Labels(labels("private", [
      label({ id: "ok", review: review("sol", "deepseek", true) }),
      label({ id: "split", review: review("sol", "deepseek", false) }),
      label({ id: "same", review: review("sol", "sol", true) }),
      label({ id: "none" }),
    ]));
    expect(read.questions.map((entry) => entry.id)).toEqual(["ok"]);
    expect(read.dropped.disagreed).toBe(1);
    expect(read.dropped.invalid.map((entry) => entry.id)).toEqual(["same", "none"]);
  });

  it("refuses gold at or after the asking turn, gold counts outside 1-2, duplicates and an unknown format", () => {
    const read = readE0Labels(labels("synthetic", [label({ gold: [20] }), label({ id: "q2", gold: [] }), label({ id: "q3", gold: [1, 2, 3] }), label({ id: "q4", gold: [1, 2] }), label({ id: "q4" })]));
    expect(read.questions.map((entry) => entry.id)).toEqual(["q4"]);
    expect(read.dropped.invalid.map((entry) => entry.reason)).toEqual(["gold at or after the asking turn", "gold holds 0 ids, 1-2 allowed", "gold holds 3 ids, 1-2 allowed", "duplicate id"]);
    expect(() => readE0Labels({ format: "x", source: "synthetic", questions: [] })).toThrow(/format/);
  });
});

describe("E0 pool", () => {
  it("collection: before the asking turn, hidden and empty rows skipped, last 5 protected", () => {
    const rows = chat(20).map((row) => (row.id === 4 ? { ...row, isSystem: true } : row.id === 6 ? { ...row, text: " " } : row));
    expect(e0Collection(rows, 15).map((item) => item.id)).toEqual([0, 1, 2, 3, 5, 7, 8, 9]);
  });

  it("query: the message before the asking turn, then the question", () => {
    expect(e0Query(chat(20), readE0Labels(labels("synthetic", [label()])).questions[0])).toBe("message number 19\nwhat did tobin say");
  });

  it("reads chat rows by shape and skips malformed ones", () => {
    expect(readE0Chat([{ id: 0, name: "A", isUser: true, text: "hi" }, { id: "x" }, null])).toEqual([{ id: 0, name: "A", isUser: true, isSystem: false, text: "hi" }]);
  });

  it("builds an 8-id pool in provider order with band membership, refusing short collections and missing chats", async () => {
    const calls: Array<[number, number]> = [];
    const provider: E0VectorProvider = {
      id: "recorded",
      query: async (collection, _text, topK, threshold) => {
        calls.push([topK, threshold]);
        const ids = [...collection].reverse().map((item) => item.id);
        return threshold >= 0.7 ? ids.slice(0, 1) : threshold >= 0.4 ? ids.slice(0, 3) : ids.slice(0, topK);
      },
    };
    const read = readE0Labels(labels("synthetic", [label(), label({ id: "short", askMessageId: 10, gold: [1] }), label({ id: "lost", session: "s2" })]));
    const pool = await buildE0Pool(read, new Map([["s1", chat(30)]]), provider);
    expect(pool.questions).toHaveLength(1);
    expect(pool.refused).toEqual([{ id: "short", reason: "collection holds 5 messages, under 8" }, { id: "lost", reason: "no chat for session s2" }]);
    const [built] = pool.questions;
    expect(built.candidates.map((entry) => entry.messageId)).toEqual([14, 13, 12, 11, 10, 9, 8, 7]);
    expect(built.candidates.map((entry) => entry.bands)).toEqual([[0.82, 0.7, 0.55, 0.4], [0.55, 0.4], [0.55, 0.4], [], [], [], [], []]);
    expect(calls).toEqual([[8, 0], [8, 0.82], [8, 0.7], [8, 0.55], [8, 0.4]]);
  });

  it("records query latencies only when the provider times every query", async () => {
    const timedProvider = (untimed: number | null): E0VectorProvider => ({
      id: "timed",
      query: async (collection, _text, topK, threshold) => {
        const ids = [...collection].reverse().map((item) => item.id).slice(0, threshold > 0 ? 2 : topK);
        return threshold === untimed ? ids : { ids, latencyMs: 10 + Math.round(threshold * 100) };
      },
    });
    const read = readE0Labels(labels("synthetic", [label()]));
    const [full] = (await buildE0Pool(read, new Map([["s1", chat(30)]]), timedProvider(null))).questions;
    expect(full.latencyMs).toEqual({ pool: 10, bands: { "0.82": 92, "0.7": 80, "0.55": 65, "0.4": 50 } });
    expect(armB(full).latencyMs).toBe(10 + 92 + 80 + 65 + 50);
    expect(armE(full).latencyMs).toBe(10);
    const [partial] = (await buildE0Pool(read, new Map([["s1", chat(30)]]), timedProvider(0.55))).questions;
    expect(partial.latencyMs).toBeUndefined();
    expect(armE(partial).latencyMs).toBeNull();
  });

  it("stub provider: deterministic trigram cosine, threshold filter, score then id order", async () => {
    expect(e0StubSimilarity("the iron gate key", "the iron gate key")).toBeCloseTo(1);
    expect(e0StubSimilarity("", "anything")).toBe(0);
    const collection = [{ id: 1, text: "wolves hunt in threes" }, { id: 2, text: "the gate key is mended" }, { id: 3, text: "the gate key is mended" }];
    expect(await e0StubProvider.query(collection, "gate key mended", 2, 0)).toEqual([2, 3]);
    expect(await e0StubProvider.query(collection, "gate key mended", 8, 0.99)).toEqual([]);
  });
});
