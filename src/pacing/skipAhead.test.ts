import { parseStoryOrThrow, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { CLOCK_DAY_KEY, CLOCK_STORY_TIME_KEY } from "@engine/schema";
import { SKIP_ATTENTION, skipDirectionText, skipPlan, skipSpan, type SkipDueEvent } from "./skipAhead";

const TIMES = ["morning", "afternoon", "evening", "night"];
const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key}.` });

const raw = (extra: Record<string, unknown> = {}, roster: Record<string, unknown>[] = [{ id: "arin", name: "Arin" }]): Record<string, unknown> => ({
  title: "Skip lab", description: "Skip ahead.",
  roster: [{ id: "narrator", name: "Narrator", view: "omniscient" }, ...roster],
  clock: { times: TIMES, night: ["night"] },
  qualities: [bool("left")],
  checkpoints: [
    { id: "start", name: "Start", type: "anchor", start: true, objective: "o" },
    { id: "end", name: "End", type: "anchor", objective: "o" },
  ],
  transitions: [{ from: "start", to: "end", priority: 0, gate: { q: "left", op: "==", v: true } }],
  ...extra,
});

const CLOCKED = parseStoryOrThrow(raw());
const PLAIN = parseStoryOrThrow(Object.fromEntries(Object.entries(raw()).filter(([key]) => key !== "clock")));
const at = (time: number): Record<string, PrimitiveValue> => ({ [CLOCK_STORY_TIME_KEY]: time, [CLOCK_DAY_KEY]: Math.floor(time / 4) + 1 });
const plan = (story: NormalizedStory, values: Record<string, PrimitiveValue>, events: SkipDueEvent[] = [], boundary = 5) => skipPlan({ story, values, boundary, events });
const span = (time: number) => skipSpan(CLOCKED.life?.clock, CLOCKED.life?.calendar, at(time));

describe("v3.0 32 S2 option A: a skip moves at most to the next day part", () => {
  it("names the next part, and the next day when it crosses midnight", () => {
    expect(span(1)).toMatchObject({ from: 1, to: 2, part: "evening", nextDay: false });
    expect(span(3)).toMatchObject({ from: 3, to: 4, part: "morning", nextDay: true, label: "Day 2, morning" });
    expect(skipDirectionText(span(3), null)).toContain("until morning of the next day");
  });

  it("without a clock the skip goes to the next scene and never names a time", () => {
    const result = plan(PLAIN, {});
    expect(result.span).toBeNull();
    expect(result.text).toContain("skip ahead to the next scene");
    expect(result.text).not.toMatch(/morning|evening|night/);
  });

  it("the direction is fixed copy: the player chose it, the player's move, no reveal, nothing decisive", () => {
    const text = plan(CLOCKED, at(0)).text;
    expect(text.startsWith("{{user}} chose to skip ahead until afternoon.")).toBe(true);
    expect(text).toContain("never decide, say or feel anything for {{user}}");
    expect(text).toContain("never reveal anything the story has not shown");
    expect(text).toContain("nothing decisive happening");
  });
});

describe("v3.0 32 S3: due work interrupts the skip at the first due point", () => {
  it("an echo due within the span stops it with the neutral cue only", () => {
    const result = plan(CLOCKED, at(1), [{ kind: "echo", due: { part: 2 }, open: true }]);
    expect(result.due).toEqual({ kind: "echo", at: "threshold" });
    expect(result.text).toContain(`Stop as soon as ${SKIP_ATTENTION}, and at evening at the latest`);
  });

  it("an event due by boundary lands on this very reply and wins over later ones", () => {
    const result = plan(CLOCKED, at(1), [{ kind: "echo", due: { part: 2 }, open: true }, { kind: "rumor", due: { boundary: 6 }, open: true }]);
    expect(result.due).toEqual({ kind: "rumor", at: "next-reply" });
  });

  it("past, later, landed and settled events do not interrupt", () => {
    const events: SkipDueEvent[] = [
      { kind: "echo", due: { part: 1 }, open: true }, { kind: "echo", due: { part: 3 }, open: true }, { kind: "echo", due: { part: 2 }, open: false },
      { kind: "rumor", due: { boundary: 9 }, open: true }, { kind: "rumor", due: { day: 1 }, open: true },
    ];
    expect(plan(CLOCKED, at(1), events).due).toBeNull();
  });

  it("a rumor due the next day interrupts only a skip that crosses midnight", () => {
    const rumor: SkipDueEvent = { kind: "rumor", due: { day: 2 }, open: true };
    expect(plan(CLOCKED, at(2), [rumor]).due).toBeNull();
    expect(plan(CLOCKED, at(3), [rumor]).due).toEqual({ kind: "rumor", at: "threshold" });
  });

  it("a quest, schedule or commitment whose gate or deadline the next part reaches interrupts", () => {
    const night = { q: "time_of_day", op: "==", v: "night" };
    const quest = parseStoryOrThrow(raw({ quests: [{ id: "q", title: "Watch", kind: "side", done_when: { q: "left", op: "==", v: true }, failed_when: night, steps: [] }] }));
    expect(plan(quest, at(2)).due).toEqual({ kind: "quest", at: "threshold" });
    expect(plan(quest, at(1)).due).toBeNull();
    const scheduled = parseStoryOrThrow(raw({}, [{ id: "arin", name: "Arin", schedule: [{ when: night, at: "docks" }] }]));
    expect(plan(scheduled, at(2)).due?.kind).toBe("schedule");
    const promise = { id: "c", to: "player", what: "Meet at dawn.", made_when: "start", kept_when: { q: "left", op: "==", v: true }, due: { story_day: 1 } };
    const promised = parseStoryOrThrow(raw({}, [{ id: "arin", name: "Arin", commitments: [promise] }]));
    expect(plan(promised, at(3)).due?.kind).toBe("commitment");
    expect(plan(promised, at(2)).due).toBeNull();
  });

  it("floor D: 20 seeded due schedules stop at the first due point and never past it", () => {
    const outcomes = Array.from({ length: 20 }, (_, index) => {
      const now = index % 7;
      const parts = [now - 1, now, now + 1, now + 2, now + 3].filter((part) => part >= 0);
      const events: SkipDueEvent[] = parts.filter((_, slot) => (index >> slot) % 2 === 1).map((part) => ({ kind: "echo", due: { part }, open: true }));
      const expected = events.some((event) => "part" in event.due && event.due.part === now + 1);
      const result = plan(CLOCKED, at(now), events);
      return Boolean(result.due) === expected && result.span?.to === now + 1;
    });
    expect(outcomes.filter(Boolean)).toHaveLength(20);
  });
});
