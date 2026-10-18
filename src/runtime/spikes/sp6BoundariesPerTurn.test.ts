import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryOrThrow, TENSION_CURRENT_KEY } from "@engine/index";
import { unitDraw } from "@engine/chance";
import { deriveReleases, readComplicationPools, type ComplicationRelease, type ReleaseInput } from "./sp6Complications";
import { complicationView } from "./install";
import { defaultSpikeSettings } from "../settingsModel";
import { playerTurnIds } from "../agencyRecovery";

const raw = JSON.parse(readFileSync(join(__dirname, "../../../test/scenarios/live-v25-09-sp6.story.json"), "utf8"));
const story = parseStoryOrThrow(raw);
const pools = readComplicationPools(raw);
const TURNS = 98;
const RATES = [1.0, 1.4, 1.5, 1.6];
const SEEDS = [5, 17, 29, 43];
const MAX_VOICES = 4;
const HOT_SHARE = 0.55;
const CUTS = 40;
const K3_SIZE = 20;

type Event = { kind: "user"; turn: number } | { kind: "reply"; turn: number; tension: number };

interface Plan {
  events: Event[];
  voices: number[];
}

const voicesFor = (seed: number, rate: number): number[] => {
  const voices = Array.from({ length: TURNS }, () => 1);
  const extra = Math.round(TURNS * rate) - TURNS;
  let draw = 0;
  for (let placed = 0; placed < extra; draw += 1) {
    const turn = Math.floor(unitDraw(["sp6-x5-voices", seed, rate, draw]) * TURNS);
    if (voices[turn] >= MAX_VOICES) continue;
    voices[turn] += 1;
    placed += 1;
  }
  return voices;
};

const tensionFor = (seed: number, turn: number, voice: number, flip: number): number => {
  const hot = unitDraw(["sp6-x5-heat", seed, turn]) < HOT_SHARE;
  const flipped = voice > 0 && unitDraw(["sp6-x5-flip", seed, turn, voice]) < flip;
  const level = unitDraw(["sp6-x5-level", seed, turn, voice]);
  return Number(((hot !== flipped) ? 0.5 + level * 0.4 : 0.05 + level * 0.35).toFixed(3));
};

const planFor = (seed: number, rate: number, flip = 0): Plan => {
  const voices = voicesFor(seed, rate);
  const events: Event[] = [];
  voices.forEach((count, turn) => {
    events.push({ kind: "user", turn });
    for (let voice = 0; voice < count; voice += 1) events.push({ kind: "reply", turn, tension: tensionFor(seed, turn, voice, flip) });
  });
  return { events, voices };
};

interface Run {
  engine: StoryEngine;
  chat: Array<{ is_user: boolean; mes: string }>;
  eventAtBoundary: Map<number, number>;
}

const play = (run: Run, plan: Plan, from: number) => {
  for (let index = from; index < plan.events.length; index += 1) {
    const event = plan.events[index];
    if (event.kind === "user") {
      run.chat.push({ is_user: true, mes: `We keep waiting, turn ${event.turn}.` });
      continue;
    }
    run.chat.push({ is_user: false, mes: `The hall stays quiet, turn ${event.turn}.` });
    run.engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: TENSION_CURRENT_KEY, v: event.tension, source: "extractor" }] });
    run.engine.commitBoundary({ lastMessageId: run.chat.length - 1, chatLength: run.chat.length });
    run.eventAtBoundary.set(run.engine.currentBoundary, index);
  }
};

const runPlan = (plan: Plan): Run => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const run: Run = { engine, chat: [{ is_user: false, mes: "The waystation hearth crackles." }], eventAtBoundary: new Map() };
  play(run, plan, 0);
  return run;
};

const inputOf = (run: Run, byTurn: boolean): ReleaseInput => {
  const base = { story, pools, log: [...run.engine.stateLog], shape: null };
  return byTurn ? { ...base, playerTurnIds: playerTurnIds(run.chat) } : base;
};

const turnOfBoundary = (run: Run, boundary: number): number => {
  const entry = run.engine.stateLog.find((candidate) => candidate.boundary === boundary);
  return entry ? playerTurnIds(run.chat).filter((id) => id <= entry.context.lastMessageId).length : -1;
};

const lastBoundaryOfTurn = (run: Run): Map<number, number> => {
  const last = new Map<number, number>();
  for (const entry of run.engine.stateLog) last.set(turnOfBoundary(run, entry.boundary), entry.boundary);
  return last;
};

interface Measure {
  releases: number;
  releasedTurns: number;
  sharedTurns: number;
  midChain: number;
  turns: number[];
}

const measure = (run: Run, releases: ComplicationRelease[]): Measure => {
  const turns = releases.map((release) => turnOfBoundary(run, release.boundary));
  const last = lastBoundaryOfTurn(run);
  const distinct = new Set(turns);
  return {
    releases: releases.length,
    releasedTurns: distinct.size,
    sharedTurns: releases.length - distinct.size,
    midChain: releases.filter((release, index) => last.get(turns[index]) !== release.boundary).length,
    turns,
  };
};

const table = (flip: number) => SEEDS.flatMap((seed) => RATES.map((rate) => {
  const run = runPlan(planFor(seed, rate, flip));
  const boundaries = run.engine.stateLog.length;
  return {
    seed,
    rate,
    boundaries,
    perTurn: Number((boundaries / TURNS).toFixed(2)),
    byBoundary: measure(run, deriveReleases(inputOf(run, false))),
    byTurn: measure(run, deriveReleases(inputOf(run, true))),
  };
}));

const brief = (rows: ReturnType<typeof table>) => rows.map(({ seed, rate, perTurn, byBoundary, byTurn }) => ({
  seed, rate, perTurn,
  boundaryRule: { releases: byBoundary.releases, releasedTurns: byBoundary.releasedTurns, sharedTurns: byBoundary.sharedTurns, midChain: byBoundary.midChain },
  turnRule: { releases: byTurn.releases, releasedTurns: byTurn.releasedTurns, sharedTurns: byTurn.sharedTurns, midChain: byTurn.midChain },
}));

describe("X5 / F4: the K3 release window under 1.0, 1.4, 1.5 and 1.6 committed boundaries per player turn", () => {
  const uniform = table(0);
  const flipping = table(0.15);

  it(`the simulation commits the stated boundaries per turn over ${TURNS} player turns`, () => {
    console.log(`X5 K3 sim (voices agree within a turn): ${JSON.stringify(brief(uniform))}`);
    console.log(`X5 K3 sim (15 % of later voices flip): ${JSON.stringify(brief(flipping))}`);
    for (const row of uniform) expect(row.boundaries).toBe(Math.round(TURNS * row.rate));
  });

  it("at one boundary per turn the player-turn rule releases exactly what the boundary rule does", () => {
    for (const seed of SEEDS) {
      const run = runPlan(planFor(seed, 1.0, 0.15));
      const strip = (releases: ComplicationRelease[]) => releases.map(({ boundary, checkpointId, id }) => ({ boundary, checkpointId, id }));
      expect(strip(deriveReleases(inputOf(run, true)))).toEqual(strip(deriveReleases(inputOf(run, false))));
    }
  });

  it("control: counting boundaries, multi-voice turns move the release turns, release mid-chain and put two releases in one turn", () => {
    const shifted = uniform.filter((row) => row.rate > 1).filter((row) => {
      const single = uniform.find((other) => other.seed === row.seed && other.rate === 1.0);
      return JSON.stringify(row.byBoundary.turns) !== JSON.stringify(single?.byBoundary.turns);
    });
    expect(shifted.length).toBe(SEEDS.length * (RATES.length - 1));
    expect(uniform.filter((row) => row.rate > 1).every((row) => row.byBoundary.releases > uniform.find((other) => other.seed === row.seed && other.rate === 1.0)!.byBoundary.releases)).toBe(true);
    expect(uniform.some((row) => row.byBoundary.midChain > 0)).toBe(true);
    expect(uniform.some((row) => row.byBoundary.sharedTurns > 0)).toBe(true);
    expect(SEEDS.some((seed) => new Set(uniform.filter((row) => row.seed === seed).map((row) => row.byBoundary.releasedTurns >= K3_SIZE)).size > 1)).toBe(true);
  });

  it("counting player turns, the release turns do not depend on the boundaries per turn when a turn's voices agree", () => {
    for (const seed of SEEDS) {
      const rows = uniform.filter((row) => row.seed === seed);
      const single = rows.find((row) => row.rate === 1.0)!;
      for (const row of rows) expect(row.byTurn.turns).toEqual(single.byTurn.turns);
    }
  });

  it("counting player turns, no turn ever holds two releases, at every rate and with disagreeing voices", () => {
    for (const row of [...uniform, ...flipping]) {
      expect(row.byTurn.sharedTurns).toBe(0);
      expect(row.byTurn.releasedTurns).toBe(row.byTurn.releases);
    }
  });

  it(`the K3 size (${K3_SIZE} released turns) reads the same at every rate under the player-turn rule`, () => {
    for (const seed of SEEDS) {
      const verdicts = uniform.filter((row) => row.seed === seed).map((row) => row.byTurn.releasedTurns >= K3_SIZE);
      expect(new Set(verdicts).size).toBe(1);
    }
  });

  it(`rollback + replay gives the same player-turn releases at 1.5 per turn, cuts mid-chain included: ${SEEDS.length} seeds x ${CUTS} cuts`, () => {
    const measured = SEEDS.map((seed) => {
      const plan = planFor(seed, 1.5, 0.15);
      const run = runPlan(plan);
      const original = deriveReleases(inputOf(run, true));
      const last = lastBoundaryOfTurn(run);
      const midChainBoundaries = new Set(run.engine.stateLog.map((entry) => entry.boundary).filter((boundary) => [...last.values()].indexOf(boundary) < 0));
      let mismatches = 0;
      let midChainCuts = 0;
      for (let cut = 0; cut < CUTS; cut += 1) {
        const boundaries = run.engine.stateLog.map((entry) => entry.boundary);
        const at = boundaries[Math.floor(unitDraw(["sp6-x5-cut", seed, cut]) * (boundaries.length - 1))];
        if (midChainBoundaries.has(at)) midChainCuts += 1;
        const chatLength = run.engine.stateLog.find((entry) => entry.boundary === at)!.context.chatLength;
        if (!run.engine.rollbackTo(at).ok) throw new Error(`rollback to ${at} was refused`);
        run.chat.length = chatLength;
        const truncated = deriveReleases(inputOf(run, true));
        play(run, plan, run.eventAtBoundary.get(at)! + 1);
        const replayed = deriveReleases(inputOf(run, true));
        if (JSON.stringify(truncated) !== JSON.stringify(original.filter((release) => release.boundary <= at)) || JSON.stringify(replayed) !== JSON.stringify(original)) mismatches += 1;
      }
      return { seed, releases: original.length, midChainCuts, mismatches };
    });
    console.log(`X5 replay at 1.5/turn: ${JSON.stringify(measured)}`);
    expect(measured.every((row) => row.releases > 0 && row.midChainCuts > 0)).toBe(true);
    expect(measured.every((row) => row.mismatches === 0)).toBe(true);
  });

  it("install: the view counts player turns when the port gives the chat", () => {
    const run = runPlan(planFor(5, 1.5));
    const port = { flags: () => ({ ...defaultSpikeSettings(), sp6Complications: true }), raw: () => raw, story: () => story, log: () => run.engine.stateLog, shape: () => null };
    const byTurn = complicationView({ ...port, chat: () => run.chat })!.releases;
    expect(byTurn).toEqual(deriveReleases(inputOf(run, true)));
    expect(complicationView(port)!.releases).toEqual(deriveReleases(inputOf(run, false)));
    expect(byTurn.map((release) => release.turn)).toEqual(measure(run, byTurn).turns);
  });
});
