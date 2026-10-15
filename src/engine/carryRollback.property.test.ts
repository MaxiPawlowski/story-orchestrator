import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine } from "./engine";
import { parseStoryV2OrThrow } from "./validate";
import { questClosedKey, standingKey, type CarryProjection, type CarryState, type PrimitiveValue } from "./schema";
import { carrySeed, carryValues, publicOutcome } from "./carry";
import { ROLLBACK_DETECTORS, rollbackMoved } from "./rollbackDetectors";

const read = (name: string) => parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}.story.json`), "utf8")));
const SOURCE = read("carry-source");
const SEQUEL = read("carry-sequel");

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const carried = (random: () => number): CarryState => {
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const values = {
    met_guild: random() < 0.7, ledger_seen: random() < 0.7, coast_fate: pick(["lit", "dark"]), harbour_mood: pick(["grateful", "bitter"]), coins: Math.floor(random() * 30),
    [questClosedKey("ledger")]: pick(["done", "failed"]), [standingKey("guild")]: Math.floor(random() * 11) - 5, secret_pact: pick(["sworn", "refused"]),
  };
  const projection: CarryProjection = { storyTitle: SOURCE.title, endingTitle: "The Last Lantern", outcome: publicOutcome(SOURCE, values, new Set(SEQUEL.carry_from?.map.map((entry) => entry.from))), lines: [] };
  return { fromChat: "a", fromStory: "ngp-source", sourceStoryHash: "h", mode: "sequel", projection, values: carryValues(SEQUEL, projection).values, previously: null, createdAt: "t" };
};

const drive = (engine: StoryEngine, random: () => number, turns: number) => {
  for (let turn = 0; turn < turns; turn += 1) {
    const message = turn * 2 + 1;
    const deltas: Array<{ q: string; v: PrimitiveValue; source: "extractor" }> = [];
    if (random() < 0.4) deltas.push({ q: "guild_trust", v: Math.floor(random() * 9) - 4, source: "extractor" });
    if (random() < 0.3) deltas.push({ q: "arrived", v: true, source: "extractor" });
    if (random() < 0.2) deltas.push({ q: "harbour_feeling", v: "unsure", source: "extractor" });
    if (deltas.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas, turnRange: { from: message - 1, to: message } });
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  }
};

const state = (engine: StoryEngine) => {
  const { checkpointStartedAt: _at, ...rest } = engine.serialize();
  return rest;
};

describe("v2.8 plan 45 N1: a carried start equals the same start authored", () => {
  it("over 200 generated cases, after replay, after rollback to boundary 0 and after a reload", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const carry = carried(rng(seed));
      const { seed: values } = carrySeed(SEQUEL, carry);
      const authored = Object.fromEntries(carry.values.map((value) => [value.key, value.value]));
      const viaCarry = new StoryEngine({ now: () => 0 });
      const viaAuthored = new StoryEngine({ now: () => 0 });
      viaCarry.loadStory(SEQUEL, values);
      viaAuthored.loadStory(SEQUEL, authored);
      const start = state(viaCarry);
      expect(start).toEqual(state(viaAuthored));
      const turns = 1 + Math.floor(rng(seed * 7)() * 8);
      drive(viaCarry, rng(seed * 31), turns);
      drive(viaAuthored, rng(seed * 31), turns);
      expect(state(viaCarry)).toEqual(state(viaAuthored));
      const reloaded = new StoryEngine({ now: () => 0 });
      reloaded.loadStory(SEQUEL);
      reloaded.hydrate(viaCarry.serialize(), viaCarry.serializeHistory());
      expect(state(reloaded)).toEqual(state(viaCarry));
      expect(viaCarry.rollbackTo(0)).toEqual({ ok: true, result: "applied" });
      viaAuthored.rollbackTo(0);
      reloaded.rollbackTo(0);
      expect(state(viaCarry)).toEqual(start);
      expect(state(viaAuthored)).toEqual(start);
      expect(state(reloaded)).toEqual(start);
      for (const value of carry.values) expect(viaCarry.serialize().blackboard.values[value.key]).toBe(value.value);
    }
  });

  it("heritage keys have a rollback detector; a code-only boundary that moves one is seen", () => {
    const detector = ROLLBACK_DETECTORS.find((entry) => entry.id === "heritage");
    expect(detector?.keys(SEQUEL).sort()).toEqual(["heritage_coast", "heritage_coins", "heritage_ledger"]);
    expect(rollbackMoved(SEQUEL, { heritage_coins: 3 }, { heritage_coins: 4 })).toBe(true);
    expect(rollbackMoved(SEQUEL, { heritage_coins: 3, guild_trust: 1 }, { heritage_coins: 3, guild_trust: 1 })).toBe(false);
    expect(rollbackMoved(SOURCE, { heritage_coins: 3 }, { heritage_coins: 4 })).toBe(false);
  });
});
