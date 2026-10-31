import { windowQuery } from "@runtime/scoreContext";
import { evidenceAge, recencyWeights, scoreAll, scoreEntry, scoreTerms, type ScoreContext } from "./score";
import type { MemoryEntry } from "./types";

const row = (id: string, text: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "",
  createdAt: 0, messageId: 0, recallCount: 0, provenance: { source: "extractor", validity: "live" } as MemoryEntry["provenance"], ...extra,
});

describe("v3.0 41 B4: recency-weighted window query", () => {
  it("weights rise with recency and sum to one", () => {
    const weights = recencyWeights(4);
    expect(weights).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(recencyWeights(1)).toEqual([1]);
  });

  it("the window takes the last four spoken rows, newest heaviest, the cast and the names in the window", () => {
    const rows = [
      { mes: "old line about the mill" }, { mes: "Mara saw the wolves", is_system: false }, { mes: "system note", is_system: true },
      { mes: "Kael laughed" }, { mes: "We need the ferry" }, { mes: "Where is the ferryman?" },
    ];
    const query = windowQuery(rows, ["Mara", "Kael", "Odo"], ["Odo"]);
    expect(query.queryParts?.map((part) => part.text)).toEqual(["Mara saw the wolves", "Kael laughed", "We need the ferry", "Where is the ferryman?"]);
    expect(query.queryParts?.at(-1)?.weight).toBeCloseTo(0.4);
    expect([...(query.turnEntities ?? [])].sort()).toEqual(["Kael", "Mara", "Odo"]);
    expect(query.evidence?.rows[0]).toEqual({ text: "Where is the ferryman?", age: 0 });
    expect(query.normalise).toBe(true);
  });

  it("a row named two messages back still scores on the window, not on the last line alone", () => {
    const entry = row("w", "the wolves came down from the ridge at night");
    const base: ScoreContext = { boundary: 5, turnText: "Where is the ferryman?", turnEntities: [] };
    const windowed: ScoreContext = { ...base, queryParts: [{ text: "the wolves came down from the ridge", weight: 0.3 }, { text: "Where is the ferryman?", weight: 0.7 }] };
    expect(scoreTerms(entry, windowed).semanticSimilarity).toBeGreaterThan(scoreTerms(entry, base).semanticSimilarity * 2);
  });
});

describe("v3.0 41 B4: recency from the last transcript mention, never from an injection", () => {
  it("evidence age is the newest row naming a topical entity, a trigger or restating the row; cast names do not count", () => {
    const entry = row("e", "Odo owes the smith three crowns", { entities: ["Odo", "smith"] });
    const evidence = { rows: [{ text: "Mara nods.", age: 0 }, { text: "The smith is angry.", age: 3 }], cast: ["Mara", "Odo"] };
    expect(evidenceAge(entry, evidence)).toBe(3);
    expect(evidenceAge(entry, { rows: [{ text: "Odo waves.", age: 1 }], cast: ["Mara", "Odo"] })).toBeNull();
  });

  it("a recent mention makes an old row recent", () => {
    const entry = row("e", "Odo owes the smith three crowns", { entities: ["smith"], createdAt: 0 });
    const old: ScoreContext = { boundary: 60, turnText: "", turnEntities: [] };
    const mentioned: ScoreContext = { ...old, evidence: { rows: [{ text: "Talk to the smith.", age: 1 }], cast: [] } };
    expect(scoreTerms(entry, mentioned).recency).toBeGreaterThan(scoreTerms(entry, old).recency);
  });

  it("useRecency counts from the last use stamp", () => {
    const entry = row("u", "x", { createdAt: 0, usedAt: [{ messageId: 58, boundary: 58 }] });
    const context: ScoreContext = { boundary: 60, turnText: "", turnEntities: [] };
    expect(scoreTerms(entry, { ...context, useRecency: true }).recency).toBeGreaterThan(scoreTerms(entry, context).recency);
  });
});

describe("v3.0 41 B4: min-max normalised score terms", () => {
  it("without normalise scoreAll equals scoreEntry", () => {
    const entries = [row("a", "the ferry is late"), row("b", "the mill burned", { importance: 3 })];
    const context: ScoreContext = { boundary: 3, turnText: "the ferry", turnEntities: [] };
    const scores = scoreAll(entries, context);
    entries.forEach((entry) => expect(scores.get(entry.id)).toBeCloseTo(scoreEntry(entry, context)));
  });

  it("normalised, a small Jaccard edge is no longer dwarfed by a constant-scale term", () => {
    const relevant = row("rel", "the ferryman wants silver for the crossing", { createdAt: 0 });
    const loud = row("loud", "the king is dead", { createdAt: 11 });
    const context: ScoreContext = { boundary: 12, turnText: "how much silver does the ferryman want", turnEntities: [] };
    const raw = scoreAll([relevant, loud], context);
    const scaled = scoreAll([relevant, loud], { ...context, normalise: true });
    expect((raw.get("loud") ?? 0) > (raw.get("rel") ?? 0)).toBe(true);
    expect((scaled.get("rel") ?? 0) > (scaled.get("loud") ?? 0)).toBe(true);
  });
});
