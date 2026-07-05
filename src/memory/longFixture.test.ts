import { selectWithinBudget } from "./budget";
import { applyConsolidation, buildJaccardMatchSets, consolidateTier } from "./consolidate";
import { scoreEntry } from "./score";
import { createMemoryState } from "./stores";
import { markContradicted } from "./supersede";
import { generateMemoryId, type MemoryEntry, type MemoryStoreState } from "./types";

const NAMES = ["Mara", "Kael", "Bran", "Elara", "Doran", "Sela", "Tomas"];

const mk = (text: string, createdAt: number, over: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: generateMemoryId(),
  tier: "facts",
  text,
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: text,
  createdAt,
  messageId: createdAt,
  recallCount: 0,
  tokens: Math.ceil(text.length / 4),
  ...over,
});

// Each fact carries a globally unique token. The keyword-overlap fallback cannot
// disambiguate facts that share a state phrase across subjects (that is exactly what
// embeddings, not jaccard, are for), so the fixture keeps facts lexically disjoint and
// emits state-changes last so a supersession is the final word on a fact.
function buildCorpus(): { entries: MemoryEntry[]; bases: Array<{ name: string; token: string }> } {
  const bases: Array<{ name: string; token: string }> = [];
  let uid = 0;
  for (const name of NAMES) {
    for (let f = 0; f < 6; f += 1) {
      bases.push({ name, token: `detail${uid}` });
      uid += 1;
    }
  }
  const entries: MemoryEntry[] = [];
  let turn = 0;
  for (let round = 0; round < 3; round += 1) {
    bases.forEach((base, index) => {
      turn += 1;
      entries.push(mk(`${base.name} ${base.token}`, turn, { entities: [base.name] }));
      if (round > 0 && index % 4 === 0) {
        turn += 1;
        entries.push(mk(`${base.name} ${base.token}`, turn, { entities: [base.name] })); // exact duplicate
      }
    });
  }
  bases.forEach((base, index) => {
    if (index % 5 !== 0) return;
    turn += 1;
    entries.push(mk(`${base.name} no longer ${base.token}`, turn, { entities: [base.name] })); // state change, emitted last
  });
  return { entries, bases };
}

function consolidate(state: MemoryStoreState): MemoryStoreState {
  const active = state.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto);
  const result = consolidateTier(active, buildJaccardMatchSets(active));
  return markContradicted(applyConsolidation(state, result), result.uncertain);
}

describe("long-fixture memory hygiene replay", () => {
  const corpus = buildCorpus().entries;

  it("accumulates a large corpus (>100 entries) before hygiene", () => {
    expect(corpus.length).toBeGreaterThan(100);
  });

  it("leaves no duplicate live facts after consolidation", () => {
    const state = consolidate({ ...createMemoryState(), entries: corpus });
    const texts = state.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto).map((entry) => entry.text.trim().toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("retires superseded facts with a resolvable link and drops them from the live set", () => {
    const state = consolidate({ ...createMemoryState(), entries: corpus });
    const retired = state.entries.filter((entry) => entry.supersededBy);
    expect(retired.length).toBeGreaterThan(0);
    for (const entry of retired) {
      expect(state.entries.some((candidate) => candidate.id === entry.supersededBy)).toBe(true);
    }
  });

  it("leaves no live fact that a later state-change superseded", () => {
    const state = consolidate({ ...createMemoryState(), entries: corpus });
    const live = state.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto);
    const offenders = live
      .filter((entry) => entry.text.includes(" no longer "))
      .map((entry) => entry.text.replace(" no longer ", " "))
      .filter((base) => live.some((other) => other.text === base));
    expect(offenders).toEqual([]);
  });

  it("keeps injection within the tier token budget", () => {
    const state = consolidate({ ...createMemoryState(), entries: corpus });
    const budget = 400;
    const context = { boundary: 200, turnText: "Mara detail0", turnEntities: ["Mara"], lastMessageId: 200 };
    const live = state.entries.filter((entry) => entry.tier === "facts" && !entry.supersededBy && !entry.foldedInto);
    const { kept } = selectWithinBudget(live, budget, (entry) => scoreEntry(entry, context), 1);
    const injected = live.filter((entry) => kept.has(entry.id));
    const cost = injected.reduce((sum, entry) => sum + (entry.tokens ?? 0), 0);
    expect(cost).toBeLessThanOrEqual(budget);
    expect(injected.length).toBeGreaterThan(0);
  });
});
