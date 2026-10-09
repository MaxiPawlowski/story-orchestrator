import { parseStoryV2OrThrow, type BlackboardSnapshot, type StoryV2 } from "@engine/index";
import { deriveScopeExplained, deriveScopeWithSources } from "./scope";
import { fitScopeBudget, SCOPE_EXTRA_BUDGET, scopeSlots } from "./scopeBudget";
import { CARD_SOURCE, QUEST_SCOPE_CAP, QUEST_SOURCE, readScopeSource, readScopeSources, RELATIONSHIP_SOURCE, REL_AXES_PER_READ, SCOPE_SOURCES, type ScopeSource } from "./scopeSources";

const empty: BlackboardSnapshot = { values: {}, versions: {}, latched: {} };
const MEMBERS = Array.from({ length: 7 }, (_, at) => `m${at + 1}`);
const QUESTS = 4;

const castStory = (quests = QUESTS): StoryV2 => ({
  format: 2, title: "Combined scope", description: "Synthetic 7-member cast with side quests, relationships and card fields.",
  roster: MEMBERS.map((id, at) => ({
    id, name: id.toUpperCase(), role: `member ${at + 1}`,
    card: { fields: { hair: { quality: `hair_${id}`, visual: true } } },
    relationships: [
      { toward: "player", axes: ["trust", "fear"], range: [-3, 3] },
      { toward: MEMBERS[(at + 1) % MEMBERS.length], axes: ["respect"], range: [-3, 3] },
    ],
  })),
  qualities: [
    ...MEMBERS.map((id) => ({ key: `hair_${id}`, type: "string" as const, source: "extractor" as const, rubric: `Current public hair of ${id}.` })),
    ...Array.from({ length: quests }, (_, at) => ({ key: `k${at}`, type: "bool" as const, source: "extractor" as const, rubric: `Quest ${at} done.` })),
  ],
  checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "Go." }, { id: "b", name: "B", type: "anchor", objective: "Stop." }],
  transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "rel_m1_player_trust", op: ">=", v: 2 } }],
  quests: Array.from({ length: quests }, (_, at) => ({ id: `q${at}`, title: `Quest ${at}`, kind: "side" as const, steps: [], done_when: { q: `k${at}`, op: "==" as const, v: true } })),
} as unknown as StoryV2);

const STORY = parseStoryV2OrThrow(castStory());
const context = (rotation: number, drafted = "m1") => ({ present: [...MEMBERS], drafted, rotation });
const scopeKeys = (rotation: number, sources: readonly ScopeSource[] = SCOPE_SOURCES) =>
  deriveScopeExplained(STORY, "a", empty, [], context(rotation), sources).map((entry) => entry.key);
const baselineKeys = (rotation: number) => scopeKeys(rotation, [CARD_SOURCE, { ...QUEST_SOURCE, cap: 0 }, { ...RELATIONSHIP_SOURCE, cap: 0 }]);
const questKeys = Array.from({ length: QUESTS }, (_, at) => `k${at}`);
const draftedKeys = ["rel_m1_player_fear", "rel_m1_m2_respect"];
const isOtherAxis = (key: string) => key.startsWith("rel_") && !key.startsWith("rel_m1_");

describe("fitScopeBudget (pure)", () => {
  it("fills tiers in order, free keys cost nothing, and the last tier takes what is left", () => {
    const fit = fitScopeBudget({ free: new Set(["g"]), slots: 3, tiers: [{ keys: ["q1", "g"] }, { keys: ["d1", "d2"] }, { keys: ["c1", "c2"] }] });
    expect(fit.kept).toEqual([["q1", "g"], ["d1", "d2"], []]);
    expect(fit.dropped).toEqual([[], [], ["c1", "c2"]]);
    expect(fit.used).toBe(3);
  });

  it("a key an earlier tier paid for is kept again for free", () => {
    const fit = fitScopeBudget({ free: new Set(), slots: 1, tiers: [{ keys: ["a"] }, { keys: ["a", "b"] }] });
    expect(fit.kept).toEqual([["a"], ["a"]]);
    expect(fit.dropped).toEqual([[], ["b"]]);
  });

  it("a tier cap bounds what the tier may pay for", () => {
    expect(fitScopeBudget({ free: new Set(), slots: 5, tiers: [{ keys: ["a", "b", "c"], cap: 2 }, { keys: ["d"] }] }).kept).toEqual([["a", "b"], ["d"]]);
  });

  it("a rotating tier lets every key in within ceil(n / room) reads", () => {
    const keys = ["a", "b", "c", "d", "e"];
    const seen = Array.from({ length: 3 }, (_, rotation) => fitScopeBudget({ free: new Set(), slots: 2, rotation, tiers: [{ keys, rotate: true }] }).kept[0]);
    expect(new Set(seen.flat())).toEqual(new Set(keys));
  });

  it("control: a fixed tier never rotates, so its tail never gets in", () => {
    const keys = ["a", "b", "c", "d", "e"];
    const seen = Array.from({ length: 5 }, (_, rotation) => fitScopeBudget({ free: new Set(), slots: 2, rotation, tiers: [{ keys }] }).kept[0]);
    expect(new Set(seen.flat())).toEqual(new Set(["a", "b"]));
  });

  it("slots are the baseline's own cost plus the extra budget", () => {
    expect(scopeSlots(new Set(["c1"]), ["c1", "c2", "c3"])).toBe(2 + SCOPE_EXTRA_BUDGET);
  });
});

describe("S-17 combined scope budget: 7-member cast, 4 active quests, relationships and card pulls in the same read", () => {
  it("the fixture exercises every source past the budget (else the rest proves nothing)", () => {
    const raw = SCOPE_SOURCES.map((source) => ({ kind: source.kind, ...readScopeSource(source, STORY, empty, context(0)) }));
    expect(raw.find((read) => read.kind === "quest")?.keys).toEqual(questKeys);
    expect(raw.find((read) => read.kind === "card")?.keys).toHaveLength(MEMBERS.length);
    expect(raw.find((read) => read.kind === "relationship")?.keys).toHaveLength(REL_AXES_PER_READ);
  });

  it("a read adds at most SCOPE_EXTRA_BUDGET keys over the baseline arm (quest and relationship sources at 0)", () => {
    for (let rotation = 0; rotation < 12; rotation += 1) {
      expect(scopeKeys(rotation).length - baselineKeys(rotation).length).toBeLessThanOrEqual(SCOPE_EXTRA_BUDGET);
    }
  });

  it("control: the per-source caps alone overrun the budget, which is the S-17 red", () => {
    const perSource = new Set(baselineKeys(0));
    for (const source of SCOPE_SOURCES) readScopeSource(source, STORY, empty, context(0)).keys.forEach((key) => perSource.add(key));
    expect(perSource.size - baselineKeys(0).length).toBeGreaterThan(SCOPE_EXTRA_BUDGET);
  });

  it("no active quest is ever left out of scope", () => {
    for (let rotation = 0; rotation < 12; rotation += 1) expect(scopeKeys(rotation)).toEqual(expect.arrayContaining(questKeys));
  });

  it("the quest cap fits inside the extra budget, so the budget can never cut a quest the quest source kept", () => {
    expect(QUEST_SCOPE_CAP).toBeLessThanOrEqual(SCOPE_EXTRA_BUDGET);
  });

  it("keeps the order: gate keys, active quests, the drafted member's axes, others' axes, card pulls", () => {
    const reads = readScopeSources(SCOPE_SOURCES, STORY, empty, context(0), new Set(["rel_m1_player_trust"]));
    const relationship = reads.find((read) => read.kind === "relationship");
    const card = reads.find((read) => read.kind === "card");
    expect(relationship?.keys).toEqual(expect.arrayContaining(["rel_m1_player_trust", ...draftedKeys]));
    const others = Math.min(REL_AXES_PER_READ - 1 - draftedKeys.length, SCOPE_EXTRA_BUDGET + MEMBERS.length - QUESTS - draftedKeys.length);
    expect(relationship?.keys.filter(isOtherAxis)).toHaveLength(others);
    expect(card?.keys).toEqual(["hair_m1", "hair_m2", "hair_m3", "hair_m4", "hair_m5", "hair_m6", "hair_m7"].slice(0, SCOPE_EXTRA_BUDGET + MEMBERS.length - QUESTS - draftedKeys.length - others));
    expect(card?.dropped.length).toBeGreaterThan(0);
  });

  it("more active quests than the quest cap take turns, so none is left out for more than 3 reads", () => {
    const crowded = parseStoryV2OrThrow(castStory(QUEST_SCOPE_CAP + 3));
    const all = Array.from({ length: QUEST_SCOPE_CAP + 3 }, (_, at) => `k${at}`);
    const lastSeen = new Map<string, number>();
    let worst = 0;
    for (let rotation = 0; rotation < 12; rotation += 1) {
      const kept = deriveScopeExplained(crowded, "a", empty, [], context(rotation)).map((entry) => entry.key).filter((key) => all.includes(key));
      expect(kept).toHaveLength(QUEST_SCOPE_CAP);
      for (const key of kept) {
        worst = Math.max(worst, rotation - (lastSeen.get(key) ?? -1) - 1);
        lastSeen.set(key, rotation);
      }
    }
    expect(all.every((key) => lastSeen.has(key))).toBe(true);
    expect(worst).toBeLessThanOrEqual(3);
  });

  it("the gate key stays in scope however tight the budget", () => {
    for (let rotation = 0; rotation < 4; rotation += 1) expect(scopeKeys(rotation)).toContain("rel_m1_player_trust");
  });

  it("others' axes rotate, so each present pair is read within 3 reads of the last", () => {
    const candidates = new Set(MEMBERS.slice(1).flatMap((id, at) => [`rel_${id}_player_trust`, `rel_${id}_player_fear`, `rel_${id}_${MEMBERS[(at + 2) % MEMBERS.length]}_respect`]));
    const lastSeen = new Map<string, number>();
    let worst = 0;
    for (let rotation = 0; rotation < 24; rotation += 1) {
      const kept = new Set(scopeKeys(rotation).filter(isOtherAxis));
      for (const key of candidates) {
        if (kept.has(key)) {
          worst = Math.max(worst, rotation - (lastSeen.get(key) ?? -1) - 1);
          lastSeen.set(key, rotation);
        }
      }
    }
    expect([...candidates].every((key) => lastSeen.has(key))).toBe(true);
    expect(worst).toBeLessThanOrEqual(3);
  });

  it("with fewer game keys the leftover slots go back to card pulls", () => {
    const small = parseStoryV2OrThrow({ ...castStory(1), roster: castStory(1).roster.map((member, at) => (at === 0 ? { ...member, relationships: [{ toward: "player", axes: ["trust"], range: [-3, 3] }] } : { id: member.id, name: member.name, role: member.role, card: member.card })) } as unknown as StoryV2);
    const reads = readScopeSources(SCOPE_SOURCES, small, empty, context(0), new Set());
    expect(reads.find((read) => read.kind === "card")?.keys).toHaveLength(MEMBERS.length);
  });

  it("the sources the scope reports are the ones the read carries", () => {
    const { scope, sources } = deriveScopeWithSources(STORY, "a", empty, [], context(3));
    const carried = new Set(scope.map((entry) => entry.key));
    for (const read of sources) {
      read.keys.forEach((key) => expect(carried.has(key)).toBe(true));
      read.dropped.forEach((key) => expect(carried.has(key)).toBe(false));
    }
  });
});

describe("payload invariance: a story with no quests and no relationships reads what it read before the budget", () => {
  it("card pulls alone are never cut", () => {
    const cards = parseStoryV2OrThrow({ ...castStory(0), quests: undefined, transitions: [], roster: castStory(0).roster.map((member) => ({ id: member.id, name: member.name, role: member.role, card: member.card })) } as unknown as StoryV2);
    const reads = readScopeSources(SCOPE_SOURCES, cards, empty, context(0));
    expect(reads).toEqual(SCOPE_SOURCES.map((source) => ({ kind: source.kind, cap: source.cap, ...readScopeSource(source, cards, empty, context(0)) })));
    expect(reads.find((read) => read.kind === "card")?.keys).toHaveLength(MEMBERS.length);
  });
});
