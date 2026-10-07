import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine } from "../engine";
import { parseStoryV2OrThrow } from "../validate";
import {
  CLOCK_DAY_KEY, TURN_OOC_KEY, agendaRepeatsKey, agendaStepKey, agendaWaitKey, moodKey, type NormalizedStoryV2, type PrimitiveValue,
} from "../schema";
import { deriveLife } from "./derive";
import { isOocText } from "../ooc";
import { awayMembers, effectiveMood, lifeScopeKeys } from "./presence";
import { agendaWorldInfo, landedSteps, lifeAuthorRows, privateLifeLines } from "./lines";

const STORY = parseStoryV2OrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));

interface Turn { text: string; deltas?: Record<string, PrimitiveValue> }

const play = (story: NormalizedStoryV2 = STORY) => {
  const chat: Array<{ is_user: boolean; mes: string; name: string }> = [];
  const engine = new StoryEngine({ now: () => 0, derive: (view) => deriveLife(story, view, chat) });
  engine.loadStory(story);
  const turn = ({ text, deltas = {} }: Turn) => {
    chat.push({ is_user: true, mes: text, name: "You" }, { is_user: false, mes: "…", name: "Arin" });
    const entries = Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const }));
    if (entries.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: entries, turnRange: { from: chat.length - 2, to: chat.length - 1 } });
    engine.commitBoundary({ lastMessageId: chat.length - 1, chatLength: chat.length });
  };
  return { engine, chat, turn, values: () => engine.serialize().blackboard.values };
};

const steps = (values: Record<string, PrimitiveValue>) => values[agendaStepKey("arin", "debt")] ?? 0;

describe("v2.7 plan 37 L3: an agenda moves in code at a boundary", () => {
  it("lands a step when the pace allows, and the next only when its gate holds", () => {
    const run = play();
    run.turn({ text: "hello", deltas: { location: "docks" } });
    expect(steps(run.values())).toBe(0);
    run.turn({ text: "we look around" });
    expect(steps(run.values())).toBe(1);
    run.turn({ text: "on" });
    run.turn({ text: "on" });
    expect(steps(run.values())).toBe(1);
    run.turn({ text: "we leave", deltas: { location: "market" } });
    expect(steps(run.values())).toBe(2);
  });

  it("an OOC line neither moves the agenda nor counts toward its pace", () => {
    const run = play();
    run.turn({ text: "hello" });
    run.turn({ text: "((brb, coffee))" });
    expect(run.values()[TURN_OOC_KEY]).toBe(true);
    expect(run.values()[agendaWaitKey("arin", "debt")]).toBe(1);
    expect(steps(run.values())).toBe(0);
    run.turn({ text: "OOC: back" });
    expect(steps(run.values())).toBe(0);
    run.turn({ text: "we walk on" });
    expect(steps(run.values())).toBe(1);
  });

  it("repeats only the last step, counting occurrences", () => {
    const run = play();
    for (let index = 0; index < 12; index += 1) run.turn({ text: "on", deltas: { location: "market" } });
    expect(steps(run.values())).toBe(3);
    expect(Number(run.values()[agendaRepeatsKey("arin", "debt")])).toBeGreaterThan(0);
  });

  it("names the landed step, so its effect is dispatched once, and replays its world_info from the blackboard", () => {
    const run = play();
    run.turn({ text: "a", deltas: { location: "market" } });
    run.turn({ text: "b" });
    run.turn({ text: "c" });
    const log = run.engine.stateLog;
    const landed = log.flatMap((entry) => landedSteps(STORY, entry.before.blackboard.values, entry.after.blackboard.values));
    expect(landed.map((step) => step.index)).toEqual([0]);
    run.turn({ text: "d" });
    expect(agendaWorldInfo(STORY, run.values())).toEqual([{ enable: [{ lorebook: "Life Lab", comments: ["Smuggler paid"] }] }]);
  });

  it("makes the boundary that landed a step one a rollback undoes", () => {
    const run = play();
    run.turn({ text: "a" });
    run.turn({ text: "b" });
    expect(steps(run.values())).toBe(1);
    expect(run.engine.shouldRollbackFromMessage(run.chat.length - 2)).toBe(true);
  });
});

describe("v2.7 plan 37 L2: mood falls back to its baseline", () => {
  it("holds a read mood for its lasts, then reads as the baseline and is asked again", () => {
    const run = play();
    const arin = STORY.life!.members[0];
    run.turn({ text: "a", deltas: { [moodKey("arin")]: "angry" } });
    expect(effectiveMood(arin, run.values())).toBe("angry");
    expect(lifeScopeKeys(STORY, run.values(), { present: ["arin"] })).not.toContain(moodKey("arin"));
    run.turn({ text: "b" });
    run.turn({ text: "c" });
    run.turn({ text: "d" });
    expect(effectiveMood(arin, run.values())).toBe("calm");
    expect(lifeScopeKeys(STORY, run.values(), { present: ["arin"] })).toContain(moodKey("arin"));
    run.turn({ text: "e", deltas: { [moodKey("arin")]: "angry" } });
    expect(effectiveMood(arin, run.values())).toBe("angry");
  });
});

describe("v2.7 plan 37: the story clock and whereabouts", () => {
  it("counts a day each time the time of day wraps", () => {
    const run = play();
    run.turn({ text: "a", deltas: { time_of_day: "evening" } });
    expect(run.values()[CLOCK_DAY_KEY]).toBe(1);
    run.turn({ text: "b", deltas: { time_of_day: "night" } });
    run.turn({ text: "c", deltas: { time_of_day: "morning" } });
    expect(run.values()[CLOCK_DAY_KEY]).toBe(2);
  });

  it("puts a member away when the schedule sends her elsewhere, and back when the party is there", () => {
    expect(awayMembers(STORY, { time_of_day: "night", location: "market" })).toEqual(["arin"]);
    expect(awayMembers(STORY, { time_of_day: "night", location: "docks" })).toEqual([]);
    expect(awayMembers(STORY, { time_of_day: "morning", location: "market" })).toEqual([]);
  });
});

describe("v2.7 plan 37 L1: the relationship scope source", () => {
  it("reads an axis only while both sides are present, the speaker's first", () => {
    const both = lifeScopeKeys(STORY, {}, { present: ["arin", "narrator"], drafted: "arin" });
    expect(both).toEqual(expect.arrayContaining(["rel_arin_player_trust", "rel_arin_player_fear", "rel_arin_narrator_respect"]));
    const alone = lifeScopeKeys(STORY, {}, { present: ["arin"] });
    expect(alone).not.toContain("rel_arin_narrator_respect");
    expect(alone).toContain("rel_arin_player_trust");
    expect(lifeScopeKeys(STORY, {}, { present: ["narrator"] })).toEqual([]);
  });

  it("leaves an away member's axes out of the read", () => {
    expect(lifeScopeKeys(STORY, { time_of_day: "night", location: "market" }, { present: ["arin", "narrator"] })).toEqual([]);
  });
});

describe("v2.7 plan 37: what the drafted member is told", () => {
  it("shows only the holder its own feelings, mood and plans, and others only public steps", () => {
    const values = { rel_arin_player_trust: 2, [agendaStepKey("arin", "debt")]: 2 };
    const own = privateLifeLines(STORY, values, "arin");
    expect(own).toContain("Your trust toward {{user}} (the newcomer): 2 on a scale from -3 to 3.");
    expect(own).toContain("sold her mother's ring");
    expect(own).toContain("Your mood right now: calm.");
    const other = privateLifeLines(STORY, values, "narrator");
    expect(other).not.toContain("trust");
    expect(other).not.toContain("ring");
    expect(other).toContain("met the smuggler at the docks");
  });

  it("gives the author the whole table", () => {
    const rows = lifeAuthorRows(STORY, { time_of_day: "night", location: "inn" });
    expect(rows[0]).toMatchObject({ id: "arin", away: "docks", mood: "calm", agendas: [{ id: "debt", done: 0, of: 3 }] });
  });
});

describe("v2.7 plan 37: the OOC predicate", () => {
  it.each([["((brb))", true], ["OOC: one sec", true], ["(OOC) quick question", true], ["ooc: lower", true], ["I say (quietly) hi", false], ["", false], ["Look ((there))", false]])(
    "%s -> %s", (text, expected) => expect(isOocText(text)).toBe(expected),
  );
});

const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const script = (seed: number, length: number): Turn[] => {
  const random = seeded(seed);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  return Array.from({ length }, () => {
    const deltas: Record<string, PrimitiveValue> = {};
    if (random() < 0.4) deltas.location = pick(["market", "docks", "inn"]);
    if (random() < 0.4) deltas.time_of_day = pick(["morning", "afternoon", "evening", "night"]);
    if (random() < 0.3) deltas[moodKey("arin")] = pick(["calm", "tense", "angry"]);
    if (random() < 0.3) deltas.rel_arin_player_trust = pick([-1, 0, 1, 2]);
    return { text: random() < 0.25 ? "((ooc aside))" : "an in-fiction line", deltas };
  });
};

describe("v2.7 plan 37: rollback ≡ replay with agendas, moods, clock and OOC lines", () => {
  it.each([1, 2, 3, 4])("seed %i: a rollback to every cut equals replaying the prefix, and a reopen equals the continuous run", (seed) => {
    const turns = script(seed, 30);
    const whole = play();
    turns.forEach(whole.turn);
    const final = whole.values();
    for (let cut = 1; cut < turns.length; cut += 3) {
      const prefix = play();
      turns.slice(0, cut).forEach(prefix.turn);
      const rewound = play();
      turns.forEach(rewound.turn);
      expect(rewound.engine.rollbackTo(cut)).toEqual({ ok: true, result: "applied" });
      expect(rewound.values()).toEqual(prefix.values());
      const reopened = play();
      turns.slice(0, cut).forEach(reopened.turn);
      const saved = reopened.engine.serialize();
      const fresh = play();
      fresh.chat.push(...reopened.chat);
      fresh.engine.hydrate(saved);
      turns.slice(cut).forEach(fresh.turn);
      expect(fresh.values()).toEqual(final);
    }
  });
});

describe("owner decision 2026-10-07 (plan 37 Q1): an unread relationship reads as its start", () => {
  const TRUST = "rel_arin_player_trust";
  const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")) as { roster: Array<{ relationships?: Array<Record<string, unknown>> }> };
  const startingAt = (start: number) => {
    const raw = JSON.parse(JSON.stringify(RAW)) as typeof RAW;
    raw.roster[0].relationships = raw.roster[0].relationships?.map((relationship) => (relationship.toward === "player" ? { ...relationship, start } : relationship));
    return parseStoryV2OrThrow(raw);
  };

  it("holds start on the blackboard from load, with no version, so the extractor's first read is still the first write", () => {
    const run = play();
    expect(run.values()[TRUST]).toBe(0);
    expect(run.values().rel_arin_narrator_respect).toBe(0);
    expect(run.engine.serialize().blackboard.versions[TRUST]).toBeUndefined();
    run.turn({ text: "hello", deltas: { [TRUST]: 1 } });
    expect(run.values()[TRUST]).toBe(1);
    expect(run.engine.serialize().blackboard.versions[TRUST]).toBe(1);
  });

  it("a gate on it holds from turn one when start meets it; control: a start below the gate waits for a read", () => {
    const met = play(startingAt(2));
    met.turn({ text: "hello" });
    expect(met.engine.serialize().activeCheckpointId).toBe("confession");
    const below = play(startingAt(1));
    below.turn({ text: "hello" });
    expect(below.engine.serialize().activeCheckpointId).toBe("start");
    below.turn({ text: "I help you", deltas: { [TRUST]: 2 } });
    expect(below.engine.serialize().activeCheckpointId).toBe("confession");
  });

  it("keeps the extractor the only writer: a code write to it is refused", () => {
    const run = play();
    run.engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: TRUST, v: 3, source: "code" }] });
    run.engine.commitBoundary({ lastMessageId: 0, chatLength: 1 });
    expect(run.values()[TRUST]).toBe(0);
  });

  it("a rollback past the first read lands on start, and a stored state without the key reopens on start", () => {
    const run = play(startingAt(1));
    run.turn({ text: "hello" });
    run.turn({ text: "I help you", deltas: { [TRUST]: 2 } });
    expect(run.engine.rollbackTo(1)).toEqual({ ok: true, result: "applied" });
    expect(run.values()[TRUST]).toBe(1);
    const saved = run.engine.serialize();
    const stripped = { ...saved, blackboard: { ...saved.blackboard, values: Object.fromEntries(Object.entries(saved.blackboard.values).filter(([key]) => !key.startsWith("rel_"))) } };
    const reopened = play(startingAt(1));
    reopened.engine.hydrate(stripped);
    expect(reopened.values()[TRUST]).toBe(1);
    expect(reopened.values()).toEqual(run.values());
  });

  it("an author reset of the value goes back to start, not to unset", () => {
    const run = play();
    run.turn({ text: "hello", deltas: { [TRUST]: 1 } });
    run.engine.resetQuality(TRUST);
    expect(run.values()[TRUST]).toBe(0);
  });

  it("control: a quality without a relationship start is still unset until read", () => {
    const run = play();
    expect(run.values()[moodKey("arin")]).toBeUndefined();
    expect(run.values().location).toBeUndefined();
  });
});
