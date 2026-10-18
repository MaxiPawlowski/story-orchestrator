import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { StoryEngine } from "../engine";
import { parseStory, parseStoryOrThrow } from "../validate";
import { questStatus, valueReader } from "../quests";
import { rollbackMoved } from "../rollbackDetectors";
import {
  CLOCK_DAY_KEY, CLOCK_MOVED_KEY, CLOCK_NIGHT_KEY, CLOCK_PART_KEY, CLOCK_READ_KEY, CLOCK_STORY_TIME_KEY, CLOCK_TIME_KEY, timeReachedKey,
  type NormalizedStory, type PrimitiveValue, type StoryCalendar,
} from "../schema";
import { deriveLife } from "./derive";
import { awayMembers } from "./presence";
import { dateOf, ordinal } from "./calendar";
import { applyTimeEffect, clockMoves, forwardToPart, reachedLabel, storyTimeRow, timeLabel } from "./clock";

const TIMES = ["morning", "afternoon", "evening", "night"];
const is = (key: string) => ({ q: key, op: "==", v: true });
const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key}.` });

const raw = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: "Clock lab", description: "Story time for plan 50.",
  roster: [{ id: "arin", name: "Arin", schedule: [{ when: { q: "time_of_day", op: "==", v: "night" }, at: "docks" }] }],
  clock: { times: TIMES, night: ["night"] },
  qualities: [
    { key: "location", type: "enum", values: ["market", "docks"], source: "extractor", rubric: "Where the party is." },
    bool("left"), bool("slept"), bool("waited"),
  ],
  checkpoints: [
    { id: "start", name: "Start", type: "anchor", start: true, objective: "o" },
    { id: "road", name: "Road", type: "anchor", objective: "o", effects: { time: { advance: { days: 2 } } } },
    { id: "camp", name: "Camp", type: "anchor", objective: "o", effects: { time: { to: { part: "morning", next_day: true } } } },
    { id: "end", name: "End", type: "anchor", objective: "o" },
  ],
  transitions: [
    { from: "start", to: "road", priority: 0, gate: is("left") },
    { from: "road", to: "camp", priority: 0, gate: is("slept") },
    { from: "camp", to: "end", priority: 0, gate: { all: [is("waited"), { q: "story_day", op: ">=", v: 5 }] } },
  ],
  ...extra,
});

const STORY = parseStoryOrThrow(raw());

interface Turn { text?: string; deltas?: Record<string, PrimitiveValue>; manual?: Record<string, PrimitiveValue>; readTo?: number }

const play = (story: NormalizedStory = STORY) => {
  const chat: Array<{ is_user: boolean; mes: string; name: string }> = [];
  const engine = new StoryEngine({ now: () => 0, derive: (view) => deriveLife(story, view, chat) });
  engine.loadStory(story);
  const turn = ({ text = "a line", deltas = {}, manual = {}, readTo }: Turn) => {
    chat.push({ is_user: true, mes: text, name: "You" }, { is_user: false, mes: "…", name: "Arin" });
    const reads = Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const }));
    const to = readTo ?? chat.length - 1;
    if (reads.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: reads, turnRange: { from: Math.max(0, to - 1), to } });
    const writes = Object.entries(manual).map(([q, v]) => ({ q, v, source: "code" as const, writer: "manual" as const }));
    if (writes.length) engine.enqueue({ source: "mechanical", blackboardVersionSum: 0, deltas: writes });
    return engine.commitBoundary({ lastMessageId: chat.length - 1, chatLength: chat.length });
  };
  return { engine, chat, turn, values: () => engine.serialize().blackboard.values };
};

const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const script = (seed: number, length: number, withPath = true): Turn[] => {
  const random = seeded(seed);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  return Array.from({ length }, () => {
    const roll = random();
    if (roll < 0.15) return { text: "((ooc aside))" };
    if (roll < 0.25) return { text: "continue" };
    if (roll < 0.3) {
      const key = pick([CLOCK_TIME_KEY, CLOCK_DAY_KEY]);
      return { manual: { [key]: key === CLOCK_TIME_KEY ? pick(TIMES) : 1 + Math.floor(random() * 6) } };
    }
    const deltas: Record<string, PrimitiveValue> = {};
    if (random() < 0.6) deltas[CLOCK_READ_KEY] = pick(TIMES);
    if (random() < 0.3) deltas.location = pick(["market", "docks"]);
    if (withPath && random() < 0.08) deltas[pick(["left", "slept", "waited"])] = true;
    return { deltas };
  });
};

const timeKeys = (values: Record<string, PrimitiveValue>) =>
  Object.fromEntries(Object.entries(values).filter(([key]) => [CLOCK_STORY_TIME_KEY, CLOCK_DAY_KEY, CLOCK_TIME_KEY, CLOCK_PART_KEY, CLOCK_NIGHT_KEY, CLOCK_MOVED_KEY].includes(key) || key.startsWith("cal_")));

describe("plan 50 B1a: one story_time, every clock key derived from it", () => {
  test("compiles story_time, the derived keys and an extractor read with no step rule", () => {
    expect(STORY.qualityByKey[CLOCK_STORY_TIME_KEY]).toMatchObject({ source: "code", type: "int", monotonic: true });
    expect(STORY.qualityByKey[CLOCK_TIME_KEY]).toMatchObject({ source: "code", type: "enum", values: TIMES });
    expect(STORY.qualityByKey[CLOCK_PART_KEY]).toMatchObject({ source: "code", type: "int" });
    expect(STORY.qualityByKey[CLOCK_NIGHT_KEY]).toMatchObject({ source: "code", type: "bool" });
    expect(STORY.qualityByKey[CLOCK_READ_KEY]).toMatchObject({ source: "extractor", read_as: "choice", values: TIMES });
    expect(STORY.qualityByKey[CLOCK_READ_KEY].step_rule).toBeUndefined();
    expect(STORY.qualityByKey.life_time_seen).toBeUndefined();
  });

  test("starts at (start_day - 1) x parts + start_part and derives day, part and night", () => {
    const story = parseStoryOrThrow(raw({ clock: { times: TIMES, night: ["night"], start_day: 3, start_part: "evening" } }));
    const run = play(story);
    run.turn({});
    expect(timeKeys(run.values())).toEqual({ story_time: 10, story_day: 3, time_of_day: "evening", time_part: 2, is_night: false });
    run.turn({ deltas: { [CLOCK_READ_KEY]: "night" } });
    expect(run.values()).toMatchObject({ story_time: 11, time_of_day: "night", is_night: true });
  });

  test("an authored start part anchors the clock, so even the first read moves one part", () => {
    const run = play(parseStoryOrThrow(raw({ clock: { times: TIMES, start_part: "morning" } })));
    run.turn({ deltas: { [CLOCK_READ_KEY]: "night" } });
    expect(run.values()[CLOCK_TIME_KEY]).toBe("afternoon");
  });

  test("an author's set moves the clock forward and the derive keeps it", () => {
    const run = play();
    run.turn({ manual: { [CLOCK_TIME_KEY]: "night" } });
    expect(run.values()).toMatchObject({ time_of_day: "night", story_day: 1, story_time: 3 });
    run.turn({});
    expect(run.values()[CLOCK_TIME_KEY]).toBe("night");
    run.turn({ manual: { [CLOCK_TIME_KEY]: "afternoon" } });
    expect(run.values()).toMatchObject({ time_of_day: "afternoon", story_day: 2 });
  });
});

const oldClock = (reads: Array<string | undefined>) => {
  let time: string | undefined;
  let seen: string | undefined;
  let day: number | undefined;
  return reads.map((read) => {
    if (read !== undefined) time = time === undefined || read === time ? read : TIMES[(TIMES.indexOf(time) + 1) % TIMES.length];
    day ??= 1;
    if (time !== undefined && time !== seen) {
      if (seen !== undefined && TIMES.indexOf(time) <= TIMES.indexOf(seen)) day += 1;
      seen = time;
    }
    return { time, day };
  });
};

describe("plan 50 T5: clock parity with the v2.7 37 clock", () => {
  test.each([1, 2, 3, 4])("seed %i: time_of_day, story_day and schedule drops match the old clock from its first read", (seed) => {
    const random = seeded(seed);
    const reads = Array.from({ length: 120 }, () => (random() < 0.5 ? TIMES[Math.floor(random() * TIMES.length)] : undefined));
    const expected = oldClock(reads);
    const run = play();
    const first = reads.findIndex((read) => read !== undefined);
    reads.forEach((read, index) => {
      run.turn({ deltas: read ? { [CLOCK_READ_KEY]: read } : {} });
      const values = run.values();
      expect(values[CLOCK_DAY_KEY]).toBe(expected[index].day);
      if (index < first) return expect(values[CLOCK_TIME_KEY]).toBe(TIMES[0]);
      expect(values[CLOCK_TIME_KEY]).toBe(expected[index].time);
      expect(awayMembers(STORY, { ...values, location: "market" })).toEqual(awayMembers(STORY, { [CLOCK_TIME_KEY]: expected[index].time ?? "", location: "market" }));
    });
  });
});

describe("plan 50 B1b: authored entry advances in the pure entry pass", () => {
  test("T16: the boundary that enters a checkpoint commits the advanced time, and the next evaluation sees it", () => {
    const run = play();
    run.turn({ deltas: { [CLOCK_READ_KEY]: "evening" } });
    const result = run.turn({ deltas: { left: true } });
    expect(result.fired?.to).toBe("road");
    expect(run.values()).toMatchObject({ story_time: 10, story_day: 3, time_of_day: "evening", [CLOCK_MOVED_KEY]: 3 });
    expect(run.engine.stateLog.at(-1)?.after.blackboard.values[CLOCK_DAY_KEY]).toBe(3);
    run.turn({ deltas: { slept: true } });
    expect(run.values()).toMatchObject({ story_day: 4, time_of_day: "morning" });
    run.turn({ deltas: { waited: true } });
    expect(run.engine.serialize().activeCheckpointId).toBe("camp");
    expect(run.turn({ manual: { [CLOCK_DAY_KEY]: 5 } }).fired?.to).toBe("end");
  });

  test("a manual activation runs the entry pass too", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(STORY);
    engine.activateCheckpoint("road", { lastMessageId: 1, chatLength: 2 });
    expect(engine.serialize().blackboard.values).toMatchObject({ story_time: 8, story_day: 3, time_of_day: "morning" });
  });

  test("to: a later part today, the same part only with next_day, an earlier part tomorrow", () => {
    const clock = { times: TIMES };
    expect(forwardToPart(clock, 1, 3)).toBe(3);
    expect(forwardToPart(clock, 1, 1)).toBe(1);
    expect(forwardToPart(clock, 1, 1, true)).toBe(5);
    expect(forwardToPart(clock, 2, 0)).toBe(4);
    expect(applyTimeEffect(clock, 2, { to: { part: "morning" } })).toBe(4);
    expect(applyTimeEffect({ ...clock, max_skip_days: 1 }, 0, { advance: { days: 9 } })).toBe(4);
  });

  test("validation refuses a negative or empty advance, more than max_skip_days, an unknown part, the start checkpoint and no clock", () => {
    const withEffect = (time: unknown, at = "road", extra: Record<string, unknown> = {}) => {
      const base = raw(extra);
      const checkpoints = (base.checkpoints as Array<Record<string, unknown>>).map((checkpoint) => (checkpoint.id === at ? { ...checkpoint, effects: { time } } : checkpoint));
      const parsed = parseStory({ ...base, checkpoints });
      return Array.isArray(parsed) ? parsed.map((error) => error.message).join(" | ") : "";
    };
    expect(withEffect({ advance: { days: -1 } })).toContain("only moves forward");
    expect(withEffect({ advance: {} })).toContain("advance of nothing");
    expect(withEffect({ advance: { days: 31 } })).toContain("at most 30 days");
    expect(withEffect({ advance: { days: 5 } }, "road", { clock: { times: TIMES, max_skip_days: 4 } })).toContain("at most 4 days");
    expect(withEffect({ to: { part: "noon" } })).toContain("to.part is one of the times");
    expect(withEffect({ advance: { days: 1 }, to: { part: "night" } })).toContain("time is {advance");
    expect(withEffect({ advance: { days: 1 } }, "start")).toContain("start_day and clock.start_part");
    const noClock = raw();
    delete noClock.clock;
    noClock.roster = [{ id: "arin", name: "Arin" }];
    expect(Array.isArray(parseStory(noClock)) ? (parseStory(noClock) as Array<{ message: string }>).map((error) => error.message).join() : "").toContain("effects.time needs a clock");
    expect(withEffect({ advance: { parts: 3 } })).toBe("");
  });
});

describe("plan 50 T13: stale reads and writer order", () => {
  test("a read whose window ends before an effect's advance yields nothing; a newer read steps", () => {
    const run = play();
    run.turn({ deltas: { [CLOCK_READ_KEY]: "evening" } });
    run.turn({ deltas: { left: true } });
    expect(run.values()[CLOCK_MOVED_KEY]).toBe(3);
    run.turn({ deltas: { [CLOCK_READ_KEY]: "night" }, readTo: 3 });
    expect(run.values()).toMatchObject({ story_time: 10, time_of_day: "evening" });
    run.turn({ deltas: { [CLOCK_READ_KEY]: "night" } });
    expect(run.values()).toMatchObject({ story_time: 11, time_of_day: "night" });
  });

  test("a read and an entry advance at one boundary compose: the read steps first, then the entry", () => {
    const run = play();
    run.turn({ deltas: { [CLOCK_READ_KEY]: "afternoon" } });
    run.turn({ deltas: { [CLOCK_READ_KEY]: "evening", left: true } });
    expect(run.values()).toMatchObject({ story_time: 10, time_of_day: "evening", story_day: 3 });
  });

  test("an author set wins over a read in the same boundary", () => {
    const run = play();
    run.turn({ deltas: { [CLOCK_READ_KEY]: "afternoon" }, manual: { [CLOCK_TIME_KEY]: "night" } });
    expect(run.values()[CLOCK_TIME_KEY]).toBe("night");
  });
});

describe("plan 50 T1/T3: rollback ≡ replay and clamps", () => {
  test.each([1, 2, 3, 4])("seed %i: 100 cuts over reads, effects, author sets, OOC lines, continues and reopen", (seed) => {
    const turns = script(seed, 101);
    const whole = play();
    turns.forEach(whole.turn);
    const final = whole.values();
    for (let cut = 1; cut <= 100; cut += 1) {
      const prefix = play();
      turns.slice(0, cut).forEach(prefix.turn);
      const rewound = play();
      turns.forEach(rewound.turn);
      expect(rewound.engine.rollbackTo(cut)).toEqual({ ok: true, result: "applied" });
      expect(timeKeys(rewound.values())).toEqual(timeKeys(prefix.values()));
      expect(rewound.values()).toEqual(prefix.values());
      if (cut % 10) continue;
      const fresh = play();
      fresh.chat.push(...prefix.chat);
      fresh.engine.hydrate(prefix.engine.serialize());
      turns.slice(cut).forEach(fresh.turn);
      expect(fresh.values()).toEqual(final);
    }
  });

  test.each([5, 6, 7, 8])("seed %i: a read moves at most one part once anchored, an entry at most max_skip_days, and story_time never falls", (seed) => {
    const run = play();
    let before = 0;
    let anchored = false;
    script(seed, 200).forEach((turn) => {
      const result = run.turn(turn);
      const now = run.values()[CLOCK_STORY_TIME_KEY] as number;
      expect(now).toBeGreaterThanOrEqual(before);
      if (!turn.manual && !result.fired && anchored) expect(now - before).toBeLessThanOrEqual(1);
      anchored ||= Boolean(turn.manual || result.fired || turn.deltas?.[CLOCK_READ_KEY]);
      if (result.fired) expect(now - before).toBeLessThanOrEqual(30 * TIMES.length + 1);
      before = now;
    });
  });

  test("code-only boundary: an author set with no read window and no transition asks for a rollback", () => {
    const run = play();
    run.turn({});
    run.turn({ manual: { [CLOCK_TIME_KEY]: "evening" } });
    const entry = run.engine.stateLog.at(-1)!;
    expect(entry.fired).toBeNull();
    expect(entry.queue.applied.every((applied) => !applied.turnRange)).toBe(true);
    expect(rollbackMoved(STORY, entry.before.blackboard.values, entry.after.blackboard.values)).toBe(true);
    expect(run.engine.shouldRollbackFromMessage(3)).toBe(true);
  });

  test("control: the first boundary only settles the start time and asks for no rollback", () => {
    const run = play();
    run.turn({});
    expect(run.engine.shouldRollbackFromMessage(1)).toBe(false);
  });
});

const CALENDAR = {
  start: { year: 412, month: "Thawmonth", day: 27, weekday: "Starday" },
  months: [{ name: "Deepwinter", days: 31 }, { name: "Thawmonth", days: 28 }, { name: "Seedtide", days: 30 }, { name: "Highsun", days: 33 }, { name: "Harvest", days: 29 }],
  weekdays: ["Moonday", "Starday", "Fireday", "Windday", "Restday"],
  seasons: [{ name: "Spring", from_month: "Thawmonth" }, { name: "Summer", from_month: 4 }, { name: "Autumn", from_month: "Harvest" }],
};

const walker = (calendar: StoryCalendar, days: number) => {
  const rows: Array<{ year: number; month: number; day: number; weekday: number; season: number }> = [];
  let { year, month, day, weekday } = calendar.start;
  const weekdays = calendar.weekdays?.length ?? 1;
  const seasons = calendar.seasons ?? [];
  for (let index = 0; index < days; index += 1) {
    let season = seasons.length - 1;
    for (let at = 0; at < seasons.length; at += 1) if (seasons[at].from_month <= month) season = at;
    rows.push({ year, month, day, weekday, season });
    day += 1;
    weekday = (weekday + 1) % weekdays;
    if (day > calendar.months[month].days) {
      day = 1;
      month += 1;
      if (month === calendar.months.length) {
        month = 0;
        year += 1;
      }
    }
  }
  return rows;
};

describe("plan 50 B1c: calendar", () => {
  const story = parseStoryOrThrow(raw({ calendar: CALENDAR }));
  const calendar = story.life!.calendar!;

  test("T2: 1,000 consecutive days equal an independent reference walker", () => {
    expect(calendar.seasons?.map((season) => season.from_month)).toEqual([1, 3, 4]);
    const expected = walker(calendar, 1000);
    expected.forEach((row, offset) => expect(dateOf(calendar, offset)).toEqual(row));
  });

  test("T14: start date vs start_day, start_part, weekday origin, season wrap", () => {
    const later = parseStoryOrThrow(raw({ calendar: CALENDAR, clock: { times: TIMES, start_day: 3, start_part: "night" } }));
    const run = play(later);
    run.turn({});
    expect(run.values()).toMatchObject({ story_day: 3, time_of_day: "night", cal_year: 412, cal_month: "Seedtide", cal_day_of_month: 1, cal_weekday: "Windday", cal_season: "Spring" });
    expect(dateOf(calendar, 0)).toMatchObject({ month: 1, day: 27, weekday: 1 });
    const winter = dateOf(calendar, 2 + 30 + 33 + 29);
    expect(winter).toMatchObject({ year: 413, month: 0, day: 1, season: 2 });
    expect(timeLabel(later.life!.clock!, later.life!.calendar, run.values()[CLOCK_STORY_TIME_KEY] as number)).toBe("1st of Seedtide, night");
    expect(timeLabel(STORY.life!.clock!, undefined, 13)).toBe("Day 4, afternoon");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });

  test("is_night lives on the clock and exists without a calendar", () => {
    const run = play();
    run.turn({ manual: { [CLOCK_TIME_KEY]: "night" } });
    expect(run.values()[CLOCK_NIGHT_KEY]).toBe(true);
    expect(Object.keys(run.values()).some((key) => key.startsWith("cal_"))).toBe(false);
  });

  test("refuses a calendar without a clock, a bad start day, an unknown month and duplicate season months; reserves time keys", () => {
    const errors = (json: Record<string, unknown>) => {
      const parsed = parseStory(json);
      return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`).join(" | ") : "";
    };
    const noClock = raw({ calendar: CALENDAR });
    delete noClock.clock;
    noClock.checkpoints = (noClock.checkpoints as Array<Record<string, unknown>>).map(({ effects: _effects, ...checkpoint }) => checkpoint);
    noClock.roster = [{ id: "arin", name: "Arin" }];
    noClock.transitions = (noClock.transitions as Array<Record<string, unknown>>).slice(0, 2);
    expect(errors(noClock)).toContain("a calendar needs a clock");
    expect(errors(raw({ calendar: { ...CALENDAR, start: { month: "Thawmonth", day: 29 } } }))).toContain("calendar.start.day");
    expect(errors(raw({ calendar: { ...CALENDAR, start: { month: "Nope", day: 1 } } }))).toContain("calendar.start.month");
    expect(errors(raw({ calendar: { ...CALENDAR, seasons: [{ name: "A", from_month: 2 }, { name: "B", from_month: "Thawmonth" }] } }))).toContain("two seasons start in the same month");
    const reserved = raw();
    reserved.qualities = [...(reserved.qualities as unknown[]), { key: "cal_weekday", type: "string", source: "extractor", rubric: "x" }, { key: "story_time", type: "int", source: "code", rubric: "x" }];
    expect(errors(reserved)).toContain("qualities.cal_weekday: this key is kept for the story clock");
    expect(errors(reserved)).toContain("qualities.story_time");
  });
});

describe("plan 50 T15: first-visit time", () => {
  test("an undated timeline checkpoint keeps the story time it was first reached, past a truncated log and a reopen", () => {
    const story = parseStoryOrThrow(raw({ widgets: [{ id: "trail", kind: "timeline", title: "Trail", dates: { start: "The first morning" } }] }));
    expect(story.qualityByKey[timeReachedKey("road")]).toMatchObject({ source: "code", type: "int" });
    expect(story.qualityByKey[timeReachedKey("start")]).toBeUndefined();
    const run = play(story);
    run.turn({ deltas: { [CLOCK_READ_KEY]: "evening" } });
    run.turn({ deltas: { left: true } });
    expect(run.values()[timeReachedKey("road")]).toBe(10);
    for (let index = 0; index < 210; index += 1) run.turn({ deltas: { [CLOCK_READ_KEY]: TIMES[index % 4] } });
    expect(run.engine.stateLog.length).toBe(200);
    const fresh = new StoryEngine({ now: () => 0 });
    fresh.loadStory(story);
    fresh.hydrate(run.engine.serialize(), run.engine.serializeHistory());
    expect(fresh.serialize().blackboard.values[timeReachedKey("road")]).toBe(10);
  });
});

describe("plan 50 T6: an offered quest never fails on story time alone", () => {
  const quest = (failed: unknown) => ({ id: "deliver", title: "Deliver", kind: "side", steps: [], offered_when: is("left"), visible_when: is("slept"), done_when: is("waited"), failed_when: failed });
  const errors = (failed: unknown, extra: Record<string, unknown> = {}) => {
    const parsed = parseStory(raw({ quests: [quest(failed)], ...extra }));
    return Array.isArray(parsed) ? parsed.map((error) => error.message).join(" | ") : "";
  };

  test.each([
    ["story_day", { q: "story_day", op: ">=", v: 5 }],
    ["story_time", { q: "story_time", op: ">=", v: 20 }],
    ["time_of_day", { q: "time_of_day", op: "==", v: "night" }],
    ["is_night", { q: "is_night", op: "==", v: true }],
    ["time_part", { q: "time_part", op: ">=", v: 3 }],
  ])("refuses failed_when on %s alone", (_key, gate) => expect(errors(gate)).toContain("never fails on time alone"));

  test("refuses failed_when on a calendar key alone", () => expect(errors({ q: "cal_month", op: "==", v: "Harvest" }, { calendar: CALENDAR })).toContain("never fails on time alone"));

  test("control: a gate on a non-time key passes", () => expect(errors({ q: "location", op: "==", v: "docks" })).toBe(""));

  test("runtime: a quest taken on after its deadline fails the moment it is accepted, which the rule prevents", () => {
    const quests = [{ ...quest({ q: "story_day", op: ">=", v: 3 }), offered_when: undefined }];
    const story = parseStoryOrThrow(raw({ quests: [{ id: "deliver", title: "Deliver", kind: "side", steps: [], visible_when: is("slept"), done_when: is("waited"), failed_when: quests[0].failed_when }] }));
    const deliver = story.quests![0];
    const late = { story_day: 4, slept: false };
    expect(questStatus(deliver, valueReader(late))).toBe("hidden");
    expect(questStatus(deliver, valueReader({ ...late, slept: true }))).toBe("failed");
  });

  test("a reward never writes a story-time key", () => {
    const parsed = parseStory(raw({ quests: [{ id: "nap", title: "Nap", kind: "side", steps: [], done_when: is("slept"), reward: { set: { story_day: 9 } } }] }));
    expect(Array.isArray(parsed) ? parsed.map((error) => error.message).join() : "").toContain("never moves the story clock");
  });
});

const WALL_CLOCK = /\bDate\b|\bperformance\b|host\.now|\.now\(\)/;

const wallClockFiles = (sources: Record<string, string>): string[] => Object.entries(sources).filter(([, text]) => WALL_CLOCK.test(text)).map(([file]) => file);

describe("plan 50 T4: no wall clock in story time", () => {
  const root = join(process.cwd(), "src");
  const files = [
    ...readdirSync(join(root, "engine/life")).filter((file) => file.endsWith(".ts") && !file.includes(".test.")).map((file) => `engine/life/${file}`),
    "engine/validate/life.ts", "runtime/stretchTurns.ts",
  ];

  test("the life modules, the calendar, the clock and the derive seam never read Date, performance or now()", () => {
    const sources = Object.fromEntries(files.map((file) => [file, readFileSync(join(root, file), "utf8")]));
    expect(files).toEqual(expect.arrayContaining(["engine/life/clock.ts", "engine/life/calendar.ts", "engine/life/derive.ts"]));
    expect(wallClockFiles(sources)).toEqual([]);
  });

  test("planted control: a call to Date.now() is caught", () => {
    expect(wallClockFiles({ "engine/life/planted.ts": "export const t = () => Date.now();", "engine/life/fine.ts": "export const t = 1;" })).toEqual(["engine/life/planted.ts"]);
  });
});

describe("plan 50 B1c: Author view time row and timeline labels", () => {
  test("names the last writer from the boundary log: the reader, a checkpoint or the author", () => {
    const run = play();
    run.turn({});
    run.turn({ deltas: { [CLOCK_READ_KEY]: "evening" } });
    run.turn({ deltas: { left: true } });
    run.turn({ manual: { [CLOCK_TIME_KEY]: "night" } });
    expect(clockMoves(STORY, run.engine.stateLog).map((move) => move.writer)).toEqual(["read", "checkpoint", "author"]);
    expect(storyTimeRow(STORY, run.values(), run.engine.stateLog)).toEqual({
      time: 11, label: "Day 3, night", move: { boundary: 4, messageId: 7, from: 10, to: 11, writer: "author" },
    });
  });

  test("control: a story without a clock has no time row", () => {
    const plain = raw();
    delete plain.clock;
    plain.roster = [{ id: "arin", name: "Arin" }];
    plain.checkpoints = (plain.checkpoints as Array<Record<string, unknown>>).map(({ effects: _effects, ...checkpoint }) => checkpoint);
    plain.transitions = (plain.transitions as Array<Record<string, unknown>>).slice(0, 2);
    expect(storyTimeRow(parseStoryOrThrow(plain), {}, [])).toBeNull();
  });

  test("an undated timeline stop takes the label of its first-visit time; a dated one keeps its words", () => {
    const story = parseStoryOrThrow(raw({ calendar: CALENDAR, widgets: [{ id: "trail", kind: "timeline", title: "Trail", dates: { start: "The first morning" } }] }));
    const run = play(story);
    run.turn({ deltas: { [CLOCK_READ_KEY]: "evening" } });
    run.turn({ deltas: { left: true } });
    expect(reachedLabel(story, run.values(), "road")).toBe("1st of Seedtide, evening");
    expect(reachedLabel(story, run.values(), "start")).toBeNull();
  });
});
