import * as recorded from "../../test/fixtures/t2-2-facts.block.json";
import { buildMemoryInjection, labelMemoryBlock, type InjectionOptions } from "./inject";
import type { MemoryEntry, MemoryTier } from "./types";

const RECORDED_ROWS = 26;
const RECORDED_BLOCK_CHARS = 2959;
const NAMED_SECOND = /named Natalia|Natalia will stand/;

const rows = (texts: string[]): MemoryEntry[] => texts.map((text, index) => ({
  id: `t2-2-${index}`,
  tier: "facts",
  text,
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: text,
  createdAt: index + 1,
  messageId: index + 1,
  recallCount: 0,
  provenance: { source: "extractor", messageId: index + 1, boundary: index + 1, pass: "shared-read", validity: "live" },
}) as MemoryEntry);

const options: InjectionOptions = {
  tokenBudgets: { facts: 800, session_details: 600, short_term: 300, scene_history: 500 } as Record<MemoryTier, number>,
  scoreContext: { boundary: 21, lastMessageId: 35, turnText: "", turnEntities: [] },
};

describe("T2-2: the [Established facts] block carries no paraphrased repeats (payloads.jsonl:226)", () => {
  const texts = [...recorded.rows];
  const injection = buildMemoryInjection(rows(texts), null, options);
  const lines = injection.blocks.facts.split("\n");

  it("starts from the recorded block: 26 rows, 2,959 chars, Natalia named the Crown's second five times", () => {
    expect(texts).toHaveLength(RECORDED_ROWS);
    expect(texts.join("\n")).toHaveLength(RECORDED_BLOCK_CHARS);
    expect(texts.filter((text) => NAMED_SECOND.test(text))).toHaveLength(5);
  });

  it("keeps two of the five Crown's-second paraphrases, the newest first", () => {
    expect(lines.filter((line) => NAMED_SECOND.test(line))).toHaveLength(2);
    expect(lines).toContain(texts[texts.length - 1]);
  });

  it("holds out the paraphrases and keeps the distinct rows that share their subject", () => {
    expect(Object.values(injection.fates).filter((fate) => fate === "near-duplicate")).toHaveLength(6);
    expect(lines.some((line) => line.startsWith("Max refused Javon's order to duel Leevon"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Natalia believes Javon wants her dead"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Max told Natalia that the old well"))).toBe(true);
  });

  it("ends at 20 rows, under 85 % of the recorded size", () => {
    expect(lines).toHaveLength(20);
    expect(labelMemoryBlock("facts", injection.blocks.facts).length).toBeLessThan(RECORDED_BLOCK_CHARS * 0.85);
  });
});
