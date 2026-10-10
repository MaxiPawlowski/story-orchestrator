import { StoryEngine, parseStoryV2, parseStoryV2OrThrow, isValidationErrorList, type PrimitiveValue, type StoryV2 } from "@engine/index";
import { composeGame, type GameSources } from "./widgets";
import type { WidgetView } from "./gameTypes";
import { changedAgoText, provenanceText } from "@features/widgetCopy";

const QUALITIES = [
  { key: "supplies", type: "int", source: "extractor", rubric: "Supplies?", display: { public: true, label: "Supplies", as: "meter", min: 0, max: 10 } },
  { key: "alarm", type: "int", source: "extractor", rubric: "Alarm?", display: { public: true, label: "Alarm", as: "boxes", min: 0, max: 4 } },
  {
    key: "arin_status", type: "enum", source: "extractor", rubric: "Arin?", values: ["ok", "hurt"], player_labels: { ok: "Fine", hurt: "Wounded" },
    display: { public: true, label: "Arin", as: "word" },
  },
  { key: "secret_status", type: "enum", source: "extractor", rubric: "SECRET-RUBRIC", values: ["calm", "plotting"] },
  { key: "tried_climb", type: "bool", source: "extractor", rubric: "Tried to climb?" },
  { key: "climb_ok", type: "bool", source: "code", rubric: "Climb result." },
  { key: "deep", type: "bool", source: "extractor", rubric: "Deep?" },
];

const WIDGETS = [
  { id: "stock", kind: "meters", title: "Stock", bind: { qualities: ["supplies"] }, actions: [
    { id: "ask", text: "I count what we have." },
    { id: "notes", text: "Open what I know", open: "memory" },
    { id: "climb", text: "I try to climb the wall.", check: "climb" },
  ] },
  { id: "alarm-clock", kind: "clock", title: "Alarm", bind: "quality:alarm" },
  { id: "party", kind: "roster", title: "Party", rows: [
    { id: "arin", member: "arin", quality: "arin_status" },
    { id: "late", label: "Latecomer", quality: "arin_status", when: { q: "deep", op: "==", v: true } },
  ] },
  { id: "plots", kind: "roster", title: "Plots", audience: "author", rows: [{ id: "who", label: "Someone", quality: "secret_status" }] },
  { id: "road", kind: "timeline", title: "The road", dates: { start: "Day 1", dock: "Day 2" } },
];

const raw = (patch: Partial<Record<string, unknown>> = {}): StoryV2 => ({
  format: 2, id: "followups", title: "Followups", description: "Synthetic.",
  roster: [{ id: "arin", name: "Arin" }],
  qualities: QUALITIES,
  checkpoints: [
    { id: "start", name: "Start", type: "anchor", start: true, objective: "Begin.", player_name: "The gate" },
    { id: "dock", name: "Dock", type: "anchor", objective: "Dock.", player_name: "The dock" },
    { id: "hidden", name: "Hidden", type: "anchor", objective: "SECRET-CHECKPOINT." },
  ],
  transitions: [
    {
      from: "start", to: "dock", priority: 0, gate: { all: [{ q: "tried_climb", op: "==", v: true }, { q: "climb_ok", op: "==", v: true }] },
      check: { id: "climb", label: "Climb", quality: "climb_ok", roll: { sides: 20, target: 1 }, narrate: "public" },
    },
    { from: "dock", to: "hidden", priority: 0, gate: { q: "deep", op: "==", v: true } },
  ],
  widgets: WIDGETS,
  ...patch,
} as unknown as StoryV2);

const chatOf = (length: number) => Array.from({ length }, (_, index) => ({ is_user: index % 2 === 1, mes: `m${index}` }));

const play = (story: StoryV2, turns: Array<Record<string, PrimitiveValue>>, manual: ReadonlySet<number> = new Set()) => {
  const normalized = parseStoryV2OrThrow(story);
  const engine = new StoryEngine();
  engine.loadStory(normalized);
  turns.forEach((values, index) => {
    const writer = manual.has(index) ? { writer: "manual" as const } : {};
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(values).map(([q, v]) => ({ q, v, source: "extractor" as const, ...writer })) });
    engine.commitBoundary({ lastMessageId: index * 2 + 2, chatLength: index * 2 + 3 });
  });
  return { normalized, engine };
};

const sources = (story: StoryV2, turns: Array<Record<string, PrimitiveValue>>, options: { authorView?: boolean; manual?: Set<number>; chatLength?: number } = {}): GameSources => {
  const { normalized, engine } = play(story, turns, options.manual);
  return {
    story: normalized, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] },
    chat: chatOf(options.chatLength ?? turns.length * 2 + 1), castNames: { arin: "Arin" }, authorView: options.authorView,
  };
};

const find = (views: WidgetView[], id: string) => views.find((view) => view.id === id);

const walkable = (patch: Partial<Record<string, unknown>> = {}) => {
  const base = raw();
  return raw({
    widgets: WIDGETS.filter((widget) => widget.id !== "stock"),
    transitions: [{ ...base.transitions[0], gate: { q: "tried_climb", op: "==", v: true }, check: undefined }, base.transitions[1]],
    ...patch,
  });
};

describe("widget follow-ups validation (v2.8 23 A4)", () => {
  const errorsOf = (patch: Partial<Record<string, unknown>>) => {
    const parsed = parseStoryV2(raw(patch));
    return isValidationErrorList(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
  };
  const withWidgets = (widgets: unknown[]) => errorsOf({ widgets });

  test("the full set parses", () => {
    expect(errorsOf({})).toEqual([]);
  });

  test("a roster row needs one name, a known member and an enum the audience may see", () => {
    expect(withWidgets([{ id: "p", kind: "roster", title: "P", rows: [{ id: "a", quality: "arin_status" }] }]).join()).toContain("exactly one of member");
    expect(withWidgets([{ id: "p", kind: "roster", title: "P", rows: [{ id: "a", member: "nobody", quality: "arin_status" }] }]).join()).toContain("not a cast member");
    expect(withWidgets([{ id: "p", kind: "roster", title: "P", rows: [{ id: "a", label: "A", quality: "supplies" }] }]).join()).toContain("not an enum");
    expect(withWidgets([{ id: "p", kind: "roster", title: "P", rows: [{ id: "a", label: "A", quality: "secret_status" }] }]).join()).toContain("not public");
    expect(withWidgets([{ id: "p", kind: "roster", title: "P", audience: "author", rows: [{ id: "a", label: "A", quality: "secret_status" }] }])).toEqual([]);
  });

  test("timeline dates name known checkpoints; items stay on their own kind", () => {
    expect(withWidgets([{ id: "t", kind: "timeline", title: "T", dates: { nowhere: "Day 9" } }]).join()).toContain("unknown checkpoint 'nowhere'");
    expect(withWidgets([{ id: "t", kind: "timeline", title: "T", rows: [] }]).join()).toContain("a timeline widget has no rows");
    expect(withWidgets([{ id: "t", kind: "timeline", title: "T" }])).toEqual([]);
  });

  test("an action opens a player tab or asks for a public transition check, never both", () => {
    const action = (entry: Record<string, unknown>) => withWidgets([{ id: "t", kind: "timeline", title: "T", actions: [{ id: "a", text: "Go", ...entry }] }]).join();
    expect(action({ open: "payload" })).toContain("open is one of overview, memory");
    expect(action({ open: "memory", check: "climb" })).toContain("never both");
    expect(action({ check: "nope" })).toContain("not a check of this story");
    expect(action({ open: "overview" })).toBe("");
    const hidden = raw().transitions.map((transition, index) => (index === 0 ? { ...transition, check: { ...transition.check, narrate: "hidden" } } : transition));
    expect(errorsOf({ transitions: hidden }).join()).toContain("hidden check");
    const onCheckpoint = errorsOf({
      transitions: [{ ...raw().transitions[0], check: undefined }, raw().transitions[1]],
      checkpoints: raw().checkpoints.map((checkpoint, index) => (index === 0 ? { ...checkpoint, checks: [raw().transitions[0].check] } : checkpoint)),
    });
    expect(onCheckpoint.join()).toContain("rolls by itself");
  });
});

describe("widget follow-ups projection (v2.8 23 A4)", () => {
  test("meters, clocks and roster rows say how many replies ago they changed, player copy only", () => {
    const view = composeGame(sources(raw(), [{ supplies: 3 }, { alarm: 2 }, {}])).player;
    const stock = view.statSheet;
    expect(stock?.body.kind === "meters" && stock.body.groups[0].items[0].changedAgo).toBe(2);
    const clock = find(view.widgets, "alarm-clock");
    expect(clock?.body.kind === "clock" && clock.body.changedAgo).toBe(1);
    const party = find(view.widgets, "party");
    expect(party?.body).toEqual({ kind: "roster", rows: [{ name: "Arin", status: "—" }] });
    expect(changedAgoText(0)).toBe("just changed");
    expect(changedAgoText(1)).toBe("changed 1 reply ago");
    expect(changedAgoText(3)).toBe("changed 3 replies ago");
  });

  test("a value moved past what the meter shows is not a change the player is told about", () => {
    const view = composeGame(sources(raw(), [{ supplies: 12 }, { supplies: 15 }])).player;
    const stock = view.statSheet;
    expect(stock?.body.kind === "meters" && stock.body.groups[0].items[0].changedAgo).toBe(1);
  });

  test("roster rows show the status word and a gated row only once its gate holds", () => {
    const view = composeGame(sources(raw(), [{ arin_status: "hurt", deep: true }])).player;
    expect(find(view.widgets, "party")?.body).toEqual({ kind: "roster", rows: [{ name: "Arin", status: "Wounded", changedAgo: 0 }, { name: "Latecomer", status: "Wounded", changedAgo: 0 }] });
  });

  test("an author roster shows raw values only in the author list", () => {
    const composed = composeGame(sources(raw(), [{ secret_status: "plotting" }], { authorView: true }));
    expect(find(composed.player.widgets, "plots")).toBeUndefined();
    expect(find(composed.authorWidgets, "plots")?.body).toEqual({ kind: "roster", rows: [{ name: "Someone", status: "plotting", changedAgo: 0 }] });
  });

  test("the timeline lists reached named checkpoints with their dates and marks here and new; unnamed ones never show", () => {
    const before = composeGame(sources(walkable(), [{}])).player;
    expect(find(before.widgets, "road")?.body).toEqual({ kind: "timeline", chapters: [{ title: null, stops: [{ name: "The gate", date: "Day 1", here: true, fresh: false }] }] });
    const after = composeGame(sources(walkable(), [{}, { tried_climb: true }, { deep: true }])).player;
    expect(find(after.widgets, "road")?.body).toEqual({
      kind: "timeline", chapters: [{ title: null, stops: [{ name: "The gate", date: "Day 1", here: false, fresh: false }, { name: "The dock", date: "Day 2", here: false, fresh: false }] }],
    });
    expect(JSON.stringify(after)).not.toContain("SECRET");
  });

  test("timeline stops group under the chapter's player title", () => {
    const chaptered = walkable({
      chapters: [{ id: "one", title: "Chapter one", player_title: "The arrival" }, { id: "two", title: "Chapter two" }],
      checkpoints: raw().checkpoints.map((checkpoint, index) => ({ ...checkpoint, chapter: index === 0 ? "one" : "two" })),
    });
    const parsed = parseStoryV2(chaptered);
    if (isValidationErrorList(parsed)) throw new Error(JSON.stringify(parsed));
    const view = composeGame(sources(chaptered, [{ tried_climb: true }])).player;
    expect(find(view.widgets, "road")?.body).toEqual({
      kind: "timeline", chapters: [
        { title: "The arrival", stops: [{ name: "The gate", date: "Day 1", here: false, fresh: false }] },
        { title: "Chapter two", stops: [{ name: "The dock", date: "Day 2", here: true, fresh: true }] },
      ],
    });
  });

  test("intents: a line, a tab, and a roll that is offered only while its check waits for the attempt", () => {
    const waiting = composeGame(sources(raw(), [{}])).player.statSheet;
    expect(waiting?.actions).toEqual([
      { id: "ask", text: "I count what we have." },
      { id: "notes", text: "Open what I know", open: "memory" },
      { id: "climb", text: "I try to climb the wall.", roll: { label: "Climb", dice: "d20", target: 1 } },
    ]);
    const attempted = composeGame(sources(raw(), [{ tried_climb: true }, {}])).player.statSheet;
    expect(attempted?.actions?.map((intent) => intent.id)).toEqual(["ask", "notes"]);
  });

  test("a story with motion off marks every view still; motion is on otherwise", () => {
    const still = composeGame(sources(raw({ display: { motion: false } }), [{ supplies: 1 }])).player;
    expect([...still.widgets, ...still.journal, ...(still.statSheet ? [still.statSheet] : [])].every((view) => view.still === true)).toBe(true);
    const moving = composeGame(sources(raw(), [{ supplies: 1 }])).player;
    expect(moving.widgets.some((view) => view.still)).toBe(false);
  });
});

describe("author provenance (v2.8 23 A4)", () => {
  test("names the quality, who wrote it and the turn; nothing in player compose", () => {
    const playerOnly = composeGame(sources(raw(), [{ supplies: 3 }]));
    expect(playerOnly.provenance).toEqual({});
    const composed = composeGame(sources(raw(), [{ supplies: 3 }, { alarm: 1 }], { authorView: true, manual: new Set([1]) }));
    expect(composed.provenance.stock).toEqual([{ label: "Supplies", key: "supplies", writer: "reader", boundary: 1, messageId: 2 }]);
    expect(composed.provenance["alarm-clock"]).toEqual([{ label: "Alarm", key: "alarm", writer: "author", boundary: 2, messageId: 4 }]);
    expect(composed.provenance.party).toEqual([{ label: "arin", key: "arin_status" }, { label: "Latecomer", key: "arin_status" }]);
    expect(provenanceText(composed.provenance.stock[0])).toBe("Supplies (supplies): set by the reader at message #2, boundary 1");
    expect(provenanceText(composed.provenance.party[0])).toBe("arin (arin_status): unchanged in the turns this chat keeps");
    expect(JSON.stringify(composed.player)).not.toContain("supplies\"");
  });

  test("the synthesized stat sheet carries provenance for every public quality", () => {
    const story = raw({ widgets: [] });
    const composed = composeGame(sources(story, [{ supplies: 2 }], { authorView: true }));
    expect(composed.provenance["stat-sheet"]?.map((row) => row.key)).toEqual(["supplies", "alarm", "arin_status"]);
  });
});

describe("rollback ≡ replay for the follow-ups (v2.8 23 A4)", () => {
  const TURNS: Array<Record<string, PrimitiveValue>> = [{ supplies: 2 }, { alarm: 1 }, { arin_status: "hurt" }, { tried_climb: true }, { supplies: 5 }, { deep: true }];
  test.each([1, 2, 3, 4, 5])("cut after %i turns", (cut) => {
    const { normalized, engine } = play(walkable(), TURNS);
    const cutAt = cut * 2 + 1;
    expect(engine.rollbackTo(cut).ok).toBe(true);
    const rolled = composeGame({
      story: normalized, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: chatOf(cutAt), castNames: { arin: "Arin" }, authorView: true,
    });
    const replayed = composeGame(sources(walkable(), TURNS.slice(0, cut), { authorView: true, chatLength: cutAt }));
    expect(rolled).toEqual(replayed);
  });

  test("negative control: without the rollback the later turns still show", () => {
    const later = composeGame(sources(walkable(), TURNS, { authorView: true, chatLength: 7 }));
    const replayed = composeGame(sources(walkable(), TURNS.slice(0, 3), { authorView: true, chatLength: 7 }));
    expect(later).not.toEqual(replayed);
  });
});
