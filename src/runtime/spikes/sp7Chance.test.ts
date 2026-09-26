import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow, type DerivedQualityView, type PrimitiveValue } from "@engine/index";
import { dieFace, unitDraw } from "@engine/chance";
import { chooseByRules } from "@talk/index";
import { chanceGateValues, createChanceSeams, npcRollDraw, talkDrawStream, type ChanceContext, type ChanceDraw } from "./sp7Chance";
import { chanceContext, installSpikes, type SpikePort } from "./install";
import { spikeSeams } from "../spikeSeams";
import { defaultSpikeFlags } from "../spikeFlags";

const raw = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/sp7-chance.story.json"), "utf8"));
const story = parseStoryV2OrThrow(raw);
const STORY_ID = "sp7-chance";
const BOUNDARIES = 150;
const CUTS = 200;
const SEEDS = [11, 23, 37, 51];

type Derive = (view: DerivedQualityView) => Array<{ q: string; v: PrimitiveValue }>;

interface TraceRow {
  boundary: number;
  active: string;
  fired: string | null;
  lockGives: PrimitiveValue | undefined;
  clueDie: PrimitiveValue | undefined;
}

const seededDerive = (chatId: string): Derive => (view) => chanceGateValues(raw, { chatId, storyId: STORY_ID }, view);
const unseededDerive: Derive = (view) => chanceGateValues(raw, { chatId: String(Math.random()), storyId: STORY_ID }, view);

const input = (seed: number, index: number) => unitDraw(["sp7-d1-input", seed, index]) < 0.5;

const drive = (engine: StoryEngine, seed: number, from: number, to: number): TraceRow[] => {
  const rows: TraceRow[] = [];
  for (let index = from; index < to; index += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: index, to: index }, deltas: [{ q: "tried", v: input(seed, index), source: "extractor" }] });
    const result = engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
    const entry = engine.stateLog[engine.stateLog.length - 1];
    rows.push({
      boundary: result.boundary,
      active: result.activeCheckpointId,
      fired: result.fired ? `${result.fired.from}>${result.fired.to}` : null,
      lockGives: entry.evaluated?.lock_gives,
      clueDie: entry.evaluated?.clue_die,
    });
  }
  return rows;
};

const freshEngine = (derive: Derive) => {
  const engine = new StoryEngine({ now: () => 0, derive });
  engine.loadStory(story);
  return engine;
};

const replayMismatches = (derive: Derive, seed: number): number => {
  const engine = freshEngine(derive);
  const original = drive(engine, seed, 0, BOUNDARIES);
  let mismatches = 0;
  for (let cut = 0; cut < CUTS; cut += 1) {
    const at = Math.floor(unitDraw(["sp7-d1-cut", seed, cut]) * BOUNDARIES);
    const outcome = engine.rollbackTo(at);
    if (!outcome.ok) throw new Error(`rollback to ${at} was refused`);
    const replayed = drive(engine, seed, at, BOUNDARIES);
    if (JSON.stringify(replayed) !== JSON.stringify(original.slice(at))) mismatches += 1;
  }
  return mismatches;
};

const context = (overrides: Partial<ChanceContext> = {}): ChanceContext => ({ chatId: "chat-a", storyId: STORY_ID, boundary: 4, raw, ...overrides });

describe("SP7 D1: a chance draw replays", () => {
  it("the same chat, story and boundary give the same draw, and the gate values are a function of them", () => {
    const view = { boundary: 9, activeCheckpointId: "gate", checkpointStartedBoundary: 7 };
    expect(chanceGateValues(raw, context(), view)).toEqual(chanceGateValues(raw, context(), view));
    expect(npcRollDraw(context(), 4, "cp:onEnter:arin:0")).toBe(npcRollDraw(context(), 4, "cp:onEnter:arin:0"));
    expect(drive(freshEngine(seededDerive("chat-a")), 11, 0, BOUNDARIES)).toEqual(drive(freshEngine(seededDerive("chat-a")), 11, 0, BOUNDARIES));
  });

  it("the draw is fixed for a checkpoint visit: every boundary inside one visit reads the value drawn at entry", () => {
    const rows = drive(freshEngine(seededDerive("chat-a")), 23, 0, BOUNDARIES);
    const firstVisitRows = rows.slice(0, rows.findIndex((row) => row.fired !== null) + 1);
    expect(new Set(firstVisitRows.map((row) => row.lockGives)).size).toBe(1);
  });

  it("control: another chat draws another sequence, so the seed carries the chat", () => {
    const a = drive(freshEngine(seededDerive("chat-a")), 11, 0, BOUNDARIES).map((row) => row.clueDie);
    const b = drive(freshEngine(seededDerive("chat-b")), 11, 0, BOUNDARIES).map((row) => row.clueDie);
    expect(a).not.toEqual(b);
  });

  it(`rollback + replay gives the same draws: ${SEEDS.length} seeds x ${CUTS} cuts over ${BOUNDARIES} boundaries`, () => {
    const measured = SEEDS.map((seed) => ({ seed, mismatches: replayMismatches(seededDerive(`chat-${seed}`), seed) }));
    console.log(`SP7 D1 replay: ${JSON.stringify(measured)}`);
    expect(measured.every((row) => row.mismatches === 0)).toBe(true);
  });

  it("control: an unseeded draw fails the same replay comparison", () => {
    expect(replayMismatches(unseededDerive, 11)).toBeGreaterThan(0);
  });

  it("the engine path visits every checkpoint, so the loop is exercised", () => {
    const rows = drive(freshEngine(seededDerive("chat-a")), 37, 0, BOUNDARIES);
    expect(new Set(rows.map((row) => row.active))).toEqual(new Set(["gate", "through", "barred"]));
  });
});

const D2_SEEDS = 10000;
const D2_TOLERANCE_PP = 1.5;
const D2_ROLLS = [{ sides: 20, target: 12 }, { sides: 6, target: 1 }, { sides: 100, target: 35 }, { sides: 2, target: 1 }];
const D2_NPC_PROBABILITIES = [0.25, 0.5, 0.9];

describe("SP7 D2: the observed rate matches target/sides", () => {
  it(`${D2_SEEDS} seeds per roll are within ${D2_TOLERANCE_PP} pp`, () => {
    const measured = D2_ROLLS.map((roll) => {
      let holds = 0;
      for (let seed = 0; seed < D2_SEEDS; seed += 1) {
        const unit = unitDraw([`chat-${seed}`, STORY_ID, seed % 50, "lock_gives"]);
        if (dieFace(roll.sides, unit) <= roll.target) holds += 1;
      }
      const expected = (100 * roll.target) / roll.sides;
      const observed = (100 * holds) / D2_SEEDS;
      return { roll: `d${roll.sides}<=${roll.target}`, expected, observed, deltaPp: Number((observed - expected).toFixed(2)) };
    });
    console.log(`SP7 D2 gate rolls: ${JSON.stringify(measured)}`);
    expect(measured.every((row) => Math.abs(row.deltaPp) <= D2_TOLERANCE_PP)).toBe(true);
  });

  it("the NPC reply roll on the seam fires at its probability", () => {
    const measured = D2_NPC_PROBABILITIES.map((probability) => {
      let fired = 0;
      for (let seed = 0; seed < D2_SEEDS; seed += 1) if (npcRollDraw({ chatId: `chat-${seed}`, storyId: STORY_ID }, seed % 50, "gate:onEnter:Arin:0") <= probability) fired += 1;
      const observed = (100 * fired) / D2_SEEDS;
      return { probability, observed, deltaPp: Number((observed - 100 * probability).toFixed(2)) };
    });
    console.log(`SP7 D2 npc rolls: ${JSON.stringify(measured)}`);
    expect(measured.every((row) => Math.abs(row.deltaPp) <= D2_TOLERANCE_PP)).toBe(true);
  });

  it("the talk weighted pick on the seam follows its weights (3:1)", () => {
    const candidates = [{ rosterId: "guild_master", name: "Ponticius", weight: 3 }, { rosterId: "companion", name: "Arin", weight: 1 }];
    let heavy = 0;
    for (let seed = 0; seed < D2_SEEDS; seed += 1) {
      const chosen = chooseByRules({ no_repeat: false }, candidates, { lastSpeakerRosterId: null, random: talkDrawStream({ chatId: `chat-${seed}`, storyId: STORY_ID }, seed % 50) });
      if (chosen?.rosterId === "guild_master") heavy += 1;
    }
    const observed = (100 * heavy) / D2_SEEDS;
    console.log(`SP7 D2 talk pick: ${JSON.stringify({ expected: 75, observed })}`);
    expect(Math.abs(observed - 75)).toBeLessThanOrEqual(D2_TOLERANCE_PP);
  });
});

describe("SP7 D3: the seed is a clock-like seam", () => {
  const source = (path: string) => readFileSync(join(__dirname, "../..", path), "utf8");
  const imports = (path: string) => [...source(path).matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);

  it("engine/chance.ts imports no host, runtime or randomness", () => {
    expect(imports("engine/chance.ts")).toEqual(["./schema", "@utils/guards"]);
    expect(source("engine/chance.ts")).not.toMatch(/Math\.random|Date\.now/);
  });

  it("the engine reaches a draw only through EngineHost.derive, beside now()", () => {
    const engine = source("engine/engine.ts");
    expect(imports("engine/engine.ts").filter((specifier) => /chance|spike|runtime|@services/.test(specifier))).toEqual([]);
    expect(engine).toMatch(/export interface EngineHost \{\s*now\(\): number;\s*derive\?\(view: DerivedQualityView\)/);
    expect((engine.match(/Math\.random/g) ?? []).length).toBe(0);
  });

  it("control: the seam reads what the engine hands it, so a planted host value changes the draw", () => {
    const view = { boundary: 3, activeCheckpointId: "gate", checkpointStartedBoundary: 2 };
    expect(chanceGateValues(raw, context(), view)).not.toEqual(chanceGateValues(raw, context(), { ...view, checkpointStartedBoundary: 99 }));
  });
});

describe("SP7 D4/D4b machinery: the NPC roll and the talk pick replay on the seam", () => {
  it("the NPC roll draws the same unit for the same boundary and key, and records it", () => {
    const draws: ChanceDraw[] = [];
    const seams = createChanceSeams(() => context({ boundary: 12 }), (draw) => draws.push(draw));
    const first = seams.npcRoll?.("gate:onEnter:Arin:0");
    const again = seams.npcRoll?.("gate:onEnter:Arin:0");
    expect(first).toBe(again);
    expect(draws.map((draw) => [draw.kind, draw.boundary, draw.unit])).toEqual([["npc", 12, first], ["npc", 12, first]]);
  });

  it("a re-entered boundary picks the same speaker", () => {
    const seams = createChanceSeams(() => context({ boundary: 5 }));
    const candidates = [{ rosterId: "a", name: "A", weight: 1 }, { rosterId: "b", name: "B", weight: 1 }, { rosterId: "c", name: "C", weight: 1 }];
    const pick = () => chooseByRules({ no_repeat: false }, candidates, { lastSpeakerRosterId: null, random: seams.talkRandom?.() ?? undefined })?.rosterId;
    expect(pick()).toBe(pick());
  });

  it("control: the flag off installs seams that answer nothing, so today's Math.random path runs", () => {
    const port: SpikePort = { flags: defaultSpikeFlags, chatId: () => "chat-a", storyId: () => STORY_ID, boundary: () => 3, raw: () => raw };
    const published: unknown[] = [];
    const dispose = installSpikes(port, (debug) => published.push(debug));
    expect(chanceContext(port)).toBeNull();
    expect(spikeSeams.npcRoll?.("k")).toBeNull();
    expect(spikeSeams.talkRandom?.()).toBeNull();
    expect(spikeSeams.derive?.({ boundary: 1, activeCheckpointId: "gate", checkpointStartedBoundary: 0 })).toEqual([]);
    dispose();
    expect(spikeSeams.npcRoll).toBeUndefined();
    expect(published[published.length - 1]).toBeUndefined();
  });

  it("the flag on installs the seeded seams", () => {
    const port: SpikePort = { flags: () => ({ ...defaultSpikeFlags(), sp7Chance: true }), chatId: () => "chat-a", storyId: () => STORY_ID, boundary: () => 3, raw: () => raw };
    const dispose = installSpikes(port, () => undefined);
    expect(spikeSeams.npcRoll?.("k")).toBe(npcRollDraw({ chatId: "chat-a", storyId: STORY_ID }, 3, "k"));
    expect(spikeSeams.derive?.({ boundary: 1, activeCheckpointId: "gate", checkpointStartedBoundary: 0 }).map((delta) => delta.q)).toEqual(["lock_gives", "clue_die"]);
    dispose();
  });
});
