import * as recorded from "../../test/fixtures/t3-3-facts.store.json";
import { buildMemoryInjection, nearDuplicateIds, type InjectionOptions } from "./inject";
import type { MemoryEntry, MemoryTier } from "./types";

type Row = { text: string; messageId: number; createdAt: number; importance: number };

const rows = (session: string, list: Row[]): MemoryEntry[] => list.map((row, index) => ({
  id: `${session}-${index}`,
  tier: "facts",
  text: row.text,
  type: "fact",
  importance: row.importance,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: row.text,
  createdAt: row.createdAt,
  messageId: row.messageId,
  recallCount: 0,
  provenance: { source: "extractor", messageId: row.messageId, boundary: row.createdAt, pass: "shared-read", validity: "live" },
}) as MemoryEntry);

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
const jaccard = (a: string, b: string) => {
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (left.size + right.size - shared);
};
const pairIndexes = (texts: string[]) =>
  texts.flatMap((a, i) => texts.map((b, j) => [i, j] as const).filter(([, j]) => j > i && jaccard(a, texts[j]) > 0.6));
const pairs = (texts: string[]) => pairIndexes(texts).map(([i, j]) => [texts[i], texts[j]] as const);

const options: InjectionOptions = {
  tokenBudgets: { facts: 4000, session_details: 600, short_term: 300, scene_history: 500 } as Record<MemoryTier, number>,
  scoreContext: { boundary: 30, lastMessageId: 41, turnText: "", turnEntities: [] },
};

describe.each([
  ["T3-3-2", recorded.t3_3_2 as Row[], 50, 28],
  ["T3-5-1", recorded.t3_5_1 as Row[], 41, 17],
])("%s: the store keeps its paraphrases, the injected facts block does not", (session, list, stored, storedPairs) => {
  const entries = rows(session, list);
  const injected = buildMemoryInjection(entries, null, options).blocks.facts.split("\n").filter(Boolean);

  it(`the store holds ${stored} live facts with ${storedPairs} near-duplicate pairs (word Jaccard > 0.6, the summary's measure)`, () => {
    expect(entries).toHaveLength(stored);
    expect(pairs(entries.map((entry) => entry.text))).toHaveLength(storedPairs);
  });

  it("every one of those pairs is held out at injection: the dedup marks one side of each", () => {
    const held = nearDuplicateIds(entries);
    for (const [i, j] of pairIndexes(entries.map((entry) => entry.text))) {
      expect({ a: entries[i].text, b: entries[j].text, held: held.has(entries[i].id) || held.has(entries[j].id) })
        .toEqual({ a: entries[i].text, b: entries[j].text, held: true });
    }
  });

  it("the injected block, with every row in budget, has no such pair left", () => {
    expect(injected.length).toBeLessThan(stored);
    expect(pairs(injected)).toEqual([]);
  });
});
