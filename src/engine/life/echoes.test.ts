import { readFileSync } from "fs";
import { join } from "path";
import { parseStory } from "../validate";
import { usesGameLayer } from "../validate/gameLayer";
import { normalTransitionId } from "../validate/echoes";
import { CUE_PRIORITY } from "../cueSchema";
import {
  createEchoes, echoIdentity, echoOfferKey, echoRevision, reconcileEchoes, rollbackEchoes, sanitizeEchoes, stepEchoes, type EchoesState,
} from "./echoes";
import { echoAuthorView, echoCandidates, echoJournal } from "./echoView";
import { ALL, ECHO_LAB_RAW, echoLab, entryOf, rollbackAt, simulate, stateAt, type Turn } from "../../../test/support/echoSim";

const is = (q: string, v: unknown = true) => ({ q, op: "==", v });
const errorsOf = (patch: Record<string, unknown>) => {
  const parsed = parseStory({ ...ECHO_LAB_RAW, ...patch });
  return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};
const echoes = (list: unknown[]) => ({ echoes: list });
const base = { id: "x", after: { transition: "market->road" }, delay: { boundaries: [1, 1] }, to: "mara", cue: "the market remembers" };
const only = (...ids: string[]) => echoLab({ echoes: (ECHO_LAB_RAW.echoes as Array<{ id: string }>).filter((echo) => ids.includes(echo.id)) });
const statusOf = (state: EchoesState, echoId: string) => state.events.find((event) => event.echoId === echoId)?.status;
const idle = (count: number, turn: Turn = {}): Turn[] => Array.from({ length: count }, () => turn);

describe("v2.9 07 S1: echo validation and the game layer", () => {
  it("loads the lab and an echo-only story through the game layer", () => {
    expect(errorsOf({})).toEqual([]);
    const echoOnly = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/echo-only.story.json"), "utf8")) as Record<string, unknown>;
    expect(usesGameLayer(echoOnly)).toBe(true);
    expect(usesGameLayer({ ...echoOnly, echoes: undefined })).toBe(false);
    const parsed = parseStory(echoOnly);
    expect(Array.isArray(parsed) ? parsed : parsed.echoes?.map((echo) => echo.after)).toEqual([{ transition: "start->out#0" }]);
  });

  it("normalises transition ids", () => {
    expect(normalTransitionId("a -> b")).toBe("a->b#0");
    expect(normalTransitionId("a->b#2")).toBe("a->b#2");
    expect(normalTransitionId("ab")).toBeNull();
  });

  it("refuses unknown sources, outcomes, recipients and bad timing", () => {
    expect(errorsOf(echoes([{ ...base, after: { transition: "road->market" } }])).join("\n")).toMatch(/not a transition/);
    expect(errorsOf(echoes([{ ...base, after: { quest: "nope", to: "done" } }])).join("\n")).toMatch(/'nope' is not a quest/);
    expect(errorsOf(echoes([{ ...base, after: { quest: "fare", to: "active" } }])).join("\n")).toMatch(/done or failed/);
    expect(errorsOf(echoes([{ ...base, after: { milestone: "nope" } }])).join("\n")).toMatch(/not a milestone/);
    expect(errorsOf(echoes([{ ...base, after: { check: "steady", outcome: "maybe" } }])).join("\n")).toMatch(/outcome is one of/);
    expect(errorsOf(echoes([{ ...base, after: { check: "nope", outcome: "success" } }])).join("\n")).toMatch(/not a check/);
    expect(errorsOf(echoes([{ ...base, to: "ghost" }])).join("\n")).toMatch(/'ghost' is not in the cast/);
    expect(errorsOf({ ...echoes([{ ...base, to: "narrator" }]), roster: [{ id: "mara", name: "Mara" }] }).join("\n")).toMatch(/view omniscient/);
    expect(errorsOf(echoes([{ ...base, delay: { boundaries: [3, 1] } }])).join("\n")).toMatch(/min first/);
    expect(errorsOf(echoes([{ ...base, delay: { boundaries: [-1, 1] } }])).join("\n")).toMatch(/min first/);
    expect(errorsOf(echoes([{ ...base, hold: 7 }])).join("\n")).toMatch(/hold is a whole number/);
    expect(errorsOf(echoes([{ ...base, expires: { parts: 2 } }])).join("\n")).toMatch(/same unit/);
    expect(errorsOf(echoes([base, base])).join("\n")).toMatch(/a second echo 'x'/);
    expect(errorsOf(echoes([{ ...base, when: is("ghost_key") }])).join("\n")).toMatch(/ghost_key/);
  });

  it("refuses a story-time delay without a clock instead of falling back to turns", () => {
    expect(errorsOf({ ...echoes([{ ...base, delay: { parts: [1, 2] } }]), clock: undefined }).join("\n")).toMatch(/needs a story clock/);
    expect(errorsOf(echoes([{ ...base, delay: { parts: [1, 2] } }]))).toEqual([]);
  });

  it("keys identity on id, source, recipient and unit; revision adds the gates and windows", () => {
    const [echo] = only("trader").echoes ?? [];
    expect(echoIdentity({ ...echo, cue: "other words" })).toBe(echoIdentity(echo));
    expect(echoRevision({ ...echo, cue: "other words" })).toBe(echoRevision(echo));
    expect(echoRevision({ ...echo, hold: 4 })).not.toBe(echoRevision(echo));
    expect(echoIdentity({ ...echo, to: "mara" })).not.toBe(echoIdentity(echo));
  });
});

describe("v2.9 07 S2: scheduling from each source kind", () => {
  it("schedules from a fired transition with a story-time due, never on the source boundary", () => {
    const story = only("trader");
    const run = simulate(story, [{ fire: true, set: { story_time: 0, trader_angry: true } }, { set: { story_time: 1 } }, { set: { story_time: 2 } }]);
    expect(run.results[0].scheduled.map((event) => [event.echoId, event.due, event.recipient])).toEqual([["trader", { part: 2 }, "narrator"]]);
    expect(run.results[1].landed).toEqual([]);
    expect(run.results[2].landed.map((event) => [event.echoId, event.landedAt?.boundary, event.offerId])).toEqual([["trader", 3, echoOfferKey(event0(run))]]);
  });

  it("schedules from a quest ending, a milestone and a check result", () => {
    const story = only("fare-thanks", "bell-talk", "steady-word");
    const run = simulate(story, [{ set: { ferry_paid: true, saw_bell: true }, checks: [["steady", "success"]] }, ...idle(4)]);
    expect(run.results[0].scheduled.map((event) => event.echoId).sort()).toEqual(["bell-talk", "fare-thanks", "steady-word"]);
    expect(run.states.at(-1)?.events.find((event) => event.echoId === "fare-thanks")?.landedAt?.boundary).toBe(3);
    expect(run.states.at(-1)?.events.find((event) => event.echoId === "steady-word")?.landedAt?.boundary).toBe(2);
  });

  it("never schedules a check echo on another outcome", () => {
    const run = simulate(only("steady-word"), [{ checks: [["steady", "failure"]] }, ...idle(3)]);
    expect(run.states.at(-1)?.events).toEqual([]);
  });

  it("schedules once per echo per chat: a looping source after landing, cancellation or eviction never reschedules", () => {
    const story = echoLab(echoes([{ ...base, delay: { boundaries: [1, 1] }, cancel_when: is("repaid") }]));
    const looped = simulate(story, [{ fire: true }, {}, { fire: true }, {}, { fire: true }]);
    expect(looped.states.at(-1)?.events.map((event) => [event.status, event.source.boundary])).toEqual([["landed", 1]]);
    const cancelled = simulate(story, [{ fire: true, set: { repaid: true } }, { fire: true, set: { repaid: false } }, {}, { fire: true }]);
    expect(cancelled.states.at(-1)?.events.map((event) => event.status)).toEqual(["cancelled"]);
    const evicted: EchoesState = { ...createEchoes(), settled: [{ echoId: "x", identity: echoIdentity(story.echoes![0]), occurrenceId: "old", revision: "r", status: "landed",
      closedAt: { boundary: 1, messageId: 2 } }], scannedTo: 0 };
    const after = simulate(story, [{ fire: true }, {}], { from: { state: evicted, log: [], values: {}, checks: [] } });
    expect(after.states.at(-1)?.events).toEqual([]);
  });

  it("draws the delay once, seeded by chat, story and occurrence", () => {
    const story = only("bell-talk");
    const one = simulate(story, [{ set: { saw_bell: true } }, ...idle(4)]);
    const two = simulate(story, [{ set: { saw_bell: true } }, ...idle(4)]);
    expect(one.states.at(-1)).toEqual(two.states.at(-1));
    const due = one.results[0].scheduled[0].due as { boundary: number };
    expect(due.boundary).toBeGreaterThanOrEqual(2);
    expect(due.boundary).toBeLessThanOrEqual(4);
  });
});

describe("v2.9 07 S2: cancel -> expiry -> due -> bounded landing", () => {
  it("cancels before landing, at any boundary before it", () => {
    const run = simulate(only("trader"), [{ fire: true, set: { story_time: 0, trader_angry: true } }, { set: { repaid: true } }, { set: { story_time: 3 } }]);
    expect(run.results[1].cancelled.map((event) => event.echoId)).toEqual(["trader"]);
    expect(statusOf(run.states.at(-1)!, "trader")).toBe("cancelled");
  });

  it("waits while when fails, then lands inside the window; expiry is inclusive at both ends", () => {
    const story = echoLab(echoes([{ ...base, delay: { boundaries: [2, 2] }, when: is("trader_angry"), expires: { boundaries: 2 } }]));
    const late = simulate(story, [{ fire: true }, {}, {}, {}, { set: { trader_angry: true } }]);
    expect(late.results[4].landed.map((event) => event.landedAt?.boundary)).toEqual([5]);
    const never = simulate(story, [{ fire: true }, {}, {}, {}, {}, { set: { trader_angry: true } }]);
    expect(never.results[5].expired.map((event) => event.closedAt?.boundary)).toEqual([6]);
    expect(never.results[2].waiting.map((entry) => entry.reason)).toEqual(["when"]);
  });

  it("expires when one time jump crosses both due and expiry", () => {
    const run = simulate(only("trader"), [{ fire: true, set: { story_time: 0, trader_angry: true } }, { set: { story_time: 7 } }]);
    expect(run.results[1].expired.map((event) => event.echoId)).toEqual(["trader"]);
    expect(run.results[1].landed).toEqual([]);
  });

  it("lands at most two a boundary; capacity never resets due or expiry", () => {
    const list = ["a", "b", "c"].map((id) => ({ ...base, id, delay: { boundaries: [1, 1] }, expires: { boundaries: 1 } }));
    const run = simulate(echoLab(echoes(list)), [{ fire: true }, {}, {}, {}]);
    expect(run.results[1].landed).toHaveLength(2);
    const held = run.results[1].waiting.map((entry) => [entry.event.echoId, entry.reason]);
    expect(held).toEqual([[expect.any(String), "capacity"]]);
    expect(run.results[2].landed.map((event) => event.echoId)).toEqual([held[0][0]]);
    const four = ["a", "b", "c", "d", "e"].map((id) => ({ ...base, id, delay: { boundaries: [1, 1] }, expires: { boundaries: 0 } }));
    const tight = simulate(echoLab(echoes(four)), [{ fire: true }, {}, {}]);
    expect(tight.results[2].expired).toHaveLength(3);
  });

  it("holds a cue that restates a secret or names an unknown entity, and a recipient that is away", () => {
    const story = echoLab(echoes([{ ...base, expires: { boundaries: 3 } }]));
    const run = simulate(story, [{ fire: true }, { refuse: { mara: "secret" } }, { enabled: ["tom"] }, { refuse: { mara: "unknown-name" } }, {}]);
    expect(run.results.slice(1, 4).map((result) => result.waiting.map((entry) => entry.reason))).toEqual([["secret"], ["recipient"], ["unknown-name"]]);
    expect(run.results[4].landed.map((event) => event.echoId)).toEqual(["x"]);
  });
});

describe("v2.9 07 S2: catch-up and gaps", () => {
  it("catches up over a contiguous retained log, with due from the source entry's own time", () => {
    const story = only("trader");
    const live = simulate(story, [{ fire: true, set: { story_time: 0, trader_angry: true } }, { set: { story_time: 5 } }]);
    const late = stepEchoes({
      state: createEchoes(), story, log: live.log, checks: [], checksComplete: true, values: live.values[1], at: { boundary: 2, messageId: 4 },
      chatId: "chat", storyId: "lab", enabled: ALL, refuse: () => null,
    });
    expect(late.scheduled.map((event) => [event.due, event.source.boundary])).toEqual([[{ part: 2 }, 1]]);
    expect(late.gaps).toEqual([]);
  });

  it("records a gap instead of inventing a schedule when the log is gone", () => {
    const story = only("fare-thanks");
    const live = simulate(story, [{ set: { ferry_paid: true } }, {}, {}], { logCap: 1 });
    const state: EchoesState = { ...createEchoes(), scannedTo: 0 };
    const late = stepEchoes({ state, story, log: live.log, checks: [], checksComplete: true, values: live.values[2], at: { boundary: 3, messageId: 6 },
      chatId: "chat", storyId: "lab", enabled: ALL, refuse: () => null });
    expect(late.gaps).toEqual([{ from: 1, to: 2, reason: "log" }]);
    expect(late.scheduled).toEqual([]);
    expect(late.state.scannedTo).toBe(3);
  });

  it("records a check gap when check records were evicted", () => {
    const story = only("steady-word");
    const log = [1, 2, 3].map((boundary) => entryOf(story, boundary, {}, {}, false));
    const late = stepEchoes({ state: createEchoes(), story, log, checks: [{ checkId: "steady", boundary: 2, outcome: "success" }], checksComplete: false, values: {},
      at: { boundary: 3, messageId: 6 }, chatId: "chat", storyId: "lab", enabled: ALL, refuse: () => null });
    expect(late.gaps).toEqual([{ from: 1, to: 2, reason: "checks" }]);
    expect(late.scheduled).toEqual([]);
  });
});

describe("v2.9 07 S2: rollback equals replay; reopen round trip", () => {
  const story = echoLab(echoes([
    { ...base, id: "a", delay: { boundaries: [1, 2] }, cancel_when: is("repaid") },
    { ...base, id: "b", after: { milestone: "bell" }, delay: { boundaries: [2, 3] }, when: is("trader_angry"), expires: { boundaries: 2 } },
    { ...base, id: "c", after: { quest: "fare", to: "done" }, delay: { boundaries: [1, 1] }, to: "tom", hold: 1 },
  ]));
  const turns: Turn[] = [
    { fire: true }, { set: { saw_bell: true } }, {}, { set: { ferry_paid: true } }, { set: { trader_angry: true } }, { enabled: ["mara", "narrator"] }, {}, {}, { set: { repaid: true } }, {},
  ];

  it.each(Array.from({ length: turns.length }, (_, cut) => cut))("cut at boundary %i: rollback gives the replay state and replays to the same end", (cut) => {
    const full = simulate(story, turns, { lapse: true });
    const rolled = rollbackAt(full, cut);
    expect(rolled).toEqual(stateAt(full, cut));
    const resumed = simulate(story, turns.slice(cut), {
      lapse: true, from: { state: rolled, log: full.log.filter((entry) => entry.boundary <= cut), values: cut ? full.values[cut - 1] : {}, checks: [] },
    });
    expect(resumed.states.at(-1)).toEqual(full.states.at(-1));
  });

  it("sanitize keeps a serialized state and drops malformed rows", () => {
    const full = simulate(story, turns, { lapse: true });
    const end = full.states.at(-1)!;
    expect(sanitizeEchoes(JSON.parse(JSON.stringify(end)))).toEqual(end);
    expect(sanitizeEchoes({ events: [{ occurrenceId: 1 }], settled: "x", gaps: [{ from: "a" }], scannedTo: -4 })).toEqual(createEchoes());
    expect(sanitizeEchoes(null)).toEqual(createEchoes());
  });

  it("a rollback before a landing reopens the event and drops its offer", () => {
    const full = simulate(story, turns);
    const landed = full.states.at(-1)!.events.find((event) => event.echoId === "a")!;
    const rolled = rollbackEchoes(full.states.at(-1)!, landed.landedAt!.messageId, landed.landedAt!.boundary - 1);
    expect(rolled.events.find((event) => event.echoId === "a")).toEqual(expect.objectContaining({ status: "scheduled" }));
    expect(rolled.events.find((event) => event.echoId === "a")?.offerId).toBeUndefined();
  });
});

describe("v2.9 07 S1: story update reconciles the slice", () => {
  const story = only("trader", "fare-thanks");
  const turns: Turn[] = [{ fire: true, set: { story_time: 0, trader_angry: true, ferry_paid: true } }];

  it("keeps pending events on a cue-only edit and lands them with the new words", () => {
    const run = simulate(story, turns);
    const next = echoLab({ echoes: story.echoes!.map((echo) => (echo.id === "trader" ? { ...echo, cue: "the trader is back" } : echo)) });
    expect(reconcileEchoes(run.states[0], story, next)).toBe(run.states[0]);
  });

  it("drops pending events of an edited gate and reschedules them from the kept log", () => {
    const run = simulate(story, turns);
    const next = echoLab({ echoes: story.echoes!.map((echo) => (echo.id === "trader" ? { ...echo, hold: 4 } : echo)) });
    const reconciled = reconcileEchoes(run.states[0], story, next)!;
    expect(reconciled.events.map((event) => event.echoId)).toEqual(["fare-thanks"]);
    expect(reconciled.scannedTo).toBe(0);
    const again = simulate(next, [{}], { from: { state: reconciled, log: run.log, values: run.values[0], checks: [] } });
    const replay = simulate(next, [...turns, {}]);
    expect(again.states.at(-1)?.events.map((event) => [event.echoId, event.revision, event.due]).sort())
      .toEqual(replay.states.at(-1)?.events.map((event) => [event.echoId, event.revision, event.due]).sort());
  });

  it("keeps terminal events as earned history when an echo is removed", () => {
    const run = simulate(story, [...turns, {}, {}]);
    const next = echoLab({ echoes: story.echoes!.filter((echo) => echo.id !== "fare-thanks") });
    const reconciled = reconcileEchoes(run.states.at(-1), story, next)!;
    expect(reconciled.events.find((event) => event.echoId === "fare-thanks")?.status).toBe("landed");
    expect(echoCandidates(next, reconciled, "tom")).toEqual([]);
  });
});

describe("v2.9 07 S3: offer candidates, author view and journal", () => {
  it("hands a landed echo to the offer channel as an echo source at priority 20, recipient only", () => {
    const story = only("fare-thanks");
    const run = simulate(story, [{ set: { ferry_paid: true } }, {}, {}]);
    const state = run.states.at(-1)!;
    const [candidate] = echoCandidates(story, state, "tom");
    expect(candidate).toEqual(expect.objectContaining({
      source: { kind: "echo", echoId: "fare-thanks", occurrenceId: state.events[0].occurrenceId }, recipient: "tom", lane: "may", priority: CUE_PRIORITY.echo,
      copy: "echo", window: { from: 3, to: 4 }, spend: "once", text: "the fare you were paid came just in time",
    }));
    expect(echoCandidates(story, state, "mara")).toEqual([]);
  });

  it("shows every lifecycle state to the author", () => {
    const story = echoLab(echoes([
      { ...base, id: "w", when: is("trader_angry") }, { ...base, id: "s", delay: { boundaries: [5, 5] } }, { ...base, id: "l" }, { ...base, id: "o", to: "tom" },
    ]));
    const run = simulate(story, [{ fire: true }, {}]);
    const state = run.states.at(-1)!;
    const offered = state.events.find((event) => event.echoId === "o")!;
    const view = echoAuthorView({
      story, state, values: run.values[1], at: { boundary: 2, messageId: 4 }, clock: null, enabled: ALL, refuse: () => null,
      receipts: [{ key: offered.offerId!, defRev: offered.revision, source: { kind: "echo", echoId: "o", occurrenceId: offered.occurrenceId }, recipient: "tom", chatId: "chat",
        messageId: 5, revision: "r", boundary: 2, textHash: "h" }],
    });
    expect(Object.fromEntries(view.rows.map((row) => [row.echoId, row.state]))).toEqual({ w: "waiting", s: "scheduled", l: "landed-to-channel", o: "offered" });
    expect(echoJournal(run.results[1])?.summary).toBe("2 echo(es) landed to channel, 1 echo(es) waiting");
    expect(echoJournal({ ...run.results[1], landed: [], scheduled: [], waiting: [] })).toBeNull();
  });
});

const event0 = (run: { states: EchoesState[] }) => run.states.at(-1)!.events[0].occurrenceId;
