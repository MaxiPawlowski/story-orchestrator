import { StoryEngine } from "./engine";
import { parseStoryV2 } from "./validate";
import { hasGameLayer } from "./quests";
import { codexEntryKey, codexFactKey, type PrimitiveValue, type ValidationError } from "./schema";
import { codexItems, codexScopeUnits, entryKnown, factKnown, knownEntities, unknownCodexNames } from "./codex";
import { labRaw, labStory } from "../../test/support/codexLab";

const errorsOf = (raw: Record<string, unknown>): ValidationError[] => {
  const parsed = parseStoryV2(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const codexWith = (people: unknown[], places: unknown[] = []) => labRaw({ codex: { people, places } });

const playing = (story = labStory()) => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  let message = 0;
  const turn = (deltas: Record<string, PrimitiveValue> = {}) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    message += 2;
    return engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  };
  return { engine, story, turn, values: () => engine.serialize().blackboard.values };
};

describe("plan 52 codex validation", () => {
  test("the lab story parses and compiles a latch per gated entry and fact, none for start lines", () => {
    const story = labStory();
    expect(story.qualityByKey[codexFactKey("people", "ferryman", "job")]).toMatchObject({ type: "int", source: "code", latching: true, monotonic: true });
    expect(story.qualityByKey[codexEntryKey("places", "boathouse")]).toBeDefined();
    expect(story.qualityByKey[codexFactKey("people", "self", "background")]).toBeUndefined();
    expect(story.qualityByKey[codexEntryKey("places", "landing")]).toBeUndefined();
  });

  test("refuses a reached checkpoint that does not exist, duplicate ids, a second page for one member and a macro", () => {
    expect(errorsOf(codexWith([{ id: "a", name: "A", facts: [{ id: "f", text: "x", known_when: { reached: "nowhere" } }] }]))).toEqual([
      expect.objectContaining({ path: "codex.people.0.facts.0.known_when.reached" })]);
    expect(errorsOf(codexWith([{ id: "a", name: "A", facts: [] }], [{ id: "b", name: "B", facts: [{ id: "f", text: "x", known_when: "start" }, { id: "f", text: "y", known_when: "start" }] }]))
      .map((error) => error.path)).toEqual(["codex.places.0.facts.1.id"]);
    expect(errorsOf(codexWith([{ id: "a", name: "A", facts: [] }, { id: "a", name: "B", facts: [] }])).map((error) => error.path)).toEqual(["codex.people.1.id"]);
    expect(errorsOf(codexWith([{ id: "a", member: "tom", facts: [] }, { id: "b", member: "tom", facts: [] }])).map((error) => error.path)).toEqual(["codex.people.1.member"]);
    expect(errorsOf(codexWith([{ id: "a", name: "A", facts: [{ id: "f", text: "{{user}} knows", known_when: "start" }] }])).map((error) => error.path)).toEqual(["codex.people.0.facts.0.text"]);
  });

  test("refuses ids with '_', unknown members, places with a member and a location outside the enum", () => {
    expect(errorsOf(codexWith([{ id: "a_b", name: "A", facts: [] }])).map((error) => error.path)).toEqual(["codex.people.0.id"]);
    expect(errorsOf(codexWith([{ id: "a", member: "nobody", facts: [] }])).map((error) => error.path)).toEqual(["codex.people.0.member"]);
    expect(errorsOf(codexWith([], [{ id: "p", name: "P", member: "tom", facts: [] }])).map((error) => error.path)).toEqual(["codex.places.0.member"]);
    expect(errorsOf(codexWith([], [{ id: "p", name: "P", location: "moon", facts: [] }])).map((error) => error.path)).toEqual(["codex.places.0.location"]);
  });

  test("a story quality cannot take a codex key, and a fact source must exist", () => {
    const raw = labRaw();
    const taken = errorsOf({ ...raw, qualities: [...(raw.qualities as unknown[]), { key: "codex_p_x", type: "bool", source: "extractor", rubric: "r" }] });
    expect(taken.some((error) => error.message.includes("kept for the codex"))).toBe(true);
    expect(errorsOf(codexWith([{ id: "a", name: "A", facts: [{ id: "f", text: "x", known_when: "start", source: "ghost" }] }])).map((error) => error.path))
      .toEqual(["codex.people.0.facts.0.source"]);
  });

  test("a gate that holds at the start is not refused (the Studio suggests \"start\" instead)", () => {
    expect(errorsOf(codexWith([{ id: "a", name: "A", facts: [{ id: "f", text: "x", known_when: { not: { q: "paid", op: "==", v: true } } }] }]))).toEqual([]);
  });

  test("C13 feature-only: a story with only a codex has a game layer; one with nothing does not", () => {
    const only = labStory({ quests: undefined });
    expect(only.quests).toBeUndefined();
    expect(hasGameLayer(only)).toBe(true);
    expect(hasGameLayer(labStory({ quests: undefined, codex: undefined }))).toBe(false);
  });
});

describe("plan 52 codex latches", () => {
  test("a fact latches the boundary its gate first holds and stays when the gate stops holding", () => {
    const { turn, values } = playing();
    turn({ heard_debt: true });
    const key = codexFactKey("people", "ferryman", "debt");
    expect(values()[key]).toBe(1);
    turn({ heard_debt: false });
    expect(values()[key]).toBe(1);
  });

  test("a reached fact lands in the boundary its transition fires (SC2 step 7)", () => {
    const { turn, values } = playing();
    const result = turn({ met_tom: true });
    expect(result.fired?.to).toBe("river");
    expect(values()[codexFactKey("people", "ferryman", "job")]).toBe(1);
    expect(values()[codexEntryKey("people", "ferryman")]).toBe(1);
  });

  test("a place with a location is known once the party has been there, and stays", () => {
    const { story, turn, values } = playing();
    const boathouse = story.codex!.places![1];
    turn({ location: "boathouse" });
    turn({ location: "landing" });
    expect(entryKnown("places", boathouse, values())).toBe(true);
    expect(boathouse.facts.some((fact) => factKnown("places", boathouse, fact, values()))).toBe(false);
  });

  test("C12 start lines are known at boundary 0 with no latch", () => {
    const { story, values } = playing();
    const self = story.codex!.people![3];
    expect(entryKnown("people", self, values())).toBe(true);
    expect(self.facts.filter((fact) => factKnown("people", self, fact, values())).map((fact) => fact.id)).toEqual(["background", "purse"]);
  });

  test("SC3: the latch pass writes only codex keys and nothing else a member could read", () => {
    const { engine, turn } = playing();
    const before = engine.serialize().blackboard.values;
    turn({ searched_dock: true });
    const after = engine.serialize().blackboard.values;
    const moved = Object.keys(after).filter((key) => before[key] !== after[key]);
    expect(moved.filter((key) => !key.startsWith("codex_")).sort()).toEqual(["searched_dock"]);
  });
});

describe("plan 52 discovery and known entities", () => {
  test("unknown entries offer their own gate and every first-fact gate; known entries offer their unknown facts", () => {
    const story = labStory();
    const fresh = codexScopeUnits(story, {});
    expect(fresh.entries).toContainEqual(["found_ledger", "asked_widow", "rang_bell"]);
    expect(fresh.entries).toContainEqual(["met_tom", "heard_debt", "searched_dock"]);
    const later = codexScopeUnits(story, { [codexFactKey("people", "innkeeper", "ledger")]: 3 });
    expect(later.facts).toEqual(expect.arrayContaining([["asked_widow"], ["rang_bell"]]));
    expect(later.entries).not.toContainEqual(["found_ledger", "asked_widow", "rang_bell"]);
  });

  test("SC3 knownEntities: an entry by its latch, a member without an entry while enabled, a member with an entry by that entry", () => {
    const story = labStory();
    const fresh = knownEntities(story, {}, ["tom", "ada"]);
    expect(fresh.members.has("ada")).toBe(true);
    expect(fresh.members.has("tom")).toBe(false);
    expect(knownEntities(story, {}, []).members.has("ada")).toBe(false);
    const met = knownEntities(story, { [codexEntryKey("people", "ferryman")]: 1 }, []);
    expect(met.members.has("tom")).toBe(true);
    expect(met.entries.has("people:ferryman")).toBe(true);
  });

  test("unknown entry names and aliases are withheld; known ones are not", () => {
    const story = labStory();
    expect(unknownCodexNames(story, {})).toEqual(expect.arrayContaining(["Marla the innkeeper", "Marla", "Oriel Vasque", "the widow", "Grimsby mill"]));
    expect(unknownCodexNames(story, {})).not.toContain("The landing");
    expect(codexItems(story)).toHaveLength(7);
  });
});
