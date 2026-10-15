import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";
import { questClosedKey, standingKey, type CarryProjection, type CarryState, type NormalizedStoryV2, type PrimitiveValue, type ValidationError } from "./schema";
import { carryKnownLines, carrySeed, carryValues, outcomeLine, publicOutcome, sagaOutcomeLines } from "./carry";
import { checkCarryPair, progressKeys } from "./validate/carry";

const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}.story.json`), "utf8")) as Record<string, unknown>;
const SOURCE_RAW = read("carry-source");
const SEQUEL_RAW = read("carry-sequel");
const SOURCE = parseStoryV2OrThrow(SOURCE_RAW);
const SEQUEL = parseStoryV2OrThrow(SEQUEL_RAW);

type Raw = Record<string, unknown>;
const clone = (raw: Raw): Raw => JSON.parse(JSON.stringify(raw)) as Raw;
const errorsOf = (raw: Raw): ValidationError[] => {
  const parsed = parseStoryV2(raw);
  return Array.isArray(parsed) ? parsed : [];
};
const map = (raw: Raw) => (raw.carry_from as { map: Raw[] }).map;
const quality = (raw: Raw, key: string) => (raw.qualities as Raw[]).find((entry) => entry.key === key) as Raw;

const END: Record<string, PrimitiveValue> = {
  met_guild: true, lantern_relit: true, ledger_seen: true, ledger_found: true, coast_fate: "lit", harbour_mood: "grateful", coins: 7,
  [questClosedKey("ledger")]: "done", [standingKey("guild")]: 3, secret_pact: "sworn", pact_hidden: true,
};

const projectionOf = (values: Record<string, unknown>, source: NormalizedStoryV2 = SOURCE, target: NormalizedStoryV2 = SEQUEL): CarryProjection => ({
  storyTitle: source.title, endingTitle: "The Last Lantern",
  outcome: publicOutcome(source, values, new Set(target.carry_from?.map.map((entry) => entry.from))), lines: [],
});

const stateOf = (projection: CarryProjection, target: NormalizedStoryV2 = SEQUEL): CarryState => ({
  fromChat: "chat-a", fromStory: "ngp-source", sourceStoryHash: "h", mode: "sequel", projection, values: carryValues(target, projection).values, previously: null, createdAt: "t",
});

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

describe("v2.8 plan 45: outcome and carry_from validate", () => {
  it("parses the source outcome and the sequel carry", () => {
    expect(SOURCE.outcome?.map((entry) => entry.key)).toEqual(["coast_fate", "harbour_mood", "coins", "quest_ledger_closed", "rep_guild", "secret_pact"]);
    expect(SEQUEL.carry_from).toMatchObject({ story: "ngp-source", mode: "sequel", default: "snapshot" });
    expect(checkCarryPair(SOURCE, SEQUEL, "import")).toEqual([]);
  });

  const local: Array<[string, (raw: Raw) => void, RegExp]> = [
    ["unknown target key", (raw) => { map(raw)[0].to = "heritage_nowhere"; }, /not a quality of this story, so nothing could receive/],
    ["heritage into a non-heritage key", (raw) => { map(raw)[3].as = "heritage"; }, /lands in a heritage_ quality.*never stands in for progress/],
    ["code-sourced state target", (raw) => { map(raw)[3].to = "heritage_coins"; map(raw).splice(2, 1); }, /heritage key: carry into it with as: heritage; the value cannot carry/],
    ["life target key", (raw) => {
      (raw.qualities as Raw[]).push({ key: "rel_mara_player_trust", type: "int", source: "extractor", rubric: "x" });
      map(raw)[3].to = "rel_mara_player_trust";
    }, /recomputed by character life.*cannot carry/],
    ["known_by outside the roster", (raw) => { map(raw)[0].known_by = ["tom"]; }, /'tom' is not in this story's roster, so nobody would know it/],
    ["heritage quality not code", (raw) => { quality(raw, "heritage_coins").source = "extractor"; }, /heritage key: its source is code/],
    ["heritage quality nothing carries into", (raw) => { (raw.qualities as Raw[]).push({ key: "heritage_orphan", type: "bool", source: "code", rubric: "x" }); }, /nothing carries into 'heritage_orphan'/],
    ["heritage written by a state_snapshot", (raw) => { (raw.checkpoints as Raw[])[0].state_snapshot = { heritage_coins: 3 }; }, /written only by a carry, never by a state_snapshot/],
    ["sequel naming itself", (raw) => { (raw.carry_from as Raw).story = "ngp-sequel"; }, /carrying from itself is a replay/],
    ["duplicate receiving key", (raw) => { map(raw)[4].to = "guild_trust"; }, /already receives a carried value/],
    ["outcome code key", (raw) => { raw.outcome = [{ key: "heritage_coins" }]; }, /written by code.*nothing of it can carry/],
  ];

  it.each(local)("N2 refuses %s at import with a consequence line", (_name, plant, message) => {
    const raw = clone(SEQUEL_RAW);
    plant(raw);
    expect(errorsOf(raw).map((error) => error.message).join("\n")).toMatch(message);
  });

  const pair: Array<[string, (source: Raw, target: Raw) => void, RegExp]> = [
    ["unknown source key", (source) => { source.qualities = (source.qualities as Raw[]).filter((entry) => entry.key !== "coins"); source.outcome = (source.outcome as Raw[]).filter((entry) => entry.key !== "coins"); },
      /'coins' is not a quality of 'ngp-source'/],
    ["mapped key not in the source outcome", (source) => { source.outcome = (source.outcome as Raw[]).filter((entry) => entry.key !== "harbour_mood"); }, /'harbour_mood' is not in the outcome/],
    ["type mismatch", (_source, target) => { quality(target, "guild_trust").type = "bool"; }, /'rep_guild' is int but 'guild_trust' is bool/],
    ["enum value the target does not declare", (_source, target) => { quality(target, "harbour_feeling").values = ["grateful", "unsure"]; }, /'harbour_feeling' does not declare 'bitter'/],
  ];

  it.each(pair)("N2 refuses %s at import (source in the library) and at pick time (pinned source), each with its consequence", (_name, plant, message) => {
    const source = clone(SOURCE_RAW);
    const target = clone(SEQUEL_RAW);
    plant(source, target);
    const parsedSource = parseStoryV2OrThrow(source);
    const parsedTarget = parseStoryV2OrThrow(target);
    const atImport = checkCarryPair(parsedSource, parsedTarget, "import").map((error) => error.message).join("\n");
    const atPick = checkCarryPair(parsedSource, parsedTarget, "pick").map((error) => error.message).join("\n");
    expect(atImport).toMatch(message);
    expect(atImport).toMatch(/this story cannot carry from it until that is fixed/);
    expect(atPick).toMatch(message);
    expect(atPick).toMatch(/this run is not offered/);
  });

  it("refuses a source of another id at either timing", () => {
    const other = parseStoryV2OrThrow({ ...clone(SOURCE_RAW), id: "ngp-other" });
    expect(checkCarryPair(other, SEQUEL, "pick")[0].message).toMatch(/the earlier story is 'ngp-other', not 'ngp-source'; this run is not offered/);
  });
});

describe("v2.8 plan 45: the public outcome", () => {
  it("renders only what the player saw at the end", () => {
    const lines = publicOutcome(SOURCE, END);
    expect(lines.map((line) => line.label)).toEqual([
      "You relit the Lantern Coast.", "The harbour is grateful to you.", "Coins: 7", "The keeper's ledger: done", "The Lamplighters: Trusted",
    ]);
    const hidden = { ...END, ledger_seen: false, met_guild: false };
    expect(publicOutcome(SOURCE, hidden).map((line) => line.key)).toEqual(["coast_fate", "harbour_mood", "coins"]);
    expect(outcomeLine(SOURCE, { key: "secret_pact" }, END)).toBeNull();
  });

  it("N8 property: no unmapped, quiet, unlabelled or hidden value reaches the projection or the saga lines (400 random endings)", () => {
    const random = rng(45);
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
    for (let run = 0; run < 400; run += 1) {
      const values: Record<string, unknown> = {
        met_guild: random() < 0.5, ledger_seen: random() < 0.5, coast_fate: pick(["lit", "dark"]), harbour_mood: pick(["grateful", "bitter"]), coins: Math.floor(random() * 20),
        [questClosedKey("ledger")]: pick(["done", "failed", undefined]), [standingKey("guild")]: Math.floor(random() * 11) - 5,
        secret_pact: pick(["sworn", "refused"]), pact_hidden: random() < 0.5, tension: pick(["calm", "peak"]),
      };
      const projection = JSON.stringify([projectionOf(values), sagaOutcomeLines(SOURCE, values)]);
      expect(projection).not.toMatch(/secret_pact|pact_hidden|sworn|refused|tension|peak|calm/);
      if (!values.ledger_seen) expect(projection).not.toMatch(/ledger/i);
      if (!values.met_guild) expect(projection).not.toMatch(/Lamplighters|rep_guild/);
      expect(projection).not.toMatch(/"value":-?\d+,"label":"The Lamplighters: -?\d/);
    }
  });
});

describe("v2.8 plan 45: carried values", () => {
  it("N9: known_by reaches only named present members of the changed roster; heritage keys are never refused for a missing member", () => {
    const state = stateOf(projectionOf(END));
    const known = Object.fromEntries(state.values.map((value) => [value.key, value.knownBy]));
    expect(known).toEqual({
      heritage_coast: ["mara"], heritage_ledger: [], heritage_coins: ["mara", "kel", "narrator"], guild_trust: [], harbour_feeling: ["kel", "mara"],
    });
    expect(carryKnownLines(state, "tom")).toEqual([]);
    expect(carryKnownLines(state, "mara")).toEqual([
      "- From an earlier story, you know: You relit the Lantern Coast.", "- From an earlier story, you know: Coins: 7", "- From an earlier story, you know: The harbour is grateful to you.",
    ]);
    expect(carryKnownLines(state, "kel").every((line) => !/secret|pact/i.test(line))).toBe(true);
  });

  it("a value the player did not see stays at the story's own start, said why", () => {
    const { values, skipped } = carryValues(SEQUEL, projectionOf(END));
    expect(values.map((value) => value.key)).not.toContain("pact_state");
    expect(skipped).toEqual([{ key: "pact_state", reason: "'secret_pact' was not shown to the player at the end, so 'pact_state' starts as the story wrote it" }]);
  });

  it("N10: a replay carries heritage only; every planted progress mapping is refused; the carry writes no progress key", () => {
    const replay = clone(SOURCE_RAW);
    (replay.qualities as Raw[]).push({ key: "heritage_coast", type: "enum", values: ["lit", "dark"], source: "code", rubric: "earlier run" });
    replay.carry_from = { story: "ngp-source", mode: "replay", map: [{ from: "coast_fate", to: "heritage_coast", as: "heritage" }] };
    const story = parseStoryV2OrThrow(replay);
    const planted: Array<[Raw, RegExp]> = [
      [{ ...(replay.carry_from as Raw), map: [...map(replay), { from: "lantern_relit", to: "met_guild", as: "state" }] }, /a replay carries heritage values only/],
      [{ ...(replay.carry_from as Raw), replay_map: ["met_guild"], map: [...map(replay), { from: "lantern_relit", to: "met_guild", as: "state" }] }, /read by a transition, quest or milestone gate/],
      [{ ...(replay.carry_from as Raw), replay_map: ["ledger_found"], map: [...map(replay), { from: "lantern_relit", to: "ledger_found", as: "state" }] }, /read by a transition, quest or milestone gate/],
      [{ ...(replay.carry_from as Raw), story: "ngp-sequel" }, /a replay carries from this same story/],
    ];
    for (const [carry, message] of planted) expect(errorsOf({ ...clone(replay), carry_from: carry }).map((error) => error.message).join("\n")).toMatch(message);
    const allowed = { ...clone(replay), carry_from: { ...(replay.carry_from as Raw), replay_map: ["coins"], map: [...map(replay), { from: "coins", to: "coins", as: "state" }] } };
    expect(errorsOf(allowed)).toEqual([]);
    const progress = progressKeys(story);
    const { values } = carryValues(story, projectionOf(END, SOURCE, story));
    expect(values.map((value) => value.key)).toEqual(["heritage_coast"]);
    expect(values.filter((value) => progress.has(value.key))).toEqual([]);
  });

  it("N4: a key removed or retyped after the run is dropped with a reason, never written", () => {
    const state = stateOf(projectionOf(END));
    const edited = clone(SEQUEL_RAW);
    edited.qualities = (edited.qualities as Raw[]).filter((entry) => entry.key !== "heritage_coins");
    map(edited).splice(2, 1);
    quality(edited, "guild_trust").type = "bool";
    quality(edited, "harbour_feeling").values = ["bitter", "unsure"];
    const { seed, dropped } = carrySeed(parseStoryV2OrThrow(edited), state);
    expect(Object.keys(seed).sort()).toEqual(["heritage_coast", "heritage_ledger"]);
    expect(dropped.map((skip) => skip.key).sort()).toEqual(["guild_trust", "harbour_feeling", "heritage_coins"]);
    expect(dropped.every((skip) => skip.reason.length > 10)).toBe(true);
    expect(carrySeed(SEQUEL, state)).toMatchObject({ dropped: [], seed: { heritage_coast: "lit", heritage_ledger: "done", heritage_coins: 7, guild_trust: 3, harbour_feeling: "grateful" } });
  });
});
