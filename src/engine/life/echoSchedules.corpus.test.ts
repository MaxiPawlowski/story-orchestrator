import { evaluateGate } from "../gates";
import type { EchoesState } from "./echoes";
import { ALL, echoLab, rollbackAt, simulate, stateAt, type SimRun, type Turn } from "../../../test/support/echoSim";

type Category = "time-jump" | "invalidated" | "recipient" | "rollback";
type Expect = Record<string, [string, number | null]> | ((state: EchoesState) => boolean);

interface Case {
  name: string;
  category: Category;
  echoes: Array<Record<string, unknown>>;
  turns: Turn[];
  expect: Expect;
  lapse?: boolean;
}

const is = (q: string, v: unknown = true) => ({ q, op: "==", v });
const E = (id: string, patch: Record<string, unknown> = {}) => ({ id, after: { transition: "market->road" }, delay: { boundaries: [1, 1] }, to: "mara", cue: `echo ${id} comes back`, ...patch });
const P = (id: string, range: [number, number], patch: Record<string, unknown> = {}) => E(id, { delay: { parts: range }, ...patch });
const T = (time: number, extra: Turn = {}): Turn => ({ ...extra, set: { story_time: time, ...(extra.set ?? {}) } });
const fire = (extra: Turn = {}): Turn => ({ fire: true, ...extra });
const idle = (count: number, turn: Turn = {}): Turn[] => Array.from({ length: count }, () => turn);
const landings = (state: EchoesState) => state.events.map((event) => event.landedAt?.boundary ?? 0).sort((a, b) => a - b);
const statuses = (state: EchoesState) => state.events.map((event) => event.status).sort();

const TIME_JUMP: Case[] = [
  { name: "parts due reached step by step", category: "time-jump", echoes: [P("a", [2, 2])], turns: [fire(T(0)), T(1), T(2)], expect: { a: ["landed", 3] } },
  { name: "jump lands on the inclusive expiry end", category: "time-jump", echoes: [P("a", [2, 2])], turns: [fire(T(0)), T(6)], expect: { a: ["landed", 2] } },
  { name: "jump past due and expiry expires", category: "time-jump", echoes: [P("a", [2, 2])], turns: [fire(T(0)), T(7)], expect: { a: ["expired", null] } },
  { name: "zero-part expiry lands exactly at due", category: "time-jump", echoes: [P("a", [1, 1], { expires: { parts: 0 } })], turns: [fire(T(0)), T(1)], expect: { a: ["landed", 2] } },
  { name: "zero-part expiry, jump past it", category: "time-jump", echoes: [P("a", [1, 1], { expires: { parts: 0 } })], turns: [fire(T(0)), T(2)], expect: { a: ["expired", null] } },
  { name: "jump makes three due: two land, one next turn", category: "time-jump", echoes: [P("a", [1, 1]), P("b", [1, 1]), P("c", [1, 1])],
    turns: [fire(T(0)), T(3), T(3)], expect: (state) => JSON.stringify(landings(state)) === "[2,2,3]" },
  { name: "capacity-held echo still expires", category: "time-jump", echoes: [P("a", [1, 1], { expires: { parts: 2 } }), P("b", [1, 1], { expires: { parts: 2 } }), P("c", [1, 1], { expires: { parts: 2 } })],
    turns: [fire(T(0)), T(3), T(4)], expect: (state) => JSON.stringify(statuses(state)) === "[\"expired\",\"landed\",\"landed\"]" },
  { name: "story time standing still never delivers early", category: "time-jump", echoes: [P("a", [2, 2])], turns: [fire(T(0)), ...idle(5, T(0))], expect: { a: ["scheduled", null] } },
  { name: "due counts from the source's own story time", category: "time-jump", echoes: [P("a", [2, 2])], turns: [fire(T(5)), T(6), T(7)], expect: { a: ["landed", 3] } },
  { name: "a turn delay ignores a story-time jump", category: "time-jump", echoes: [E("a", { delay: { boundaries: [2, 2] } })], turns: [fire(T(0)), T(20), T(20)], expect: { a: ["landed", 3] } },
];

const INVALIDATED: Case[] = [
  { name: "when fails at due, holds later in the window", category: "invalidated", echoes: [E("a", { when: is("trader_angry") })],
    turns: [fire(), {}, {}, { set: { trader_angry: true } }], expect: { a: ["landed", 4] } },
  { name: "when never holds in the window", category: "invalidated", echoes: [E("a", { when: is("trader_angry"), expires: { boundaries: 2 } })], turns: [fire(), ...idle(4)],
    expect: { a: ["expired", null] } },
  { name: "when holds on the last turn of the window", category: "invalidated", echoes: [E("a", { when: is("trader_angry"), expires: { boundaries: 2 } })],
    turns: [fire(), {}, {}, { set: { trader_angry: true } }], expect: { a: ["landed", 4] } },
  { name: "cancel already true on the source turn", category: "invalidated", echoes: [E("a", { cancel_when: is("repaid") })], turns: [fire({ set: { repaid: true } }), {}],
    expect: { a: ["cancelled", null] } },
  { name: "cancel before due", category: "invalidated", echoes: [E("a", { delay: { boundaries: [2, 2] }, cancel_when: is("repaid") })], turns: [fire(), { set: { repaid: true } }, {}],
    expect: { a: ["cancelled", null] } },
  { name: "cancel after landing changes nothing", category: "invalidated", echoes: [E("a", { cancel_when: is("repaid") })], turns: [fire(), {}, { set: { repaid: true } }],
    expect: { a: ["landed", 2] } },
  { name: "cancel wins over expiry on the same turn", category: "invalidated", echoes: [E("a", { when: is("trader_angry"), cancel_when: is("repaid"), expires: { boundaries: 0 } })],
    turns: [fire(), {}, { set: { repaid: true } }], expect: { a: ["cancelled", null] } },
  { name: "cancel wins over a holding when at due", category: "invalidated", echoes: [E("a", { when: is("trader_angry"), cancel_when: is("repaid") })],
    turns: [fire({ set: { trader_angry: true } }), { set: { repaid: true } }], expect: { a: ["cancelled", null] } },
  { name: "when is read at due, not at schedule", category: "invalidated", echoes: [E("a", { delay: { boundaries: [2, 2] }, when: is("trader_angry") })],
    turns: [fire({ set: { trader_angry: true } }), {}, { set: { trader_angry: false } }, { set: { trader_angry: true } }], expect: { a: ["landed", 4] } },
  { name: "a cancel is terminal even when its gate flips back", category: "invalidated", echoes: [E("a", { delay: { boundaries: [3, 3] }, cancel_when: is("repaid") })],
    turns: [fire(), { set: { repaid: true } }, { set: { repaid: false } }, {}, {}], expect: { a: ["cancelled", null] } },
];

const RECIPIENT: Case[] = [
  { name: "recipient away at due, back next turn", category: "recipient", echoes: [E("a")], turns: [fire(), { enabled: ["tom"] }, {}], expect: { a: ["landed", 3] } },
  { name: "recipient away through the window", category: "recipient", echoes: [E("a", { expires: { boundaries: 1 } })], turns: [fire(), ...idle(3, { enabled: ["tom"] })],
    expect: { a: ["expired", null] } },
  { name: "narrator cue names an unknown entity until it is met", category: "recipient", echoes: [E("a", { to: "narrator" })],
    turns: [fire(), { refuse: { narrator: "unknown-name" } }, { refuse: { narrator: "unknown-name" } }, {}], expect: { a: ["landed", 4] } },
  { name: "narrator cue unknown through the window", category: "recipient", echoes: [E("a", { to: "narrator", expires: { boundaries: 1 } })],
    turns: [fire(), ...idle(3, { refuse: { narrator: "unknown-name" } })], expect: { a: ["expired", null] } },
  { name: "member cue restates a secret until it is out", category: "recipient", echoes: [E("a")], turns: [fire(), { refuse: { mara: "secret" } }, {}], expect: { a: ["landed", 3] } },
  { name: "member secret through the window", category: "recipient", echoes: [E("a", { expires: { boundaries: 2 } })], turns: [fire(), ...idle(4, { refuse: { mara: "secret" } })],
    expect: { a: ["expired", null] } },
  { name: "another member's absence does not hold it", category: "recipient", echoes: [E("a")], turns: [fire(), { enabled: ["mara", "narrator"] }], expect: { a: ["landed", 2] } },
  { name: "the narrator resolves to the omniscient member", category: "recipient", echoes: [E("a", { to: "narrator" })], turns: [fire(), { enabled: ["mara", "tom"] }, {}],
    expect: (state) => state.events[0]?.recipient === "narrator" && state.events[0]?.landedAt?.boundary === 3 },
  { name: "away recipient, then cancelled", category: "recipient", echoes: [E("a", { cancel_when: is("repaid") })], turns: [fire(), { enabled: ["tom"] }, { enabled: ["tom"], set: { repaid: true } }],
    expect: { a: ["cancelled", null] } },
  { name: "a held cue takes no landing slot", category: "recipient", echoes: [E("a"), E("b", { to: "tom" }), E("c", { to: "narrator" })], turns: [fire(), { refuse: { mara: "secret" } }],
    expect: (state) => state.events.filter((event) => event.status === "landed").map((event) => event.echoId).sort().join() === "b,c" },
];

const MIXED = [E("a", { delay: { boundaries: [1, 2] }, cancel_when: is("repaid") }), E("b", { after: { milestone: "bell" }, delay: { boundaries: [2, 3] }, when: is("trader_angry") }),
  E("c", { after: { quest: "fare", to: "done" }, to: "tom", hold: 1 }), P("d", [1, 2], { to: "narrator" })];
const MIXED_TURNS: Turn[] = [fire(T(0)), T(1, { set: { saw_bell: true } }), T(1), T(2, { set: { ferry_paid: true } }), T(3, { set: { trader_angry: true } }),
  T(3, { enabled: ["mara", "narrator"] }), T(5), T(5), T(6, { set: { repaid: true } }), T(6)];

const ROLLBACK: Case[] = Array.from({ length: 10 }, (_, cut) => ({
  name: `rollback cut at boundary ${cut} equals replay`, category: "rollback" as const, echoes: MIXED, turns: MIXED_TURNS, lapse: true, expect: { cut } as unknown as Expect,
}));

const CORPUS: Case[] = [...TIME_JUMP, ...INVALIDATED, ...RECIPIENT, ...ROLLBACK];

interface Tally {
  exact: number;
  early: string[];
  unauthorized: string[];
  repeats: string[];
}

const audit = (item: Case, run: SimRun, tally: Tally) => {
  const story = echoLab({ echoes: item.echoes });
  run.results.forEach((result, index) => result.landed.forEach((event) => {
    const turn = item.turns[index];
    const values = run.values[index];
    const echo = story.echoes?.find((entry) => entry.id === event.echoId);
    const boundary = index + 1;
    const time = typeof values.story_time === "number" ? values.story_time : 0;
    const early = boundary <= event.source.boundary || ("boundary" in event.due ? boundary < event.due.boundary : time < event.due.part);
    if (early) tally.early.push(`${item.name}: ${event.echoId} at ${boundary}`);
    const allowed = (turn.enabled ?? ALL).includes(event.recipient) && !turn.refuse?.[event.recipient]
      && (!echo?.when || evaluateGate(echo.when, { get: (key) => values[key] }));
    if (!allowed) tally.unauthorized.push(`${item.name}: ${event.echoId} at ${boundary}`);
  }));
  const ids = run.states.at(-1)?.events.map((event) => event.echoId) ?? [];
  if (new Set(ids).size !== ids.length) tally.repeats.push(item.name);
};

const matches = (item: Case, run: SimRun): boolean => {
  const end = run.states.at(-1) as EchoesState;
  if (item.category === "rollback") {
    const cut = (item.expect as unknown as { cut: number }).cut;
    const rolled = rollbackAt(run, cut);
    const story = echoLab({ echoes: item.echoes });
    const resumed = simulate(story, item.turns.slice(cut), {
      lapse: true, from: { state: rolled, log: run.log.filter((entry) => entry.boundary <= cut), values: cut ? run.values[cut - 1] : {}, checks: [] },
    });
    return JSON.stringify(rolled) === JSON.stringify(stateAt(run, cut)) && JSON.stringify(resumed.states.at(-1)) === JSON.stringify(end);
  }
  if (typeof item.expect === "function") return item.expect(end);
  return Object.entries(item.expect).every(([id, [status, landed]]) => {
    const event = end.events.find((entry) => entry.echoId === id);
    return event?.status === status && (event.landedAt?.boundary ?? null) === landed;
  });
};

describe("v2.9 07 floors: the 40-schedule corpus (deterministic, frozen 2026-10-21)", () => {
  const tally: Tally = { exact: 0, early: [], unauthorized: [], repeats: [] };
  const misses: string[] = [];
  const split: Record<Category, number> = { "time-jump": 0, invalidated: 0, recipient: 0, rollback: 0 };

  beforeAll(() => {
    CORPUS.forEach((item) => {
      const run = simulate(echoLab({ echoes: item.echoes }), item.turns, { lapse: item.lapse });
      split[item.category] += 1;
      audit(item, run, tally);
      if (matches(item, run)) tally.exact += 1;
      else misses.push(item.name);
    });
  });

  it("has the predeclared denominator and split", () => {
    expect(CORPUS).toHaveLength(40);
    expect(split).toEqual({ "time-jump": 10, invalidated: 10, recipient: 10, rollback: 10 });
  });

  it("exact once-only due/cancel behaviour: 40 of 40 (floor 100%)", () => {
    expect(misses).toEqual([]);
    expect(tally.exact).toBe(40);
    expect(tally.repeats).toEqual([]);
  });

  it("zero early or unauthorized delivery over every boundary of every schedule", () => {
    expect(tally.early).toEqual([]);
    expect(tally.unauthorized).toEqual([]);
  });

  it("control: a planted wrong expectation and a planted early landing are caught", () => {
    const planted: Case = { ...TIME_JUMP[0], expect: { a: ["landed", 2] } };
    const run = simulate(echoLab({ echoes: planted.echoes }), planted.turns);
    expect(matches(planted, run)).toBe(false);
    const early: Tally = { exact: 0, early: [], unauthorized: [], repeats: [] };
    const forged = { ...run, results: run.results.map((result, index) => (index === 1 ? { ...result, landed: run.results[2].landed } : result)) };
    audit(planted, forged, early);
    expect(early.early).toHaveLength(1);
  });
});
