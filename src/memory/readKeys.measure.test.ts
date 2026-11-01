import { recallCandidates, recallMentions, selectRecall } from "./archiveRecall";
import { provenance } from "./provenance";
import { scoreTerms } from "./score";
import { EVICTED_ARCHIVE } from "./strength";
import type { MemoryEntry } from "./types";
import { probeArchiveRecall } from "../../test/support/memoryProbesRecall";
import { runProbeSession } from "../../test/support/memoryProbes";

const archived = (id: string, text: string, entities: string[], keys: string[] | undefined, at: number): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities, confidence: 1, activationTriggers: [], evidence: text,
  createdAt: at, messageId: at, recallCount: 0, foldedInto: EVICTED_ARCHIVE, ...(keys ? { keys } : {}),
  provenance: provenance({ source: "extractor", messageId: at, boundary: at, pass: "shared-read" }),
});

const CASES: Array<{ text: string; entities: string[]; keys: string[]; question: string }> = [
  { text: "Mira hid the brass compass behind the loose brick.", entities: ["Mira"], keys: ["compass", "navigation"], question: "Who still has the compass?" },
  { text: "Tobin buried his father's medal under the oak.", entities: ["Tobin"], keys: ["medal", "war decoration"], question: "Is the medal safe?" },
  { text: "Esk sold the grey mare to a drover at dawn.", entities: ["Esk"], keys: ["horse", "mare"], question: "What happened to the horse?" },
  { text: "The north bridge was cracked by the spring flood.", entities: ["north bridge"], keys: ["crossing", "flood damage"], question: "Can we use the crossing?" },
  { text: "Mira owes the ferryman three silver coins.", entities: ["Mira", "ferryman"], keys: ["debt", "fare"], question: "Do we still have a debt to settle?" },
  { text: "Tobin keeps a spare lantern in the boathouse.", entities: ["Tobin"], keys: ["lantern", "light"], question: "We need a light before dark." },
  { text: "Esk learned the miller's daughter is engaged.", entities: ["Esk"], keys: ["wedding", "engagement"], question: "When is the wedding?" },
  { text: "A wolf took two sheep from the high pasture.", entities: [], keys: ["wolf", "sheep"], question: "Has the wolf come back?" },
  { text: "Mira's sister left the village before the harvest.", entities: ["Mira"], keys: ["sister", "departure"], question: "Why did your sister go?" },
  { text: "The chapel bell rang at midnight with nobody near it.", entities: ["chapel"], keys: ["bell", "omen"], question: "Was that bell an omen?" },
];

const DISTRACTORS = [
  archived("d1", "Mira swept the bakery floor.", ["Mira"], ["broom"], 1),
  archived("d2", "Tobin argued with the smith about nails.", ["Tobin"], ["nails"], 2),
  archived("d3", "Esk counted sacks in the granary.", ["Esk"], ["sacks"], 3),
];

const hitAt4 = (withKeys: boolean) => {
  const rows = CASES.map((entry, index) => archived(`c${index}`, entry.text, entry.entities, withKeys ? entry.keys : undefined, 10 + index));
  const pool = [...rows, ...DISTRACTORS];
  const hits = CASES.filter((entry, index) => {
    const candidates = recallCandidates(pool, entry.question);
    const lines = selectRecall(candidates, [], { boundary: 40, turnText: entry.question, turnEntities: recallMentions(pool, entry.question) });
    return lines.some((line) => line.entryId === `c${index}`);
  }).length;
  return hits / CASES.length;
};

describe("v3.0 43 M2: write-time retrieval keys", () => {
  test("F-M2a: a question that names only a key finds the row through archive recall (hit@4 >= 0.8 and above no keys)", () => {
    const before = hitAt4(false);
    const after = hitAt4(true);
    process.stdout.write(`${JSON.stringify({ keyedRecallHitAt4: { before, after, cases: CASES.length } })}\n`);
    expect(after).toBeGreaterThanOrEqual(0.8);
    expect(after).toBeGreaterThan(before);
  });

  test("a named key counts like a trigger in the score; an unnamed or 2-letter key does not", () => {
    const row = archived("k", "Tobin keeps a spare lantern in the boathouse.", ["Tobin"], ["light", "ox"], 1);
    const term = (text: string) => scoreTerms(row, { boundary: 5, turnText: text, turnEntities: [] }).activation;
    expect([term("we need a light"), term("lights out"), term("an ox cart")]).toEqual([1, 0, 0]);
  });

  test("F-M2b: a held-secret row with keys is never recalled for anyone through the resting view", async () => {
    let recalled = "";
    await runProbeSession({
      boundaries: 14,
      after: (session, boundary) => {
        if (boundary !== 13) return;
        const memory = session.memory();
        const keyed = { ...memory, entries: memory.entries.map((entry) => (/forged|poisoned|bribed|stole/.test(entry.text) || entry.id === memory.entries.find((row) => row.tier === "facts" && !/forged|poisoned|bribed|stole/.test(row.text))?.id
          ? { ...entry, foldedInto: EVICTED_ARCHIVE, keys: ["harbour tally"] } : entry)) };
        recalled = probeArchiveRecall(keyed, [{ mes: "Mira, what about the harbour tally?", is_user: true }], boundary, (entries) => session.coordinator.injector.restingEntries(entries));
      },
    });
    expect(recalled).toContain("Recalled from earlier:");
    expect(recalled).not.toMatch(/forged|poisoned|bribed|stole/);
  }, 60000);
});
