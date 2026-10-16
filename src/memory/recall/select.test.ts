import { candidate, ctxFor, message, PLAYER, read, ROSTER, witnessOf } from "../../../test/support/recallKit";
import type { RecallCandidate } from "./eligibility";
import type { RecallMessage } from "./live";
import { RECALL_POOL_SIZE, RECALL_TOKEN_CAP, recallTokens, selectRecall } from "./select";

const aside = (id: number) => message(id, "Tamsin", `Tamsin leans close to Corvin and murmurs, "Forbidden line number ${id} stays between us."`);
const open = (id: number, words = "") => message(id, "Corvin", `Corvin nods. "Open line number ${id} is for everyone${words}."`);

const CHAT: RecallMessage[] = [...Array.from({ length: 8 }, (_, id) => aside(id)), ...Array.from({ length: 6 }, (_, offset) => open(8 + offset))];
const WITNESS = witnessOf([read("r1", 0, 13, CHAT.map((entry) => `WITNESS m=${entry.messageId} heard=${entry.messageId < 8 ? "tamsin,corvin" : "all-present"}`))], CHAT);
const quoteOf = (entry: RecallMessage) => entry.text.slice(entry.text.indexOf('"') + 1, -1);
const pool = (chat: RecallMessage[] = CHAT): RecallCandidate[] => chat.map((entry) => candidate(chat, entry.messageId, quoteOf(entry)));
const options = { roster: ROSTER, playerName: PLAYER };

describe("plan 43: filter before top-k (VR2k), cap, no refill", () => {
  it("8 forbidden top hits never starve the eligible lower hits", () => {
    const selection = selectRecall(pool(), ctxFor("hollis", CHAT, WITNESS), options);
    expect(selection.lines.map((line) => line.candidate.source.messageId)).toEqual([8, 9, 10, 11]);
    expect(selection.refused.filter((refusal) => refusal.stage === "eligibility")).toHaveLength(8);
    expect(selection.considered).toBe(14);
  });

  it("never refills from ineligible candidates when fewer than 4 survive", () => {
    const short = pool().filter((entry) => entry.source.messageId < 10);
    const selection = selectRecall(short, ctxFor("hollis", CHAT, WITNESS), options);
    expect(selection.lines.map((line) => line.candidate.source.messageId)).toEqual([8, 9]);
  });

  it("the ranker sees the eligible set only, after the filter", () => {
    const seen: number[][] = [];
    const selection = selectRecall(pool(), ctxFor("hollis", CHAT, WITNESS), {
      ...options, rank: (eligible) => {
        seen.push(eligible.map((entry) => entry.source.messageId));
        return [...eligible].reverse();
      },
    });
    expect(seen).toEqual([[8, 9, 10, 11, 12, 13]]);
    expect(selection.lines.map((line) => line.candidate.source.messageId)).toEqual([13, 12, 11, 10]);
  });

  it("a ranker returning something outside the eligible set cannot add it", () => {
    const forbidden = pool()[0];
    const selection = selectRecall(pool(), ctxFor("hollis", CHAT, WITNESS), { ...options, rank: (eligible) => [forbidden, ...eligible] });
    expect(selection.lines.some((line) => line.candidate === forbidden)).toBe(false);
  });

  it("only the first 32 pooled candidates are considered", () => {
    const filler = Array.from({ length: RECALL_POOL_SIZE }, () => pool()[0]);
    const selection = selectRecall([...filler, pool()[8]], ctxFor("hollis", CHAT, WITNESS), options);
    expect(selection.considered).toBe(RECALL_POOL_SIZE);
    expect(selection.lines).toEqual([]);
  });

  it("keeps the block within 250 tokens (chars / 4), skipping a line that would overflow", () => {
    const long = ` and ${"the road is long and the night is cold ".repeat(12).trim()}`;
    const chat = [open(20, long), open(21), open(22, long), open(23)];
    const witness = witnessOf([read("r", 20, 23, chat.map((entry) => `WITNESS m=${entry.messageId} heard=all-present`))], chat);
    const selection = selectRecall(pool(chat), ctxFor("hollis", chat, witness), options);
    expect(selection.tokens).toBeLessThanOrEqual(RECALL_TOKEN_CAP);
    expect(selection.tokens).toBe(recallTokens(selection.block));
    expect(selection.lines.map((line) => line.candidate.source.messageId)).toEqual([20, 21, 23]);
  });

  it("dedups identical rendered lines", () => {
    const twice = [pool()[8], pool()[8], pool()[9]];
    expect(selectRecall(twice, ctxFor("hollis", CHAT, WITNESS), options).lines).toHaveLength(2);
  });
});
