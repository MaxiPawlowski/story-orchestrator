import { parseStoryV2OrThrow, type BlackboardSnapshot, type StoryV2 } from "@engine/index";
import { deriveScopeExplained, deriveScopeWithSources, scopeOverflow } from "./scope";
import { fitScopeBudget, rotated, SCOPE_EXTRA_TOKENS, scopeSlots } from "./scopeBudget";
import {
  CARD_MIN_SHARE, CARD_SOURCE, QUEST_SCOPE_CAP, QUEST_SOURCE, questionCost, readScopeSource, readScopeSources, RELATIONSHIP_SOURCE, REL_AXES_PER_READ, REL_ROTATION_READS,
  SCOPE_SOURCES, STEP_READ_COST, type ScopeSource,
} from "./scopeSources";

const empty: BlackboardSnapshot = { values: {}, versions: {}, latched: {} };
const MEMBERS = Array.from({ length: 7 }, (_, at) => `m${at + 1}`);
const QUESTS = 4;
const HAIR_RULE = "Write a short factual value only when the scene confirms it. A suggestion, question, hypothetical, intention or an unconfirmed attempt changes nothing. "
  + "Keep the previous established value when the scene does not show a change.";

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
    ...MEMBERS.map((id) => ({ key: `hair_${id}`, type: "string" as const, source: "extractor" as const, rubric: `Current public hair of ${id}. ${HAIR_RULE}` })),
    ...Array.from({ length: quests }, (_, at) => ({ key: `k${at}`, type: "bool" as const, source: "extractor" as const, rubric: `Quest ${at} done.` })),
  ],
  checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "Go." }, { id: "b", name: "B", type: "anchor", objective: "Stop." }],
  transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "rel_m1_player_trust", op: ">=", v: 2 } }],
  quests: Array.from({ length: quests }, (_, at) => ({ id: `q${at}`, title: `Quest ${at}`, kind: "side" as const, steps: [], done_when: { q: `k${at}`, op: "==" as const, v: true } })),
} as unknown as StoryV2);

const STORY = parseStoryV2OrThrow(castStory());
const COST = questionCost(STORY);
const context = (rotation: number, drafted = "m1") => ({ present: [...MEMBERS], drafted, rotation });
const scopeKeys = (rotation: number, sources: readonly ScopeSource[] = SCOPE_SOURCES, drafted = "m1") =>
  deriveScopeExplained(STORY, "a", empty, [], context(rotation, drafted), sources).map((entry) => entry.key);
const baselineKeys = (rotation: number) => scopeKeys(rotation, [CARD_SOURCE, { ...QUEST_SOURCE, cap: 0 }, { ...RELATIONSHIP_SOURCE, cap: 0 }]);
const questKeys = Array.from({ length: QUESTS }, (_, at) => `k${at}`);
const draftedKeys = ["rel_m1_player_fear", "rel_m1_m2_respect"];
const isOtherAxis = (key: string) => key.startsWith("rel_") && !key.startsWith("rel_m1_");
const pairOf = (key: string) => key.replace(/_[a-z]+$/, "");
const added = (rotation: number) => {
  const base = new Set(baselineKeys(rotation));
  const combined = new Set(scopeKeys(rotation));
  const paid = [...combined].filter((key) => !base.has(key)).reduce((sum, key) => sum + COST(key), 0);
  const saved = [...base].filter((key) => !combined.has(key)).reduce((sum, key) => sum + COST(key), 0);
  return paid + ([...combined].some((key) => key.startsWith("rel_") && !base.has(key)) && ![...base].some((key) => key.startsWith("rel_")) ? STEP_READ_COST : 0) - saved;
};

describe("fitScopeBudget (pure)", () => {
  const unit = (...keys: string[]) => keys;

  it("fills tiers in order, free keys cost nothing, a unit that does not fit is skipped and a smaller one after it still gets in", () => {
    const cost = (key: string) => (key === "big" ? 5 : 1);
    const fit = fitScopeBudget({ free: new Set(["g"]), slots: 3, cost, tiers: [{ units: [unit("q1"), unit("g")] }, { units: [unit("big"), unit("d1")] }, { units: [unit("c1"), unit("c2")] }] });
    expect(fit.kept).toEqual([["q1", "g"], ["d1"], ["c1"]]);
    expect(fit.dropped).toEqual([[], ["big"], ["c2"]]);
    expect(fit.used).toBe(3);
  });

  it("a key an earlier tier paid for is kept again for free", () => {
    const fit = fitScopeBudget({ free: new Set(), slots: 1, tiers: [{ units: [unit("a")] }, { units: [unit("a"), unit("b")] }] });
    expect(fit.kept).toEqual([["a"], ["a"]]);
    expect(fit.dropped).toEqual([[], ["b"]]);
  });

  it("a group cap bounds the keys every tier of the group pays for together", () => {
    const fit = fitScopeBudget({ free: new Set(), slots: 9, caps: { rel: 3 }, tiers: [{ units: [unit("a", "b")], group: "rel" }, { units: [unit("c", "d"), unit("e")], group: "rel" }, { units: [unit("f")] }] });
    expect(fit.kept).toEqual([["a", "b"], ["e"], ["f"]]);
  });

  it("a unit (one pair's axes) is paid whole or not at all", () => {
    const fit = fitScopeBudget({ free: new Set(), slots: 3, tiers: [{ units: [unit("a"), unit("b", "c", "d")] }] });
    expect(fit.kept).toEqual([["a"]]);
    expect(fit.dropped).toEqual([["b", "c", "d"]]);
  });

  it("a shared cost (the direction rule) is paid once, and not at all when a free key already carries it", () => {
    const shared = [{ keys: new Set(["r1", "r2", "r3"]), cost: 2 }];
    expect(fitScopeBudget({ free: new Set(), slots: 5, shared, tiers: [{ units: [unit("r1"), unit("r2"), unit("r3")] }] }).kept).toEqual([["r1", "r2", "r3"]]);
    expect(fitScopeBudget({ free: new Set(), slots: 4, shared, tiers: [{ units: [unit("r1"), unit("r2"), unit("r3")] }] }).kept).toEqual([["r1", "r2"]]);
    expect(fitScopeBudget({ free: new Set(["r1"]), slots: 2, shared, tiers: [{ units: [unit("r2"), unit("r3")] }] }).kept).toEqual([["r2", "r3"]]);
  });

  it("slots are the baseline's own cost plus the extra token budget", () => {
    const cost = (key: string) => key.length;
    expect(scopeSlots(new Set(["c1"]), ["c1", "c22", "c333"], cost)).toBe(3 + 4 + SCOPE_EXTRA_TOKENS);
  });

  it("rotated starts the list at the rotation and wraps", () => {
    expect(rotated(["a", "b", "c"], 4)).toEqual(["b", "c", "a"]);
    expect(rotated([], 2)).toEqual([]);
  });
});

describe("S-17 combined scope budget: 7-member cast, 4 active quests, relationships and card pulls in the same read", () => {
  it("the fixture exercises every source past the budget (else the rest proves nothing)", () => {
    const raw = SCOPE_SOURCES.map((source) => ({ kind: source.kind, ...readScopeSource(source, STORY, empty, context(0)) }));
    expect(raw.find((read) => read.kind === "quest")?.keys).toEqual(questKeys);
    expect(raw.find((read) => read.kind === "card")?.keys).toHaveLength(MEMBERS.length);
    expect(raw.find((read) => read.kind === "relationship")?.keys).toHaveLength(REL_AXES_PER_READ);
  });

  it("a read's questions cost at most SCOPE_EXTRA_TOKENS over the baseline arm (quest and relationship sources at 0), the direction rule included", () => {
    for (let rotation = 0; rotation < 12; rotation += 1) expect(added(rotation)).toBeLessThanOrEqual(SCOPE_EXTRA_TOKENS);
  });

  it("control: the per-source caps alone overrun the budget, which is the S-17 red", () => {
    const base = baselineKeys(0);
    const perSource = new Set(base);
    for (const source of SCOPE_SOURCES) readScopeSource(source, STORY, empty, context(0)).keys.forEach((key) => perSource.add(key));
    const cost = [...perSource].filter((key) => !base.includes(key)).reduce((sum, key) => sum + COST(key), 0) + STEP_READ_COST;
    expect(cost).toBeGreaterThan(SCOPE_EXTRA_TOKENS);
  });

  it("no active quest is ever left out of scope", () => {
    for (let rotation = 0; rotation < 12; rotation += 1) expect(scopeKeys(rotation)).toEqual(expect.arrayContaining(questKeys));
  });

  it("keeps the order: gate keys, active quests, the drafted member's axes, the pairs due this read, then card pulls", () => {
    const reads = readScopeSources(SCOPE_SOURCES, STORY, empty, context(0), new Set(["rel_m1_player_trust"]));
    const relationship = reads.find((read) => read.kind === "relationship");
    const card = reads.find((read) => read.kind === "card");
    expect(relationship?.keys).toEqual(expect.arrayContaining(["rel_m1_player_trust", ...draftedKeys]));
    expect(reads.find((read) => read.kind === "quest")?.keys).toEqual(questKeys);
    expect(relationship?.keys.filter(isOtherAxis).length).toBeGreaterThan(0);
    expect(card?.keys.length).toBeGreaterThanOrEqual(CARD_MIN_SHARE);
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

  const pairWait = (step: number) => {
    const candidates = new Set(MEMBERS.slice(1).flatMap((id, at) => [`rel_${id}_player_trust`, `rel_${id}_player_fear`, `rel_${id}_${MEMBERS[(at + 2) % MEMBERS.length]}_respect`]));
    const lastSeen = new Map<string, number>();
    let worst = 0;
    let pairsSplit = 0;
    for (let read = 0; read < 24; read += 1) {
      const kept = new Set(scopeKeys(read * step).filter(isOtherAxis));
      const pairs = new Set([...kept].map(pairOf));
      pairsSplit += [...candidates].filter((key) => pairs.has(pairOf(key)) && !kept.has(key)).length;
      for (const key of candidates) {
        if (!kept.has(key)) continue;
        worst = Math.max(worst, read - (lastSeen.get(key) ?? -1) - 1);
        lastSeen.set(key, read);
      }
    }
    return { worst: [...candidates].every((key) => lastSeen.has(key)) ? worst : Infinity, pairsSplit };
  };

  it("others' pairs take turns by phase, so each present pair is read within 3 reads of the last, all its axes together", () => {
    const { worst, pairsSplit } = pairWait(1);
    expect(worst).toBeLessThanOrEqual(REL_ROTATION_READS - 1);
    expect(pairsSplit).toBe(0);
  });

  it("planted control: a rotation that skips every other phase (stepping 2 per read) leaves pairs out longer than 3 reads", () => {
    expect(pairWait(2).worst).toBeGreaterThan(REL_ROTATION_READS - 1);
  });

  it("card pulls keep a share, so every card field is read within as many reads as there are cards (F3: 1 of 7, always the same, before)", () => {
    const cards = MEMBERS.map((id) => `hair_${id}`);
    const lastSeen = new Map<string, number>();
    let worst = 0;
    for (let rotation = 0; rotation < 3 * cards.length; rotation += 1) {
      const kept = scopeKeys(rotation).filter((key) => cards.includes(key));
      expect(kept.length).toBeGreaterThanOrEqual(CARD_MIN_SHARE);
      for (const key of kept) {
        worst = Math.max(worst, rotation - (lastSeen.get(key) ?? -1) - 1);
        lastSeen.set(key, rotation);
      }
    }
    expect(cards.every((key) => lastSeen.has(key))).toBe(true);
    expect(worst).toBeLessThanOrEqual(Math.ceil(cards.length / CARD_MIN_SHARE) - 1);
  });

  it("the author overflow names exactly what the read leaves out, the budget's drops and the source cap's", () => {
    const capOnly = readScopeSource(RELATIONSHIP_SOURCE, STORY, empty, context(0));
    const overflow = scopeOverflow(STORY, "a", empty, context(0));
    const relationship = overflow.find((row) => row.kind === "relationship")?.dropped ?? [];
    const carried = new Set(scopeKeys(0));
    expect(relationship.length).toBeGreaterThanOrEqual(capOnly.dropped.length);
    for (const key of [...capOnly.keys, ...capOnly.dropped]) expect(carried.has(key)).toBe(!relationship.includes(key));
    for (const row of overflow) row.dropped.forEach((key) => expect(carried.has(key)).toBe(false));
    expect(overflow.find((row) => row.kind === "card")?.dropped.length).toBeGreaterThan(0);
  });

  it("with fewer game keys the leftover budget goes back to card pulls", () => {
    const small = parseStoryV2OrThrow({ ...castStory(1), roster: castStory(1).roster.map((member, at) => (at === 0 ? { ...member, relationships: [{ toward: "player", axes: ["trust"], range: [-3, 3] }] } : { id: member.id, name: member.name, role: member.role, card: member.card })) } as unknown as StoryV2);
    const reads = readScopeSources(SCOPE_SOURCES, small, empty, context(0), new Set());
    expect(reads.find((read) => read.kind === "card")?.keys.length).toBeGreaterThanOrEqual(MEMBERS.length - 2);
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

describe("F27: a key the scope will not carry costs nothing", () => {
  const hinted = () => {
    const raw = castStory();
    return parseStoryV2OrThrow({
      ...raw,
      checkpoints: [...raw.checkpoints, { id: "c", name: "C", type: "anchor", objective: "Later." }],
      transitions: [...raw.transitions, { from: "b", to: "c", priority: 0, gate: { q: "k0", op: "==", v: true } }],
      qualities: raw.qualities.map((quality) => (quality.key.startsWith("k") ? { ...quality, scope_hint: { from: "c" } } : quality)),
    } as unknown as StoryV2);
  };

  it("a quest key hinted for a later checkpoint is not offered, so the budget it would have used goes to pairs and cards", () => {
    const story = hinted();
    const { scope, sources } = deriveScopeWithSources(story, "a", empty, [], context(0));
    expect(sources.find((read) => read.kind === "quest")?.keys).toEqual([]);
    expect(scope.map((entry) => entry.key).filter((key) => questKeys.includes(key))).toEqual([]);
    const plain = deriveScopeWithSources(STORY, "a", empty, [], context(0)).scope.length;
    expect(scope.length).toBeGreaterThan(plain - questKeys.length);
  });

  it("planted control: offered anyway (every key admitted), the hinted keys take budget the prompt never carries", () => {
    const story = hinted();
    const carried = new Set(deriveScopeWithSources(story, "a", empty, [], context(0)).scope.map((entry) => entry.key));
    const unfiltered = readScopeSources(SCOPE_SOURCES, story, empty, context(0), new Set(["rel_m1_player_trust"]));
    const wasted = unfiltered.flatMap((read) => read.keys).filter((key) => questKeys.includes(key) && !carried.has(key));
    expect(wasted.length).toBeGreaterThan(0);
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
