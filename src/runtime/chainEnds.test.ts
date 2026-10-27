import { CHAIN_END_LIMIT, recordChainEnd, rewindChainEnds, sanitizeChainEnds, type ChainEnd } from "./chainEnds";

const end = (messageId: number, reason: ChainEnd["reason"] = "cap"): ChainEnd => ({ messageId, revision: null, checkpointId: "cp", voices: 1, reason });

describe("v3.0 19 stage 3: chain-end records follow the messages they ended on", () => {
  const ends = [end(2), end(5, "yield"), end(8, "judge")];

  it("a delete drops the end it removed and shifts later ones; a swipe or edit keeps the end on that message only", () => {
    expect(rewindChainEnds(ends, 5, { kind: "delete" })).toEqual([end(2), end(7, "judge")]);
    expect(rewindChainEnds(ends, 4, { kind: "delete", removed: 2 })).toEqual([end(2), end(6, "judge")]);
    expect(rewindChainEnds(ends, 5, { kind: "swipe" })).toEqual([end(2), end(5, "yield")]);
    expect(rewindChainEnds(ends, 5, { kind: "edit" })).toEqual([end(2), end(5, "yield")]);
  });

  it("an eventless change drops everything at or after it", () => {
    expect(rewindChainEnds(ends, 5)).toEqual([end(2)]);
  });

  it("is capped and sanitized on load", () => {
    const many = Array.from({ length: CHAIN_END_LIMIT + 5 }, (_, at) => end(at)).reduce<ChainEnd[]>((list, row) => recordChainEnd(list, row), []);
    expect(many).toHaveLength(CHAIN_END_LIMIT);
    expect(many[0].messageId).toBe(5);
    expect(sanitizeChainEnds([end(1), { ...end(2), reason: "bored" }, { messageId: "x" }, null])).toEqual([end(1)]);
  });
});
