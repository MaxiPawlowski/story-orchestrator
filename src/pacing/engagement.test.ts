import { TENSION_NUMERIC } from "./tension";
import { AFTERMATH_LINE, holdsPush, pressureLine, readEngagement, recordEngagement, rollbackEngagement, stuckInfoLine, type EngagementClass, type EngagementInput } from "./engagement";

type Values = Record<string, string | number | boolean>;

const entry = (at: number, before: Values, after: Values = before) =>
  ({ context: { lastMessageId: at }, before: { blackboard: { values: before } }, after: { blackboard: { values: after } } }) as never;

const turns = (...ids: number[]) => ids.map((id) => ({ id, text: "I look around." }));

const calm = TENSION_NUMERIC.calm;
const critical = TENSION_NUMERIC.critical;

const base = (over: Partial<EngagementInput> = {}): EngagementInput => ({
  log: [entry(2, { location: "inn" }), entry(4, { location: "inn" }), entry(6, { location: "inn" })],
  playerTurns: turns(1, 3, 5),
  memoryIds: [2],
  relationEvents: [],
  tension: [{ messageId: 2, smoothed: calm }, { messageId: 4, smoothed: calm }, { messageId: 6, smoothed: calm }],
  lastMessageId: 6,
  ...over,
});

const peakThenDrop = [{ messageId: 2, smoothed: critical }, { messageId: 4, smoothed: critical }, { messageId: 6, smoothed: calm }];

const FIXTURES: Array<{ name: string; expect: EngagementClass | null; input: EngagementInput }> = [
  { name: "a peak held two readings, then fell at the last boundary", expect: "aftermath", input: base({ tension: peakThenDrop }) },
  { name: "a resolution landed at the last boundary", expect: "aftermath", input: base({ resolutions: [6] }) },
  { name: "a resolution one boundary back", expect: "aftermath", input: base({ resolutions: [4] }) },
  { name: "a peak drop and a pressure crossing together: aftermath wins", expect: "aftermath", input: base({ tension: peakThenDrop, pressures: [{ label: "The flood", messageId: 5 }] }) },
  { name: "a pressure crossed inside the window", expect: "pressure-advancing", input: base({ pressures: [{ label: "The flood", messageId: 5 }] }) },
  { name: "a pressure and a relationship move: pressure wins", expect: "pressure-advancing",
    input: base({ pressures: [{ label: "The flood", messageId: 3 }], log: [entry(2, { location: "inn" }), entry(4, { rel_a_b_trust: 1 }, { rel_a_b_trust: 2 }), entry(6, { location: "inn" })] }) },
  { name: "a pressure and a question: pressure wins", expect: "pressure-advancing",
    input: base({ pressures: [{ label: "The debt", messageId: 6 }], playerTurns: [...turns(1, 3), { id: 5, text: "\"Where is she?\"" }] }) },
  { name: "a pressure crossed and nothing new is said", expect: "pressure-advancing", input: base({ memoryIds: [], pressures: [{ label: "The siege", messageId: 4 }] }) },
  { name: "a relationship axis moved", expect: "exploring-relationship", input: base({ log: [entry(2, { location: "inn" }), entry(4, { rel_a_b_trust: 1 }, { rel_a_b_trust: 2 }), entry(6, { location: "inn" })] }) },
  { name: "a mood moved", expect: "exploring-relationship", input: base({ log: [entry(2, {}), entry(4, { mood_mara: "calm" }, { mood_mara: "warm" }), entry(6, {})] }) },
  { name: "a promise event landed", expect: "exploring-relationship", input: base({ relationEvents: [5] }) },
  { name: "a label revealed, with a question too: relationship wins", expect: "exploring-relationship",
    input: base({ log: [entry(2, {}), entry(6, {}, { life_reveal_a_b_x: 6 })], playerTurns: [...turns(1, 3), { id: 5, text: "Why?" }] }) },
  { name: "the player asked in dialogue", expect: "uncertain", input: base({ playerTurns: [...turns(1, 3), { id: 5, text: "*I lean in.* \"Where does the road go?\"" }] }) },
  { name: "the player asked plainly", expect: "uncertain", input: base({ playerTurns: [...turns(1, 3), { id: 5, text: "What now?" }] }) },
  { name: "a question while nothing new is said: uncertain wins", expect: "uncertain", input: base({ memoryIds: [], playerTurns: [...turns(1, 3), { id: 5, text: "Anyone here?" }] }) },
  { name: "a question with an old relationship move outside the window", expect: "uncertain",
    input: base({ log: [entry(0, { rel_a_b_trust: 1 }, { rel_a_b_trust: 2 }), entry(6, {})], playerTurns: [...turns(1, 3), { id: 5, text: "Who sent you?" }] }) },
  { name: "nothing new for the window in one place", expect: "repeating", input: base({ memoryIds: [] }) },
  { name: "memory rows only before the window", expect: "repeating", input: base({ memoryIds: [0] }) },
  { name: "nothing new, no location at all", expect: "repeating", input: base({ memoryIds: [], log: [entry(2, {}), entry(4, {}), entry(6, {})] }) },
  { name: "nothing new, an old peak long ago", expect: "repeating",
    input: base({ memoryIds: [], log: [entry(1, {}), entry(2, {}), entry(4, {}), entry(6, {})], tension: [{ messageId: 0, smoothed: critical }, { messageId: 1, smoothed: critical }, { messageId: 2, smoothed: calm }] }) },
  { name: "control: a new memory row and the party moved", expect: null, input: base({ log: [entry(2, { location: "inn" }), entry(4, { location: "inn" }, { location: "road" }), entry(6, { location: "road" })] }) },
  { name: "control: too few player turns to call it repeating", expect: null, input: base({ memoryIds: [], playerTurns: turns(5) }) },
];

describe("v3.0 52 engagement classifier", () => {
  it.each(FIXTURES)("$name -> $expect", ({ input, expect: wanted }) => {
    expect(readEngagement(input).kind).toBe(wanted);
  });

  it("D floor: every class has four labelled fixtures, each classified exactly", () => {
    const counts = FIXTURES.reduce<Record<string, number>>((acc, row) => ({ ...acc, [String(row.expect)]: (acc[String(row.expect)] ?? 0) + 1 }), {});
    expect(counts).toMatchObject({ aftermath: 4, "pressure-advancing": 4, "exploring-relationship": 4, uncertain: 4, repeating: 4 });
    expect(FIXTURES.filter((row) => readEngagement(row.input).kind !== row.expect)).toEqual([]);
  });

  it("D floor: a replayed log reads the same, and the overlap list keeps the precedence order", () => {
    const input = base({ tension: peakThenDrop, pressures: [{ label: "The flood", messageId: 5 }], relationEvents: [5], playerTurns: [...turns(1, 3), { id: 5, text: "Now?" }] });
    const first = readEngagement(input);
    expect(readEngagement(JSON.parse(JSON.stringify(input)) as EngagementInput)).toEqual(first);
    expect(first.matched).toEqual(["aftermath", "pressure-advancing", "exploring-relationship", "uncertain"]);
    expect(first.pressure).toEqual({ label: "The flood", messageId: 5 });
  });

  it("holds the push only for aftermath and a relationship scene", () => {
    expect(holdsPush(readEngagement(base({ relationEvents: [5] })))).toBe(true);
    expect(holdsPush(readEngagement(base({ resolutions: [6] })))).toBe(true);
    expect(holdsPush(readEngagement(base({ memoryIds: [] })))).toBe(false);
    expect(holdsPush(null)).toBe(false);
  });

  it("answer lines name the pressure, phrase leads as information, and the aftermath as recovery", () => {
    expect(pressureLine({ label: "The flood", messageId: 5, cue: "the lower road is under water" })).toMatch(/^The flood has moved on\..*the lower road is under water/);
    expect(stuckInfoLine("a ferryman knows the way")).toMatch(/plain information, not pressure.*a ferryman knows the way$/);
    expect(stuckInfoLine(null)).toMatch(/one concrete piece of information/);
    expect(AFTERMATH_LINE).toMatch(/react to it and catch their breath/);
  });

  it("the ring keeps one reading per boundary, at most 50, and a rollback drops readings at or after the message", () => {
    let ring = Array.from({ length: 55 }, (_, at) => readEngagement(base({ lastMessageId: at }))).reduce(recordEngagement, []);
    expect(ring).toHaveLength(50);
    ring = recordEngagement(ring, { ...ring[49], kind: "uncertain" });
    expect(ring.filter((row) => row.at === 54)).toHaveLength(1);
    expect(rollbackEngagement(ring, 40).map((row) => row.at).at(-1)).toBe(39);
  });
});
