import { StoryEngine } from "./engine";
import { parseStory, parseStoryOrThrow } from "./validate";
import { appliedConsequences, consequenceWorldInfo, decideQuest, questStatus, shownConsequenceLabels, valueReader } from "./quests";
import { gatedWorldInfo } from "./worldInfoEffects";
import { questClosedKey, questConsequenceKey, type PrimitiveValue } from "./schema";

const bool = (key: string, source = "extractor") => ({ key, type: "bool", source, rubric: `Whether ${key} is true.` });
const is = (key: string, v: PrimitiveValue = true) => ({ q: key, op: "==", v });

const QUALITIES = [
  bool("asked"), bool("taken"), bool("freed"), bool("bargained"), bool("fled"), bool("refused"), bool("violent"), bool("witnessed"),
  { key: "method", type: "enum", values: ["talk", "force", "stealth"], source: "extractor", rubric: "How it was done." },
  { key: "coins", type: "int", source: "code", rubric: "Coins." },
  { key: "renown", type: "int", source: "code", rubric: "Renown." },
  { key: "town_mood", type: "enum", values: ["calm", "uneasy", "angry"], source: "code", rubric: "Town mood." },
  { key: "day_part", type: "int", source: "extractor", rubric: "Parts passed." },
  { key: "message_count", type: "int", source: "code", rubric: "Messages so far." },
];

const rescue = (extra: Record<string, unknown> = {}) => ({
  id: "rescue", title: "The miller's son", kind: "side",
  offered_when: is("asked"), visible_when: is("taken"), steps: [],
  resolutions: [
    { id: "freed", label: "Freed the boy", when: is("freed"), consequences: [
      { id: "thanks", set: { coins: { add: 5 } }, label: "The miller paid" },
      { id: "blood", when: is("violent"), set: { town_mood: "uneasy" }, label: "The town heard about the blood" },
    ] },
    { id: "ransomed", label: "Paid the ransom", when: is("bargained"), consequences: [{ id: "poorer", set: { coins: { add: -3 } } }] },
    { id: "abandoned", label: "Left him", when: is("fled") },
    { id: "declined", label: "Turned the miller away", from: ["offered"], when: is("refused") },
  ],
  precedence: ["abandoned", "freed", "ransomed", "declined"],
  ...extra,
});

const raw = (quests: unknown[] = [rescue()], more: Record<string, unknown> = {}) => ({
  title: "Resolution lab", description: "Synthetic quests with endings.",
  roster: [{ id: "miller", name: "Miller" }],
  qualities: QUALITIES,
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  quests,
  ...more,
});

const errorsOf = (json: unknown): string[] => {
  const parsed = parseStory(json);
  return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

const playing = (story = parseStoryOrThrow(raw()), on = true) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.useQuestSwitch(() => on);
  engine.loadStory(story);
  let message = 0;
  const turn = (deltas: Record<string, PrimitiveValue>) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    message += 2;
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  };
  const values = () => engine.serialize().blackboard.values;
  const status = (index = 0) => questStatus(story.quests![index], valueReader(values()));
  return { engine, story, turn, values, status };
};

describe("resolution validation", () => {
  test("two endings that can both hold need precedence: quest-resolutions-overlap", () => {
    const errors = errorsOf(raw([rescue({ precedence: undefined })]));
    expect(errors.some((error) => error.includes("quest-resolutions-overlap"))).toBe(true);
  });

  test("endings proven exclusive by one key's literals need no precedence", () => {
    const quest = {
      id: "duel", title: "The duel", kind: "side", steps: [],
      resolutions: [
        { id: "talked", label: "Talked him down", when: { all: [is("freed"), is("method", "talk")] } },
        { id: "forced", label: "Forced him", when: { all: [is("freed"), { q: "method", op: "in", v: ["force", "stealth"] }] } },
      ],
    };
    expect(errorsOf(raw([quest]))).toEqual([]);
  });

  test("endings from disjoint states are exclusive", () => {
    const quest = rescue({ resolutions: [rescue().resolutions[0], rescue().resolutions[3]], precedence: undefined });
    expect(errorsOf(raw([quest]))).toEqual([]);
  });

  test("precedence names every resolution exactly once and nothing else", () => {
    const missing = errorsOf(raw([rescue({ precedence: ["freed", "ransomed"] })]));
    expect(missing.some((error) => error.includes("precedence names every resolution"))).toBe(true);
    const unknown = errorsOf(raw([rescue({ precedence: ["abandoned", "freed", "ransomed", "declined", "ghost"] })]));
    expect(unknown.some((error) => error.includes("'ghost' is not a resolution"))).toBe(true);
  });

  test("ids: unique, not a lifecycle word, and not the sugar's done when done_when is given", () => {
    expect(errorsOf(raw([rescue({ resolutions: [{ id: "active", when: is("freed") }], precedence: undefined })])).some((error) => error.includes("names a quest state"))).toBe(true);
    const twice = rescue({ done_when: is("freed"), resolutions: [{ id: "done", when: is("bargained") }], precedence: undefined });
    expect(errorsOf(raw([twice])).some((error) => error.includes("duplicate resolution 'done'"))).toBe(true);
  });

  test("owner decision 1: an offered quest lapses on story time alone only as 'lapsed'", () => {
    const lapse = (id: string) => rescue({ resolutions: [{ id, label: "The offer passed", from: ["offered"], when: { q: "message_count", op: ">=", v: 9 } }], precedence: undefined });
    expect(errorsOf(raw([lapse("lapsed")]))).toEqual([]);
    expect(errorsOf(raw([lapse("missed")])).some((error) => error.includes("never fails on time alone"))).toBe(true);
    const reserved = rescue({ resolutions: [{ id: "lapsed", label: "Passed", when: is("fled") }], precedence: undefined });
    expect(errorsOf(raw([reserved])).some((error) => error.includes("'lapsed' is kept for an offer"))).toBe(true);
    const long = rescue({ resolutions: [{ id: "freed", label: "Freed the miller's son from the drowned cellar at last", when: is("freed") }], precedence: undefined });
    expect(errorsOf(raw([long]))).toEqual([]);
    const failed = rescue({ resolutions: undefined, precedence: undefined, done_when: is("freed"), failed_when: { q: "message_count", op: ">=", v: 9 } });
    expect(errorsOf(raw([failed])).some((error) => error.includes("never fails on time alone"))).toBe(true);
  });

  test("a consequence writes only declared code qualities, never a reserved quest key or a faction", () => {
    const writes = (set: Record<string, unknown>) => rescue({ resolutions: [{ id: "freed", when: is("freed"), consequences: [{ id: "x", set }] }], precedence: undefined });
    expect(errorsOf(raw([writes({ freed: true })])).some((error) => error.includes("declared code quality"))).toBe(true);
    expect(errorsOf(raw([writes({ [questClosedKey("rescue")]: "freed" })])).some((error) => error.includes("kept for a quest"))).toBe(true);
  });

  test("decline from offered needs offered_when", () => {
    const quest = rescue({ offered_when: undefined, resolutions: [rescue().resolutions[3]], precedence: undefined });
    expect(errorsOf(raw([quest])).some((error) => error.includes("needs offered_when"))).toBe(true);
  });

  test("requires names resolutions, and the bare id needs a done ending", () => {
    const after = (requires: unknown) => ({ id: "after", title: "Afterwards", kind: "side", steps: [], requires, done_when: is("witnessed") });
    expect(errorsOf(raw([rescue(), after([{ quest: "rescue", resolution: ["freed", "ransomed"] }])]))).toEqual([]);
    expect(errorsOf(raw([rescue(), after(["rescue"])])).some((error) => error.includes("has no resolution done"))).toBe(true);
    expect(errorsOf(raw([rescue(), after([{ quest: "rescue", resolution: ["ghost"] }])])).some((error) => error.includes("no resolution 'ghost'"))).toBe(true);
  });

  test("echoes and patterns take resolution ids", () => {
    const echo = (to: string) => ({ echoes: [{ id: "talk", after: { quest: "rescue", to }, delay: { boundaries: [1, 2] }, to: "miller", cue: "The miller remembers." }] });
    expect(errorsOf(raw([rescue()], echo("ransomed")))).toEqual([]);
    expect(errorsOf(raw([rescue()], echo("ghost"))).some((error) => error.includes("no resolution 'ghost'"))).toBe(true);
    const pattern = (to: string) => ({ patterns: [{ id: "p", steps: [{ kind: "quest", id: "rescue", to }], text: "Once again the river decides." }] });
    expect(errorsOf(raw([rescue()], pattern("freed"))).filter((error) => error.includes("moves to"))).toEqual([]);
    expect(errorsOf(raw([rescue()], pattern("ghost"))).some((error) => error.includes("moves to"))).toBe(true);
  });

  test("compiled keys: the closed enum holds every ending, one int latch per consequence", () => {
    const story = parseStoryOrThrow(raw());
    expect(story.qualityByKey[questClosedKey("rescue")]).toMatchObject({ type: "enum", values: ["done", "failed", "freed", "ransomed", "abandoned", "declined"], latching: true, source: "code" });
    expect(story.qualityByKey[questConsequenceKey("rescue", "freed", "blood")]).toMatchObject({ type: "int", latching: true, source: "code" });
  });
});

describe("resolution evaluation", () => {
  test("one ending closes the quest and pays its unconditional consequences", () => {
    const play = playing();
    play.turn({ asked: true, taken: true });
    play.turn({ freed: true });
    expect(play.status()).toBe("freed");
    expect(play.values().coins).toBe(5);
    expect(play.values().town_mood).toBeUndefined();
    expect(play.values()[questConsequenceKey("rescue", "freed", "thanks")]).toBe(2);
  });

  test("unexpected method: the conditional clause reads the method key at close", () => {
    const play = playing();
    play.turn({ asked: true, taken: true, violent: true });
    play.turn({ freed: true });
    expect(play.values().town_mood).toBe("uneasy");
    play.turn({ violent: false });
    expect(play.values().town_mood).toBe("uneasy");
  });

  test("a clause false at close is never applied later", () => {
    const play = playing();
    play.turn({ asked: true, taken: true });
    play.turn({ freed: true });
    play.turn({ violent: true });
    expect(play.values()[questConsequenceKey("rescue", "freed", "blood")]).toBeUndefined();
  });

  test("ambiguous match resolves by precedence, never by declaration order", () => {
    const play = playing();
    play.turn({ asked: true, taken: true, freed: true, fled: true });
    expect(play.status()).toBe("abandoned");
    const reversed = parseStoryOrThrow(raw([rescue({ resolutions: [...rescue().resolutions].reverse() })]));
    const again = playing(reversed);
    again.turn({ asked: true, taken: true, freed: true, fled: true });
    expect(again.status()).toBe("abandoned");
  });

  test("hold_when_ambiguous keeps the quest open while two endings match", () => {
    const story = parseStoryOrThrow(raw([rescue({ hold_when_ambiguous: true })]));
    const play = playing(story);
    play.turn({ asked: true, taken: true, freed: true, bargained: true });
    expect(play.status()).toBe("active");
    expect(decideQuest(story.quests![0], valueReader(play.values()))).toMatchObject({ held: true, matched: ["freed", "ransomed"] });
    play.turn({ bargained: false });
    expect(play.status()).toBe("freed");
  });

  test("partial resolution: an ending with its own smaller consequence", () => {
    const play = playing();
    play.turn({ asked: true, taken: true, bargained: true });
    expect(play.status()).toBe("ransomed");
    expect(play.values().coins).toBe(-3);
  });

  test("decline closes an offered quest without it being taken up", () => {
    const play = playing();
    play.turn({ asked: true });
    expect(play.status()).toBe("offered");
    play.turn({ refused: true });
    expect(play.status()).toBe("declined");
  });

  test("ignore: an offered quest with no decline gate stays offered and never fails", () => {
    const play = playing();
    play.turn({ asked: true });
    for (let index = 0; index < 6; index += 1) play.turn({ fled: true, freed: true, day_part: index });
    expect(play.status()).toBe("offered");
  });

  test("lapse: a time-only ending from offered closes as lapsed", () => {
    const quest = rescue({ resolutions: [...rescue().resolutions, { id: "lapsed", label: "The offer passed", from: ["offered"], when: { q: "message_count", op: ">=", v: 6 } }],
      precedence: ["abandoned", "freed", "ransomed", "declined", "lapsed"] });
    const play = playing(parseStoryOrThrow(raw([quest])));
    play.turn({ asked: true });
    expect(play.status()).toBe("offered");
    play.turn({});
    play.turn({});
    expect(play.status()).toBe("lapsed");
  });

  test("repeated extraction: the same read twice closes once and pays once", () => {
    const play = playing();
    play.turn({ asked: true, taken: true });
    play.turn({ freed: true });
    play.turn({ freed: true });
    play.turn({ freed: true, bargained: true });
    expect(play.values().coins).toBe(5);
    expect(play.status()).toBe("freed");
  });

  test("aggregation: adds to one key from two quests are summed once, literals resolve by quest id", () => {
    const pay = (id: string, add: number, mood: string) => ({ id, title: `Quest ${id}`, kind: "side", steps: [], done_when: is("witnessed"),
      reward: { set: { renown: { add }, town_mood: mood } } });
    const story = parseStoryOrThrow(raw([pay("zeta", 2, "angry"), pay("alpha", 3, "calm")]));
    story.qualityByKey.renown = { ...story.qualityByKey.renown, step_rule: { step: 1, min: 0, max: 4, start: 0 } };
    const play = playing(story);
    play.turn({ witnessed: true });
    expect(play.values().renown).toBe(4);
    expect(play.values().town_mood).toBe("calm");
  });

  test("chains land next boundary whatever the array order", () => {
    const after = { id: "after", title: "Afterwards", kind: "side", steps: [], done_when: is("witnessed"), requires: [{ quest: "rescue", resolution: ["freed"] }] };
    for (const quests of [[rescue(), after], [after, rescue()]]) {
      const story = parseStoryOrThrow(raw(quests));
      const play = playing(story);
      play.turn({ asked: true, taken: true, witnessed: true });
      play.turn({ freed: true });
      const index = story.quests!.findIndex((quest) => quest.id === "after");
      expect(play.status(index)).toBe("active");
      play.turn({});
      expect(play.status(index)).toBe("done");
    }
  });

  test("switch off: authored endings are ignored and nothing is applied in their place", () => {
    const story = parseStoryOrThrow(raw([rescue({ done_when: is("witnessed"), precedence: ["abandoned", "freed", "ransomed", "declined", "done"] })]));
    const play = playing(story, false);
    play.turn({ asked: true, taken: true, freed: true, violent: true });
    expect(play.status()).toBe("active");
    expect(play.values().coins).toBeUndefined();
    expect(play.values().town_mood).toBeUndefined();
    play.turn({ witnessed: true });
    expect(play.status()).toBe("done");
  });

  test("reload: a hydrated engine keeps the close and never pays twice", () => {
    const play = playing();
    play.turn({ asked: true, taken: true });
    play.turn({ freed: true });
    const reopened = new StoryEngine({ now: () => 0 });
    reopened.loadStory(play.story);
    reopened.hydrate(play.engine.serialize(), play.engine.serializeHistory());
    reopened.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "freed", v: true, source: "extractor" }] });
    reopened.commitBoundary({ lastMessageId: 10, chatLength: 11 });
    expect(reopened.serialize().blackboard.values.coins).toBe(5);
    expect(reopened.serialize().blackboard.values[questClosedKey("rescue")]).toBe("freed");
  });

  test("cross-chat: a second chat on the same story starts clean", () => {
    const story = parseStoryOrThrow(raw());
    const first = playing(story);
    first.turn({ asked: true, taken: true, freed: true });
    const second = playing(story);
    expect(second.status()).toBe("hidden");
    second.turn({ asked: true, taken: true, bargained: true });
    expect(second.status()).toBe("ransomed");
    expect(first.status()).toBe("freed");
    expect(first.values().coins).toBe(5);
    expect(second.values().coins).toBe(-3);
  });

  test("a swipe of the closing reply rolls the close and its consequences back", () => {
    const play = playing();
    play.turn({ asked: true, taken: true });
    play.turn({ freed: true, violent: true });
    expect(play.engine.shouldRollbackFromMessage(4)).toBe(true);
    play.engine.rollbackTo(1);
    expect(play.status()).toBe("active");
    expect(play.values().coins).toBeUndefined();
    expect(play.values()[questConsequenceKey("rescue", "freed", "blood")]).toBeUndefined();
  });
});

describe("resolution surfaces", () => {
  test("only the reached ending's applied, visible consequence labels show", () => {
    const quest = rescue();
    const consequences = quest.resolutions[0].consequences as Array<Record<string, unknown>>;
    consequences[1] = { ...consequences[1], visible_when: is("witnessed") };
    const story = parseStoryOrThrow(raw([quest]));
    const play = playing(story);
    play.turn({ asked: true, taken: true, violent: true });
    play.turn({ freed: true });
    expect(shownConsequenceLabels(story.quests![0], valueReader(play.values()))).toEqual(["The miller paid"]);
    play.turn({ witnessed: true });
    expect(shownConsequenceLabels(story.quests![0], valueReader(play.values()))).toEqual(["The town heard about the blood", "The miller paid"]);
  });

  test("consequence world_info joins the gated census and the earned switches, ordered by applied boundary then quest id", () => {
    const wi = (comment: string) => ({ enable: [{ lorebook: "Book", comments: [comment] }] });
    const quest = (id: string, comment: string, gate: string) => ({ id, title: id, kind: "side", steps: [], resolutions: [{ id: "end", when: is(gate), consequences: [{ id: "lore", effects: { world_info: wi(comment) } }] }] });
    const json = raw([quest("b", "Bee", "freed"), quest("a", "Ay", "freed"), quest("c", "Sea", "witnessed")]);
    expect([...gatedWorldInfo([json]).get("Book") ?? []].sort()).toEqual(["Ay", "Bee", "Sea"]);
    const story = parseStoryOrThrow(json);
    const play = playing(story);
    play.turn({ witnessed: true });
    play.turn({ freed: true });
    expect(appliedConsequences(story, play.values()).map((item) => item.questId)).toEqual(["c", "a", "b"]);
    expect(consequenceWorldInfo(story, play.values())).toHaveLength(3);
  });
});

describe("optional and alternative steps", () => {
  const stepped = (steps: unknown[]) => parseStoryOrThrow(raw([{ id: "trail", title: "The trail", kind: "side", steps }]));
  const step = (text: string, gate: string, extra: Record<string, unknown> = {}) => ({ text, done_when: is(gate), ...extra });

  test("default completion skips optional steps and needs one of each alternative group", () => {
    const story = stepped([step("Find tracks", "freed"), step("Ask around", "bargained", { optional: true }), step("Climb", "fled"), step("Swim", "violent", { alternative_of: 2 })]);
    const play = playing(story);
    play.turn({ freed: true });
    expect(play.status()).toBe("active");
    play.turn({ violent: true });
    expect(play.status()).toBe("done");
  });

  test("an alternative names a required step", () => {
    const errors = errorsOf(raw([{ id: "trail", title: "The trail", kind: "side", steps: [step("A", "freed", { optional: true }), step("B", "witnessed"), step("C", "fled", { alternative_of: 0 })] }]));
    expect(errors.some((error) => error.includes("alternative_of names a required step"))).toBe(true);
    const all = errorsOf(raw([{ id: "trail", title: "The trail", kind: "side", steps: [step("A", "freed", { optional: true })] }]));
    expect(all.some((error) => error.includes("every step is optional"))).toBe(true);
  });
});
