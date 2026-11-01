import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryOrThrow } from "@engine/index";
import { unitDraw } from "@engine/chance";
import { checkGateValues } from "../storyCheckDraws";
import {
  CLOCK_DEPTH, CLOCK_KEY, clockPressure, clockStates, createClockSeam, deriveClockTicks, readStoryClocks, type ClockInput,
} from "./checkClocks";

const raw = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/spikes/check-clocks.story.json"), "utf8"));
const story = parseStoryOrThrow(raw);
const clocks = readStoryClocks(raw);
const IDS = { chatId: "clock-chat", storyId: "spike-check-clocks" };
const BOUNDARIES = 120;
const CUTS = 60;
const SEEDS = [3, 11, 23, 41];

const freshEngine = () => {
  const engine = new StoryEngine({ now: () => 0, derive: (view) => checkGateValues(story, IDS, view) });
  engine.loadStory(story);
  return engine;
};

const drive = (engine: StoryEngine, seed: number, from: number, to: number) => {
  for (let index = from; index < to; index += 1) {
    const away = unitDraw(["clock-away", seed, index]) < 0.3;
    const tried = unitDraw(["clock-tried", seed, index]) < 0.6;
    engine.enqueue({
      source: "extractor", blackboardVersionSum: 0, turnRange: { from: index, to: index },
      deltas: [{ q: "away", v: away, source: "extractor" }, { q: "tried", v: tried, source: "extractor" }],
    });
    engine.commitBoundary({ lastMessageId: index, chatLength: index + 1 });
  }
};

const input = (engine: StoryEngine): ClockInput => ({ story, clocks, log: [...engine.stateLog] });

describe("spike checkClocks: authored clocks tick on check misses and carry a pressure line", () => {
  it("reads authored clocks: defaults, clamps, and drops clocks without a usable tick rule", () => {
    expect(clocks.map((clock) => clock.id)).toEqual(["alarm", "rust"]);
    expect(clocks[0]).toMatchObject({ size: 4, near: { at: 2 }, fullLine: "Someone has raised the alarm.", checkpoints: null });
    expect(clocks[1]?.ticksOn).toEqual([{ check: "lockpick", on: "miss", ticks: 2 }]);
    const read = readStoryClocks({ clocks: [
      { id: "a", ticks_on: [{ check: "x", on: "miss" }], near: { line: "Close." } },
      { id: "b", ticks_on: [{ check: "x", on: "fumble" }] },
      { id: "a", ticks_on: [{ check: "y", on: "weak" }] },
      { id: "c", size: 99, ticks_on: [{ check: "x", on: "weak" }] },
    ] });
    expect(read.map((clock) => [clock.id, clock.size, clock.near?.at ?? null])).toEqual([["a", 4, 3], ["c", 12, null]]);
    expect(readStoryClocks({})).toEqual([]);
  });

  it("the story with clocks still validates: clocks are a spike field the engine ignores", () => {
    expect(story.checkpointById.yard?.checks?.[0]?.id).toBe("sneak");
  });

  it("ticks once per check per visit on a matching outcome, never on a success", () => {
    const engine = freshEngine();
    drive(engine, SEEDS[0] as number, 0, BOUNDARIES);
    const ticks = deriveClockTicks(input(engine));
    expect(ticks.length).toBeGreaterThan(0);
    const keys = ticks.map((tick) => `${tick.clockId}:${tick.checkId}:${tick.visit}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const tick of ticks) {
      const entry = engine.stateLog.find((row) => row.boundary === tick.boundary);
      const values = entry?.evaluated ?? {};
      if (tick.checkId === "sneak") expect(values.sneak_degree).toBe(tick.outcome);
      else expect(values.picked).toBe(false);
    }
  });

  it("near line appears at the threshold and is replaced by the full line when the clock fills", () => {
    const entry = (boundary: number, degree: string, checkpoint = "yard") => ({
      at: 0, boundary, source: "gate" as const, fired: null, queue: { applied: [], discarded: [] },
      context: { lastMessageId: boundary, chatLength: boundary + 1 },
      before: { activeCheckpointId: checkpoint, checkpointStartedBoundary: boundary } as never,
      after: { activeCheckpointId: checkpoint } as never,
      evaluated: { sneaked: degree !== "miss", sneak_degree: degree, check_sneak_rolled: boundary },
    });
    const at = (degrees: string[]) => clockStates({ story, clocks, log: degrees.map((degree, index) => entry(index + 1, degree)) as never }).find((state) => state.id === "alarm");
    expect(at(["miss"])).toMatchObject({ filled: 1, near: false, line: null });
    expect(at(["miss", "strong", "weak"])).toMatchObject({ filled: 2, near: true, line: "The guards are starting to look this way." });
    expect(at(["miss", "weak", "miss", "miss", "miss"])).toMatchObject({ filled: 4, full: true, line: "Someone has raised the alarm." });
    const pressure = clockPressure({ story, clocks, log: ["miss", "miss"].map((degree, index) => entry(index + 1, degree)) as never });
    expect(pressure).toContain("The guards are starting to look this way.");
    expect(pressure).toContain("Do not narrate {{user}}'s own words or decisions.");
  });

  it("a clock scoped to checkpoints speaks only there", () => {
    const entry = (boundary: number, checkpoint: string) => ({
      at: 0, boundary, source: "gate" as const, fired: null, queue: { applied: [], discarded: [] },
      context: { lastMessageId: boundary, chatLength: boundary + 1 },
      before: { activeCheckpointId: "lane", checkpointStartedBoundary: boundary } as never,
      after: { activeCheckpointId: checkpoint } as never,
      evaluated: { picked: false },
    });
    const rust = (last: string) => clockStates({ story, clocks, log: [entry(1, "lane"), entry(2, last)] as never }).find((state) => state.id === "rust");
    expect(rust("lane")).toMatchObject({ filled: 4, near: true, line: "The lock is starting to jam." });
    expect(rust("yard")).toMatchObject({ filled: 4, near: true, line: null });
  });

  it("floor CK1: rollback ≡ replay, 0 mismatches over 4 seeds x 60 random cuts (clocks are derived from the log, no code key)", () => {
    let mismatches = 0;
    let filledSomewhere = 0;
    for (const seed of SEEDS) {
      const engine = freshEngine();
      drive(engine, seed, 0, BOUNDARIES);
      const original = JSON.stringify(clockStates(input(engine)));
      const originalTicks = deriveClockTicks(input(engine));
      if (clockStates(input(engine)).some((state) => state.filled > 0)) filledSomewhere += 1;
      for (let cut = 0; cut < CUTS; cut += 1) {
        const to = Math.floor(unitDraw(["clock-cut", seed, cut]) * BOUNDARIES);
        if (!engine.rollbackTo(to).ok) throw new Error(`rollback to ${to} refused`);
        const truncated = deriveClockTicks(input(engine));
        const prefixOk = JSON.stringify(truncated) === JSON.stringify(originalTicks.filter((tick) => tick.boundary <= to));
        drive(engine, seed, to, BOUNDARIES);
        if (!prefixOk || JSON.stringify(clockStates(input(engine))) !== original) mismatches += 1;
      }
    }
    expect(filledSomewhere).toBe(SEEDS.length);
    expect(mismatches).toBe(0);
  });

  it("seam: sets the pressure line late on a loud generation, clears on withheld and closed generations", () => {
    const calls: string[] = [];
    const prompt = { set: (key: string, text: string, depth: number) => calls.push(`set ${key} ${depth} ${text.slice(0, 18)}`), clear: (key: string) => calls.push(`clear ${key}`) };
    const engine = freshEngine();
    drive(engine, SEEDS[1] as number, 0, BOUNDARIES);
    const live = clockPressure(input(engine));
    const seam = createClockSeam(() => input(engine), prompt);
    seam({ kind: "opened", type: "normal", params: undefined });
    seam({ kind: "opened", type: "quiet", params: undefined });
    seam({ kind: "closed", reason: "rendered" });
    expect(live).not.toBeNull();
    expect(calls).toEqual([`set ${CLOCK_KEY} ${CLOCK_DEPTH} ${String(live).slice(0, 18)}`, `clear ${CLOCK_KEY}`]);
    const none: string[] = [];
    createClockSeam(() => null, { set: () => none.push("set"), clear: () => none.push("clear") })({ kind: "opened", type: "normal", params: undefined });
    expect(none).toEqual([]);
  });
});
