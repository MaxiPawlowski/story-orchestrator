import { parseStoryV2OrThrow, type BlackboardSnapshot, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { readContext, renderSharedReadPrompt, STEP_READ_HEADER } from "./contract";
import { buildFixtureRun } from "./fixtureRun";
import { deriveScopeWithSources } from "./scope";
import { CARD_MIN_SHARE, CARD_SOURCE, QUEST_SOURCE, questionTokens, readScopeSource, RELATIONSHIP_SOURCE, SCOPE_SOURCES, type ScopeSource, type ScopeSourceContext } from "./scopeSources";
import { STEP_READ_RULE } from "./stepRead";
import { CLEANED_FORM } from "./windowHygiene";

const TOKEN_FLOOR_36 = 0.15;
const TOKEN_FLOOR_37 = 0.12;
const FAIR_MAX_WAIT = 3;
const LEGACY_REL_CAP = 8;
const LEGACY_EXTRA_KEYS = 5;

const CARD_RULE = "Write a short factual value only when the scene confirms it. A suggestion, question, hypothetical, intention or an unconfirmed attempt changes nothing. "
  + "Keep the previous established value when the scene does not show a change.";
const LIFE = ["m1", "m2", "m3", "m4", "m5", "m6"];
const NAMES: Record<string, string> = { m1: "Belle", m2: "Dalan", m3: "Ash", m4: "Sali", m5: "Elowyn", m6: "Lady" };
const rel = (toward: string, axes: string[]) => ({ toward, axes, range: [-5, 5], step: 1, start: 0 });
const RELATIONSHIPS: Record<string, ReturnType<typeof rel>[]> = {
  m1: [rel("player", ["trust", "respect"]), rel("m2", ["trust"]), rel("m4", ["trust"])],
  m2: [rel("player", ["trust"]), rel("m1", ["trust"]), rel("m5", ["trust"])],
  m3: [rel("player", ["trust"])],
  m4: [rel("player", ["trust", "fear"]), rel("m1", ["trust"])],
  m5: [rel("player", ["devotion", "trust"]), rel("m1", ["jealousy"]), rel("m4", ["jealousy"])],
  m6: [rel("player", ["interest"])],
};
const CARD_FIELDS = ["outfit", "hair", "condition"];
const GATE_RULE = "Count only what the scene shows happening now; a plan, a boast or an earlier event retold does not change it, and a value stays where it was until a line moves it.";
const GATES = ["party_rank", "guild_reputation", "party_injuries", "at_border", "location"];
const QUEST_FROM: Record<string, string> = { ritual_known: "c1", thornway_reached: "c1", grove_reached: "c2", out_of_the_trees: "c3" };
const QUEST_KEYS = Object.keys(QUEST_FROM);
const CHECKPOINTS = ["c0", "c1", "c2", "c3"];
const GATE = { all: GATES.map((q) => ({ q, op: "!=", v: q === "location" ? "nowhere" : -99 })) };

const RAW = {
  format: 2, id: "s17-replay", title: "S-17 replay", description: "Synthetic shape of the S-17 read inputs: 7 members, 4 active quest keys, 6 card pulls, up to 22 relationship candidates.",
  roster: [
    { id: "dm", name: "Narrator", role: "narrator" },
    ...LIFE.map((id) => ({
      id, name: NAMES[id], role: `member ${id}`,
      relationships: RELATIONSHIPS[id],
      mood: { baseline: "calm", lasts: { until: "scene_break" } },
      ...(id === "m1" || id === "m2" ? { card: { fields: Object.fromEntries(CARD_FIELDS.map((field) => [field, { quality: `card_${id}_${field}`, visual: true }])) } } : {}),
    })),
  ],
  qualities: [
    ...GATES.map((key) => ({ key, type: key === "location" ? "string" : "int", source: "extractor", rubric: `The party's ${key.replace(/_/g, " ")} as the story states it, from what the narrator confirms in the scene. ${GATE_RULE}` })),
    ...["m1", "m2"].flatMap((id) => CARD_FIELDS.map((field) => ({
      key: `card_${id}_${field}`, type: "string", source: "extractor",
      rubric: `${NAMES[id]}'s current ${field}, such as what is worn, carried or visibly changed; never private knowledge or an inferred state. ${CARD_RULE}`,
    }))),
    ...QUEST_KEYS.map((key) => ({
      key, type: "bool", source: "extractor", scope_hint: { from: QUEST_FROM[key] },
      rubric: `True once the scene shows the party ${key.replace(/_/g, " ")}: the narrator states it outright, or the party is seen doing it; a plan or a rumour is not enough.`,
    })),
  ],
  checkpoints: [
    ...CHECKPOINTS.map((id, at) => ({ id, name: `Stage ${at}`, type: "anchor", ...(at === 0 ? { start: true } : {}), objective: "Cross the forest." })),
    { id: "end", name: "The far side", type: "anchor", objective: "Rest." },
  ],
  transitions: [...CHECKPOINTS.slice(1), "end"].map((to, at) => ({ from: CHECKPOINTS[at], to, priority: 0, gate: to === "end" ? { all: [...GATE.all, ...QUEST_KEYS.map((q) => ({ q, op: "==", v: true }))] } : GATE })),
  quests: QUEST_KEYS.map((key, at) => ({ id: `q${at}`, title: `Quest ${at}`, kind: "side", steps: [], done_when: { q: key, op: "==", v: true } })),
} as unknown as StoryV2;

const WINDOWS: Array<{ holder: string; present: string[]; checkpoint: string }> = [
  ["m4", "m1 m2 m4 m3"], ["m3", "m1 m2 m4 m3"], ["m1", "m1 m2 m4 m3"], ["m2", "m1 m2 m4 m3"], ["m2", "m1 m2 m4 m3"], ["m1", "m1 m2 m4 m3"],
  ["m5", "m5 m1 m2 m4 m3"], ["m5", "m5 m1 m2 m4 m3"], ["m5", "m5 m1 m2 m4 m3"], ["m4", "m5 m1 m2 m4 m3"], ["m1", "m5 m1 m2 m4 m3"],
  ["m2", "m5 m2 m4 m3"], ["m3", "m5 m2 m4 m3"], ["m4", "m5 m2 m4 m3"], ["m2", "m2 m4 m3"], ["m1", "m1 m2 m5 m3 m4"], ["m5", "m1 m2 m5 m3 m4"],
  ["m6", "m6 m5 m3 m4 m1 m2"], ["m6", "m6 m5 m3 m4 m1 m2"], ["m2", "m1 m2"],
].map(([holder, present], at) => ({ holder, present: present.split(" "), checkpoint: at < 11 ? "c0" : at < 14 ? "c1" : at < 17 ? "c2" : "c3" }));

const LINE = "The rain keeps falling on the old road while the party waits under the trees, counting the lanterns and listening for horses on the far side of the ridge.";
const transcriptOf = (holder: string) => [
  { index: 0, speaker: "You", text: LINE, is_user: true },
  { index: 1, speaker: NAMES[holder], text: LINE },
  { index: 2, speaker: "Narrator", text: LINE },
];
const CANON = Array.from({ length: 14 }, () => LINE).join(" ");

let STORY: NormalizedStoryV2;
const empty: BlackboardSnapshot = { values: {}, versions: {}, latched: {} };

beforeAll(async () => {
  await loadGameLayer();
  STORY = parseStoryV2OrThrow(RAW);
});

const admitted = (key: string, checkpoint: string) => {
  const from = STORY.qualityByKey[key]?.scope_hint?.from;
  return !from || from === checkpoint || Boolean(STORY.reachableByCheckpoint[from]?.includes(checkpoint));
};

const promptOf = (keys: Iterable<string>, holder: string, checkpoint: string) => {
  const qualities = [...new Set(keys)].filter((key) => admitted(key, checkpoint)).map((key) => STORY.qualityByKey[key]).filter((quality) => quality?.source === "extractor")
    .sort((left, right) => left.key.localeCompare(right.key)).map((quality) => ({ key: quality.key, quality, hints: [] }));
  const messages = transcriptOf(holder).map((entry) => ({ index: entry.index, messageId: entry.index, speaker: entry.speaker, text: entry.text, isUser: entry.is_user === true }));
  return renderSharedReadPrompt({
    storyTitle: STORY.title, activeCheckpointId: checkpoint, qualities, window: { from: 0, to: 2, messages, form: CLEANED_FORM }, canon: CANON, ...readContext(STORY, checkpoint), counted: {},
  });
};

const perAxisRule = (prompt: string) => prompt.split("\n").filter((line) => line !== STEP_READ_HEADER)
  .map((line) => (line.includes(": type=direction; ") ? `${line} ${STEP_READ_RULE}` : line)).join("\n");

type SourceRead = { kind: ScopeSource["kind"]; keys: string[]; dropped: string[] };

const legacyRead = (context: ScopeSourceContext, free: ReadonlySet<string>, checkpoint: string): SourceRead[] => {
  const sources = [CARD_SOURCE, QUEST_SOURCE, { ...RELATIONSHIP_SOURCE, cap: LEGACY_REL_CAP }];
  const reads = sources.map((source) => ({ source, kind: source.kind, cap: source.cap, ...readScopeSource(source, STORY, empty, context) }));
  const ofKind = (kind: ScopeSource["kind"]) => reads.filter((read) => read.kind === kind);
  const lead = (read: (typeof reads)[number]) => new Set(read.source.lead?.(STORY, empty, context) ?? []);
  const capOf = (read: (typeof reads)[number], used: number) => (read.cap === null ? undefined : Math.max(0, read.cap - used));
  const tiers: Array<{ read: (typeof reads)[number]; keys: string[]; rotate?: boolean; cap?: number }> = [
    ...ofKind("quest").flatMap((read) => {
      const active = [...read.keys, ...read.dropped].filter((key) => lead(read).has(key));
      return [{ read, keys: active, rotate: true, cap: capOf(read, 0) }, { read, keys: [...read.keys, ...read.dropped].filter((key) => !lead(read).has(key)), cap: capOf(read, active.length) }];
    }),
    ...ofKind("card").map((read) => ({ read, keys: read.keys, rotate: true, cap: CARD_MIN_SHARE })),
    ...ofKind("relationship").flatMap((read) => {
      const drafted = read.keys.filter((key) => lead(read).has(key));
      return [{ read, keys: drafted }, { read, keys: [...read.keys, ...read.dropped].filter((key) => !lead(read).has(key)), rotate: true, cap: capOf(read, drafted.length) }];
    }),
    ...ofKind("card").map((read) => ({ read, keys: read.keys })),
  ];
  const taken = new Set(free);
  let left = new Set(ofKind("card").flatMap((read) => read.keys).filter((key) => !free.has(key))).size + LEGACY_EXTRA_KEYS;
  const kept = new Map<(typeof reads)[number], Set<string>>();
  const rotation = context.rotation ?? context.cursor ?? 0;
  for (const tier of tiers) {
    const payable = [...new Set(tier.keys)].filter((key) => !taken.has(key));
    const room = Math.min(left, tier.cap ?? left);
    const start = tier.rotate && payable.length > room && room > 0 ? (rotation * room) % payable.length : 0;
    const paid = payable.length <= room ? new Set(payable) : new Set(Array.from({ length: Math.min(room, payable.length) }, (_, at) => payable[(start + at) % payable.length]));
    left -= paid.size;
    kept.set(tier.read, new Set([...(kept.get(tier.read) ?? []), ...tier.keys.filter((key) => taken.has(key) || paid.has(key))]));
    paid.forEach((key) => taken.add(key));
  }
  return reads.map((read) => {
    const all = [...read.keys, ...read.dropped].filter((key) => admitted(key, checkpoint));
    const keep = kept.get(read) ?? new Set();
    return { kind: read.kind, keys: all.filter((key) => keep.has(key)), dropped: all.filter((key) => !keep.has(key)) };
  });
};

const maxWait = (reads: SourceRead[][], kind: ScopeSource["kind"]) => {
  const streak = new Map<string, number>();
  let worst = 0;
  for (const sources of reads) {
    const source = sources.find((entry) => entry.kind === kind);
    if (!source) continue;
    for (const key of [...streak.keys()]) if (!source.keys.includes(key) && !source.dropped.includes(key)) streak.set(key, 0);
    for (const key of source.dropped) worst = Math.max(worst, streak.set(key, (streak.get(key) ?? 0) + 1).get(key) ?? 0);
    for (const key of source.keys) streak.set(key, 0);
  }
  return worst;
};

const gateKeys = (context: ScopeSourceContext, checkpoint: string) => new Set(deriveScopeWithSources(STORY, checkpoint, empty, [], context, []).scope.map((entry) => entry.key));
const baselineSources = [CARD_SOURCE, { ...QUEST_SOURCE, cap: 0 }, { ...RELATIONSHIP_SOURCE, cap: 0 }];

interface Arm {
  base: number;
  growth: number;
  pairWait: number;
  questWait: number;
  questKeys: number;
  cardReads: number;
}

const replay = (arm: "legacy" | "shipped", { stride = 1, perAxis = false }: { stride?: number; perAxis?: boolean } = {}): Arm => {
  let base = 0;
  let combined = 0;
  const reads: SourceRead[][] = [];
  WINDOWS.forEach((window, index) => {
    const context: ScopeSourceContext = { present: window.present, drafted: window.holder, cursor: index, rotation: index * stride };
    const baseline = deriveScopeWithSources(STORY, window.checkpoint, empty, [], context, baselineSources).scope.map((entry) => entry.key);
    base += questionTokens(promptOf(baseline, window.holder, window.checkpoint));
    if (arm === "legacy") {
      const free = gateKeys(context, window.checkpoint);
      const sources = legacyRead(context, free, window.checkpoint);
      reads.push(sources);
      combined += questionTokens(perAxisRule(promptOf([...free, ...sources.flatMap((source) => source.keys)], window.holder, window.checkpoint)));
      return;
    }
    const derived = deriveScopeWithSources(STORY, window.checkpoint, empty, [], context, SCOPE_SOURCES);
    reads.push(derived.sources);
    const prompt = promptOf(derived.scope.map((entry) => entry.key), window.holder, window.checkpoint);
    combined += questionTokens(perAxis ? perAxisRule(prompt) : prompt);
  });
  const of = (sources: SourceRead[], kind: ScopeSource["kind"]) => sources.find((source) => source.kind === kind);
  return {
    base: Math.round(base / WINDOWS.length),
    growth: Number((combined / base - 1).toFixed(4)),
    pairWait: maxWait(reads, "relationship"),
    questWait: maxWait(reads, "quest"),
    questKeys: Math.max(...reads.map((sources) => (of(sources, "quest")?.keys.length ?? 0) + (of(sources, "quest")?.dropped.length ?? 0))),
    cardReads: reads.filter((sources) => (of(sources, "card")?.keys.length ?? 0) >= CARD_MIN_SHARE).length,
  };
};

describe("v2.8 31 F27: S-17 / 37-S17 offline replay of the combined scope budget (synthetic shape of the pod 2 inputs)", () => {
  it("the fixture is the S-17 shape: 7 members, 4 active quest keys, 6 card pulls, up to 22 relationship candidates", () => {
    expect(STORY.roster).toHaveLength(7);
    const widest = WINDOWS[17];
    const reads = SCOPE_SOURCES.map((source) => ({ kind: source.kind, ...readScopeSource({ ...source, cap: null }, STORY, empty, { present: widest.present, drafted: widest.holder }, (key) => admitted(key, widest.checkpoint)) }));
    expect(reads.find((read) => read.kind === "quest")?.keys).toHaveLength(4);
    expect(reads.find((read) => read.kind === "card")?.keys).toHaveLength(6);
    expect(reads.find((read) => read.kind === "relationship")?.keys).toHaveLength(22);
  });

  it("the replay renders the prompt the read sends (promptOf matches buildFixtureRun)", () => {
    for (const at of [6, 18]) {
      const window = WINDOWS[at];
      const run = buildFixtureRun({ story: RAW, transcript: transcriptOf(window.holder), canon: CANON, activeCheckpointId: window.checkpoint, scopeContext: { present: window.present, drafted: window.holder, cursor: at } });
      expect(promptOf(run.scope.map((entry) => entry.key), window.holder, window.checkpoint)).toBe(run.prompt);
    }
  });

  it("before (the budget shipped at 84c23335): tokens over both floors and a present pair waits past 3 reads, the pod 2 red", () => {
    const before = replay("legacy");
    expect(before.growth).toBeGreaterThan(TOKEN_FLOOR_36);
    expect(before.pairWait).toBeGreaterThan(FAIR_MAX_WAIT);
  });

  it("after: fewer tokens, under both floors, every present pair within 3 reads, no admitted quest left out", () => {
    const before = replay("legacy");
    const after = replay("shipped");
    expect(after.growth).toBeLessThan(before.growth);
    expect(after.growth).toBeLessThanOrEqual(TOKEN_FLOOR_37);
    expect(after.pairWait).toBeLessThanOrEqual(FAIR_MAX_WAIT);
    expect(after.questKeys).toBe(4);
    expect(after.questWait).toBe(0);
    expect(after.cardReads).toBeGreaterThanOrEqual(WINDOWS.length - 2);
  });

  it("planted control: the per-axis direction rule (F6 as shipped) alone puts tokens back over the floors", () => {
    expect(replay("shipped", { perAxis: true }).growth).toBeGreaterThan(TOKEN_FLOOR_37);
  });

  it("planted control: a rotation that steps 2 per read (the boundary at cadence 2) starves half the phases", () => {
    expect(replay("shipped", { stride: 2 }).pairWait).toBeGreaterThan(FAIR_MAX_WAIT);
  });

  it("records the numbers", () => {
    console.log(JSON.stringify({ before: replay("legacy"), after: replay("shipped"), perAxisControl: replay("shipped", { perAxis: true }), stride2Control: replay("shipped", { stride: 2 }) }));
  });
});
