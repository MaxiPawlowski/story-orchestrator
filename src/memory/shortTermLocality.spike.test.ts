import { SHORT_TERM_COMPACTION_MESSAGES } from "@constants/defaults";
import { createTokenMeter, type RequestBudget } from "@extraction/tokenMeter";
import { disappearingEntries, recordDerived, type DerivedRecord } from "./derived";
import { buildMemoryInjection } from "./inject";
import { reverseMemoryState } from "./reverse";
import { fitShortTerm } from "./sceneSummary";
import { appendShortTerm } from "./shortTermAppend";
import { createMemoryState, DEFAULT_TIER_BUDGETS, DEFAULT_TIER_TOKEN_BUDGETS, rollingShortTerm, type ShortTermPlacement } from "./stores";
import type { MemoryEntry } from "./types";

const SEEDS = [1, 7, 20260921, 424242];
const CUTS_PER_SEED = 100;
const MESSAGES = 240;
const CONTEXT = 4096;
const TIGHT_CONTEXT = 1400;
const LIMITS = { rows: DEFAULT_TIER_BUDGETS.short_term, tokens: DEFAULT_TIER_TOKEN_BUDGETS.short_term };
const T4_BUDGET = 300;

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const between = (random: () => number, low: number, high: number) => low + Math.floor(random() * (high - low + 1));

const budget = (context: number): RequestBudget => ({ contextLimit: { value: context, source: "preset" }, meter: createTokenMeter() });

const summaryEntry = (index: number, messageId: number, text: string): MemoryEntry => ({
  id: `st${index}`, tier: "short_term", text, type: "scene", importance: 2, expiration: "session", entities: [], confidence: 1,
  activationTriggers: [], evidence: "", createdAt: messageId, messageId, recallCount: 0,
}) as Partial<MemoryEntry> as MemoryEntry;

interface World {
  entries: MemoryEntry[];
  excluded: string[];
  writeLog: ReturnType<typeof createMemoryState>["writeLog"];
  shortTermSummaryEnd: number;
  arcs: [];
  epistemic: [];
  ledger: [];
  canon: null;
  verifyDrops: [];
  derived: DerivedRecord[];
  storyStart: number;
}

const emptyWorld = (): World => ({ ...createMemoryState(), shortTermSummaryEnd: -1, arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [], storyStart: 0 });

const SCORE = { boundary: 0, turnText: "", turnEntities: [] };

async function simulate(seed: number, shape: ShortTermPlacement, withPrevious: boolean, context: number) {
  const random = rng(seed);
  const chat = Array.from({ length: MESSAGES }, (_, messageId) => ({ messageId, speaker: messageId % 2 ? "Narrator" : "Player", text: `m${messageId} ${"w".repeat(between(random, 20, 120) * 4)}` }));
  const summaries = Array.from({ length: MESSAGES }, () => between(random, 160, 480));
  const world = emptyWorld();
  let t4max = 0;
  let passes = 0;
  for (let lastId = 0; lastId < MESSAGES; lastId += 1) {
    if (lastId - world.shortTermSummaryEnd >= SHORT_TERM_COMPACTION_MESSAGES) {
      const window = chat.slice(world.shortTermSummaryEnd + 1, lastId + 1);
      const previous = world.entries.find((entry) => entry.tier === "short_term");
      const fit = await fitShortTerm(window, withPrevious ? previous?.text ?? null : null, budget(context));
      const entry = summaryEntry(passes, lastId, `summary ${passes} ${"s".repeat(summaries[passes])}`);
      passes += 1;
      const placed = shape(world.entries, entry, () => LIMITS);
      world.derived = recordDerived(world.derived, { kind: "short_term", inputs: placed.inputs, outputId: entry.id, range: { from: fit.from, to: lastId },
          removed: disappearingEntries(world.entries, placed.entries), boundary: lastId, messageId: lastId });
      world.entries = placed.entries;
      world.shortTermSummaryEnd = lastId;
    }
    const injected = buildMemoryInjection(world.entries, null, { tokenBudgets: DEFAULT_TIER_TOKEN_BUDGETS, scoreContext: SCORE }).trim.short_term.tokensUsed;
    t4max = Math.max(t4max, injected);
  }
  return { world, t4max, passes };
}

const inRange = (record: DerivedRecord, messageId: number) => record.range !== undefined && messageId >= record.range.from && messageId <= record.range.to;

const liveCoverage = (world: World, cut: number, lineage: boolean): number => {
  const shortTerm = world.derived.filter((record) => record.kind === "short_term");
  const live = new Set(world.entries.filter((entry) => entry.tier === "short_term").map((entry) => entry.id));
  const covering = new Set(shortTerm.filter((record) => record.outputId !== undefined && live.has(record.outputId)));
  let grew = lineage;
  while (grew) {
    grew = false;
    const outputs = new Set([...covering].flatMap((record) => record.inputs));
    shortTerm.filter((record) => !covering.has(record) && record.outputId !== undefined && outputs.has(record.outputId)).forEach((record) => { covering.add(record); grew = true; });
  }
  return Array.from({ length: cut }, (_, messageId) => messageId).filter((messageId) => [...covering].some((record) => inRange(record, messageId))).length;
};

async function measure(shape: ShortTermPlacement, withPrevious: boolean, lineage: boolean, context = CONTEXT) {
  const totals = { calls: 0, uncovered: 0, liveCovered: 0, cuts: 0, t4max: 0, passes: 0 };
  for (const seed of SEEDS) {
    const { world, t4max, passes } = await simulate(seed, shape, withPrevious, context);
    totals.t4max = Math.max(totals.t4max, t4max);
    totals.passes += passes;
    const random = rng(seed ^ 0x5a5a5a5a);
    for (let probe = 0; probe < CUTS_PER_SEED; probe += 1) {
      const cut = 1 + Math.floor(random() * MESSAGES);
      const rolled = { ...world, ...reverseMemoryState(world, cut, cut - 1) } as World;
      const surviving = new Set(rolled.derived.map((record) => record.id));
      const dropped = world.derived.filter((record) => record.kind === "short_term" && !surviving.has(record.id));
      totals.calls += dropped.filter((record) => (record.range?.from ?? cut) < cut).length;
      const survivors = rolled.derived.filter((record) => record.kind === "short_term");
      totals.uncovered += Array.from({ length: cut }, (_, messageId) => messageId)
        .filter((messageId) => messageId <= rolled.shortTermSummaryEnd && !survivors.some((record) => inRange(record, messageId))).length;
      totals.liveCovered += liveCoverage(rolled, cut, lineage);
      totals.cuts += 1;
    }
  }
  return totals;
}

describe("v2.5 plan 09 SP4 T2 locality and T4 budget (predeclared in docs/plans/v2.5/09-sp4-spike-report.md)", () => {
  let rolling: Awaited<ReturnType<typeof measure>>;
  let append: Awaited<ReturnType<typeof measure>>;

  beforeAll(async () => {
    rolling = await measure(rollingShortTerm, true, true);
    append = await measure(appendShortTerm, false, false);
    if (process.env.SO_SPIKE_REPORT) process.stdout.write(`${JSON.stringify({ rolling, append })}\n`);
  });

  it("measures 400 cuts per shape over the same chats", () => {
    expect(rolling.cuts).toBe(400);
    expect(append.cuts).toBe(400);
    expect(append.passes).toBe(rolling.passes);
  });

  it("T2: synthesis calls to rebuild after a rollback are no more than today's", () => {
    expect(append.calls).toBeLessThanOrEqual(rolling.calls);
  });

  it("T2: messages left uncovered after a rollback are no more than today's", () => {
    expect(append.uncovered).toBeLessThanOrEqual(rolling.uncovered);
  });

  it("T4: the injected short_term stays within 300 tokens at every boundary, in both shapes", () => {
    expect(append.t4max).toBeLessThanOrEqual(T4_BUDGET);
    expect(rolling.t4max).toBeLessThanOrEqual(T4_BUDGET);
  });

  it("control: a rollback does invalidate synthesis work, so the call count is not vacuous", () => {
    expect(rolling.calls).toBeGreaterThan(0);
    expect(append.calls).toBeGreaterThan(0);
  });

  it("control: the uncovered count sees messages a fitted window drops, so a zero is a measurement and not a blind spot", async () => {
    const tight = await measure(rollingShortTerm, true, true, TIGHT_CONTEXT);
    expect(tight.uncovered).toBeGreaterThan(0);
  });
});
