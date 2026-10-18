import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine } from "../engine";
import { Blackboard } from "../blackboard";
import { parseStory, parseStoryOrThrow } from "../validate";
import { factionMoveKey, seenStandingKey, standingKey, type NormalizedStory, type PrimitiveValue, type ValidationError } from "../schema";
import { applyFactionMoves, factionDirectorLines, factionMemberLines, factionsMoved, standingView, DIRECTOR_INTRODUCE, factionLatches } from "./standing";
import { ROLLBACK_DETECTORS } from "../rollbackDetectors";
import { privateLifeLines } from "../life/lines";
import { FACTION_MOVE_ON_INACTION } from "../validate/factions";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/factions.story.json"), "utf8")) as Record<string, unknown>;
const STORY = parseStoryOrThrow(RAW);

const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(RAW)) as Record<string, unknown>;
const errorsOf = (raw: Record<string, unknown>): ValidationError[] => {
  const parsed = parseStory(raw);
  return Array.isArray(parsed) ? parsed : [];
};
const guildMoves = (raw: Record<string, unknown>) => ((raw.factions as Array<Record<string, unknown>>)[0].moves as Array<Record<string, unknown>>);

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const play = (story: NormalizedStory = STORY) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  let message = -1;
  const turn = (deltas: Record<string, PrimitiveValue> = {}) => {
    message += 2;
    const entries = Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const }));
    if (entries.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: entries, turnRange: { from: message - 1, to: message } });
    return engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  };
  return { engine, turn, values: () => engine.serialize().blackboard.values };
};

describe("v2.8 plan 53: factions validate", () => {
  it("compiles standing, what each member heard and a record per move as code ints seeded at start", () => {
    expect(STORY.qualityByKey[standingKey("guild")]).toMatchObject({ type: "int", source: "code", range: [-5, 5], step_rule: { start: 0 } });
    expect(STORY.qualityByKey[seenStandingKey("guild", "mara")]).toBeDefined();
    expect(STORY.qualityByKey[seenStandingKey("guild", "sera")]).toBeUndefined();
    expect(STORY.qualityByKey[factionMoveKey("guild", "saved")]).toMatchObject({ monotonic: true });
    expect(new Blackboard(STORY).get(standingKey("guild"))).toBe(0);
  });

  it("F8: refuses a planted punitive move on an unmet request, and every other inaction shape", () => {
    const planted = clone();
    guildMoves(planted).push({ id: "ignored", when: { q: "apprentice_saved", op: "==", v: false }, add: -2 });
    expect(errorsOf(planted).some((error) => error.message.startsWith(FACTION_MOVE_ON_INACTION) && error.message.includes("apprentice_saved"))).toBe(true);
    const shapes = [
      { not: { q: "apprentice_saved", op: "==", v: true } },
      { q: "message_count", op: ">=", v: 10 },
      { all: [{ q: "messages_in_checkpoint", op: ">=", v: 4 }, { q: "elapsed", op: ">", v: 60 }] },
      { all: [{ q: "met_guild", op: "==", v: true }, { q: "apprentice_saved", op: "!=", v: true }] },
    ];
    for (const when of shapes) {
      const raw = clone();
      guildMoves(raw).push({ id: "punish", when, add: -1 });
      expect(errorsOf(raw).some((error) => error.message.startsWith(FACTION_MOVE_ON_INACTION))).toBe(true);
    }
    const fine = clone();
    guildMoves(fine).push({ id: "ignored", when: { q: "apprentice_saved", op: "==", v: false }, add: 1 });
    expect(errorsOf(fine).some((error) => error.message.startsWith(FACTION_MOVE_ON_INACTION))).toBe(false);
  });

  it("refuses unknown membership, too many factions, a public or authored standing, a reward on a derived key and a gate open at start", () => {
    const cases: Array<[(raw: Record<string, unknown>) => void, string]> = [
      [(raw) => { (raw.roster as Array<Record<string, unknown>>)[1].factions = ["thieves"]; }, "unknown faction 'thieves'"],
      [(raw) => { (raw.roster as Array<Record<string, unknown>>)[1].factions = ["guild", "crown", "guild"]; }, "listed twice"],
      [(raw) => { (raw.qualities as unknown[]).push({ key: "rep_x", type: "int", source: "code", rubric: "x" }); }, "kept for faction standing"],
      [(raw) => { ((raw.quests as Array<Record<string, Record<string, Record<string, unknown>>>>)[0].reward.set)[seenStandingKey("guild", "mara")] = { add: 1 }; }, "never what a member heard"],
      [(raw) => { guildMoves(raw).push({ id: "early", when: { q: "rep_crown", op: ">=", v: 0 }, add: 1 }); }, "holds before anything happens, so it would fire at once"],
      [(raw) => { guildMoves(raw).push({ id: "bad_id", when: { q: "met_guild", op: "==", v: true }, add: 1 }); }, "lowercase slug without underscores"],
      [(raw) => { guildMoves(raw).push({ id: "huge", when: { q: "met_guild", op: "==", v: true }, add: 11 }); }, "at most 10 either way"],
    ];
    for (const [plant, message] of cases) {
      const raw = clone();
      plant(raw);
      expect(errorsOf(raw).map((error) => error.message).join("\n")).toContain(message);
    }
  });

  it("refuses a roster widget row naming an unknown faction, and accepts a known one", () => {
    const raw = clone();
    raw.widgets = [{ id: "groups", kind: "roster", title: "Groups", audience: "player", rows: [{ id: "g", label: "The Guild", faction: "guild" }, { id: "t", label: "Thieves", faction: "thieves" }] }];
    expect(errorsOf(raw).map((error) => error.message)).toContain("unknown faction 'thieves'");
    (raw.widgets as Array<{ rows: unknown[] }>)[0].rows.pop();
    expect(errorsOf(raw)).toEqual([]);
  });
});

describe("v2.8 plan 53: standing moves on authored events only", () => {
  it("F3: each move adds exactly once ever across gate flapping (property over 200 seeds)", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = rng(seed);
      const run = play();
      let adds = 0;
      for (let at = 0; at < 30; at += 1) {
        const saved = random() < 0.5;
        const before = run.values()[factionMoveKey("guild", "saved")];
        run.turn({ apprentice_saved: saved });
        if (before === undefined && run.values()[factionMoveKey("guild", "saved")] !== undefined) adds += 1;
      }
      const fired = run.values()[factionMoveKey("guild", "saved")] !== undefined;
      expect(adds).toBe(fired ? 1 : 0);
      expect(run.values()[standingKey("guild")]).toBe(fired ? 2 : 0);
    }
  });

  it("F10: every writer keeps standing inside its range, and a move's record exists iff its add applied (1,000 sequences)", () => {
    const story = parseStoryOrThrow({ ...clone(), quests: [] });
    for (let seed = 1; seed <= 1000; seed += 1) {
      const random = rng(seed * 7919);
      const blackboard = new Blackboard(story);
      for (let at = 0; at < 8; at += 1) {
        const roll = random();
        if (roll < 0.3) blackboard.applyDelta({ q: standingKey("crown"), v: Math.round(random() * 40 - 20), source: "code" });
        else if (roll < 0.5) blackboard.applyDelta({ q: "envoy_helped", v: random() < 0.5, source: "extractor" });
        else if (roll < 0.7) blackboard.applyDelta({ q: standingKey("guild"), v: Number(blackboard.get(standingKey("guild")) ?? 0) + Math.round(random() * 30 - 15), source: "code" });
        else {
          const key = ["apprentice_saved", "ledger_stolen", "debt_paid"][Math.floor(random() * 3)];
          blackboard.applyDelta({ q: key, v: true, source: key === "debt_paid" ? "code" : "extractor" });
        }
        const before = { ...blackboard.entries() };
        const fired = applyFactionMoves(story, blackboard, at + 1);
        const after = blackboard.entries();
        for (const faction of story.factions ?? []) {
          const value = after[standingKey(faction.id)];
          expect(typeof value === "number" && value >= faction.range[0] && value <= faction.range[1]).toBe(true);
          for (const move of faction.moves) {
            const latched = before[factionMoveKey(faction.id, move.id)] === undefined && after[factionMoveKey(faction.id, move.id)] !== undefined;
            expect(latched).toBe(fired.some((entry) => entry.faction === faction.id && entry.move === move.id));
          }
        }
      }
    }
  });

  it("the SC2 latch writer (factionLatches) writes exactly what the atomic pass writes (200 seeds)", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = rng(seed * 13);
      const values: Record<string, PrimitiveValue> = { ...new Blackboard(STORY).entries(), [standingKey("guild")]: Math.round(random() * 10 - 5) + 0, location: ["hall", "docks"][Math.floor(random() * 2)] };
      for (const key of ["apprentice_saved", "ledger_stolen", "envoy_helped", "debt_paid"]) if (random() < 0.5) values[key] = true;
      const direct = new Blackboard(STORY, { values: { ...values }, versions: {}, latched: {} });
      applyFactionMoves(STORY, direct, 3);
      const viaWriter = new Blackboard(STORY, { values: { ...values }, versions: {}, latched: {} });
      factionLatches(STORY, { boundary: 3, values }).forEach((delta) => viaWriter.applyDelta({ ...delta, source: "code" }));
      expect(viaWriter.entries()).toEqual(direct.entries());
    }
  });

  it("a quest reward {add} lands before the latch pass, so a reward can earn a move in the same boundary (SC2 step 4 then 5)", () => {
    const run = play();
    run.turn({ debt_found: true });
    expect(run.values().debt_paid).toBe(true);
    expect(run.values()[factionMoveKey("guild", "paid")]).toBe(1);
    expect(run.values()[standingKey("guild")]).toBe(2);
  });

  it("the latch pass runs again after a fired transition (SC2 step 7)", () => {
    const raw = clone();
    guildMoves(raw).push({ id: "arrived", when: { q: "progress_toward_street", op: ">=", v: 0.5 }, add: 1 });
    raw.transitions = [{ from: "hall", to: "street", gate: { q: "left_hall", op: "==", v: true }, priority: 1, effects: { progress: { anchor: "street", amount: 0.5 } } }];
    const run = play(parseStoryOrThrow(raw));
    const result = run.turn({ left_hall: true });
    expect(result.fired?.to).toBe("street");
    expect(run.values()[factionMoveKey("guild", "arrived")]).toBe(1);
  });

  it("clamps a display-bounded int on every writer, so the player view is the blackboard (one clamp)", () => {
    const story = parseStoryOrThrow({
      title: "Clamp", description: "d", roster: [], transitions: [],
      checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true }],
      qualities: [
        { key: "supplies", type: "int", source: "extractor", rubric: "r", display: { public: true, label: "Supplies", as: "meter", min: 0, max: 10 } },
        { key: "coins", type: "int", source: "code", rubric: "r", display: { public: true, label: "Coins", as: "meter", min: 0, max: 5 } },
        { key: "found", type: "bool", source: "extractor", rubric: "r" },
      ],
      quests: [{ id: "q", title: "Q", kind: "side", done_when: { q: "found", op: "==", v: true }, steps: [], reward: { set: { coins: { add: 9 } } } }],
    });
    expect(story.qualityByKey.supplies.range).toEqual([0, 10]);
    const blackboard = new Blackboard(story);
    expect(blackboard.applyDelta({ q: "supplies", v: 14, source: "extractor" })).toMatchObject({ ok: true, value: 10, clamped: true });
    expect(blackboard.applyDelta({ q: "supplies", v: 4, source: "extractor" })).not.toHaveProperty("clamped");
    const run = play(story);
    run.turn({ found: true });
    expect(run.values().coins).toBe(5);
  });
});

describe("v2.8 plan 53: who hears, and who is told", () => {
  it("F13: a member away at a present-only move keeps its band; a faction-wide move reaches every member", () => {
    const run = play();
    run.turn({ met_guild: true, location: "docks" });
    run.turn({ ledger_stolen: true });
    const values = run.values();
    expect(values[standingKey("guild")]).toBe(-3);
    expect(values[seenStandingKey("guild", "tom")]).toBe(-3);
    expect(values[seenStandingKey("guild", "mara")]).toBe(0);
    expect(factionMemberLines(STORY, values, "mara")[0]).toContain("Neutral");
    expect(factionMemberLines(STORY, values, "tom")[0]).toContain("Hostile");
    run.turn({ apprentice_saved: true });
    expect(run.values()[seenStandingKey("guild", "mara")]).toBe(2);
    expect(run.values()[seenStandingKey("guild", "tom")]).toBe(-1);
  });

  it("F6: only members of a faction receive its line, after their own feelings, as a word and never a number (property)", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const random = rng(seed);
      const run = play();
      for (let at = 0; at < 8; at += 1) run.turn({ [["apprentice_saved", "ledger_stolen", "envoy_helped", "met_guild"][Math.floor(random() * 4)]]: true });
      const values = run.values();
      for (const member of STORY.roster) {
        const block = privateLifeLines(STORY, values, member.id);
        expect(block.includes("The Guild")).toBe(member.factions?.includes("guild") === true);
        expect(block.includes("The Silver Crown")).toBe(member.factions?.includes("crown") === true);
        expect(block).not.toMatch(/-?\d/);
      }
    }
  });

  it("F11: the director gets visible factions' bands; a hidden one only with introduce, and then only its name", () => {
    const values = { ...new Blackboard(STORY).entries(), met_guild: true };
    expect(factionDirectorLines(STORY, values)).toEqual(["The Guild: Neutral"]);
    const introduced = parseStoryOrThrow({ ...clone(), factions: (clone().factions as Array<Record<string, unknown>>).map((faction) => (faction.id === "crown" ? { ...faction, introduce: true } : faction)) });
    const lines = factionDirectorLines(introduced, values);
    expect(lines).toEqual(["The Guild: Neutral", `The Silver Crown: ${DIRECTOR_INTRODUCE}`]);
    expect(lines.join("\n")).not.toMatch(/Distrusts|Watches|Favours|Sera|envoy/);
  });

  it("F1/F2: the player projection is band words of visible factions only, never a number", () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const random = rng(seed * 31);
      const values: Record<string, PrimitiveValue> = {
        [standingKey("guild")]: Math.round(random() * 10 - 5), [standingKey("crown")]: Math.round(random() * 6 - 3), met_guild: random() < 0.5, met_crown: random() < 0.3,
      };
      const view = standingView(STORY, values);
      expect(JSON.stringify(view)).not.toMatch(/\d/);
      expect(view.map((row) => row.name)).toEqual([...(values.met_guild ? ["The Guild"] : []), ...(values.met_crown ? ["The Silver Crown"] : [])]);
    }
    expect(standingView({ ...STORY, display: { standing: false } }, { met_guild: true })).toEqual([]);
  });
});

describe("v2.8 plan 53 F4 (SC1): standing rolls back with the boundary and replays identically", () => {
  it("a code-only boundary (the only change is a move) is seen by the rollback detector", () => {
    const run = play();
    run.turn({ met_guild: true });
    run.engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "ledger_stolen", v: true, source: "extractor" }], turnRange: { from: 0, to: 1 } });
    run.engine.commitBoundary({ lastMessageId: 5, chatLength: 6 });
    const entry = run.engine.stateLog.at(-1);
    expect(entry && factionsMoved(STORY, entry.before.blackboard.values, entry.after.blackboard.values)).toBe(true);
    expect(ROLLBACK_DETECTORS.find((detector) => detector.id === "factions")?.moved(STORY, { rep_guild: 0 }, { rep_guild: -3 })).toBe(true);
    expect(run.engine.shouldRollbackFromMessage(4)).toBe(true);
    const story = parseStoryOrThrow({ ...clone(), factions: undefined, roster: (clone().roster as Array<Record<string, unknown>>).map(({ factions: _f, ...member }) => member), quests: [] });
    expect(factionsMoved(story, { rep_guild: 0 }, { rep_guild: 1 })).toBe(false);
  });

  it("rollback then replay of the same turns lands on identical rep_* values, seen values and records, and a reopen holds them (4 seeds)", () => {
    for (const seed of [11, 23, 37, 53]) {
      const random = rng(seed);
      const turns = Array.from({ length: 10 }, () => ({
        [["apprentice_saved", "ledger_stolen", "envoy_helped", "met_guild", "debt_found"][Math.floor(random() * 5)]]: true,
        location: ["hall", "docks", "market"][Math.floor(random() * 3)],
      }));
      const run = play();
      turns.forEach((turn) => run.turn(turn));
      const recorded = run.values();
      const cut = 2 + Math.floor(random() * 6);
      expect(run.engine.rollbackTo(cut)).toEqual({ ok: true, result: "applied" });
      const replay = play();
      turns.slice(0, cut).forEach((turn) => replay.turn(turn));
      const pick = (values: Record<string, PrimitiveValue>) => Object.fromEntries(Object.entries(values).filter(([key]) => key.startsWith("rep_")));
      expect(pick(run.values())).toEqual(pick(replay.values()));
      const reopened = new StoryEngine({ now: () => 0 });
      reopened.loadStory(STORY);
      reopened.hydrate(run.engine.serialize(), run.engine.serializeHistory());
      expect(pick(reopened.serialize().blackboard.values)).toEqual(pick(run.values()));
      const full = play();
      turns.forEach((turn) => full.turn(turn));
      expect(pick(full.values())).toEqual(pick(recorded));
    }
  });
});
