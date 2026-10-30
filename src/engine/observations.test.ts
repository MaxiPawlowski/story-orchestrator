import { StoryEngine, type EngineState } from "./engine";
import { diffStories, pruneEngineState } from "./storyDiff";
import { parseStory, parseStoryOrThrow } from "./validate";
import { isObservationKey, observationIdentity, observationKey, observationMissedKey, type NormalizedStory } from "./schema";
import { observationLatches, observationRoll, observationScopeUnits } from "./observations";
import { resolveCheck, resolveRoll } from "./storyChecks";
import { ROLLBACK_DETECTORS, uncoveredCodeKeys } from "./rollbackDetectors";
import { hasGameLayer } from "./quests";
import { usesGameLayer } from "./validate/gameLayer";
import { labRaw } from "../../test/support/codexLab";
import { OBSERVATION_CORPUS, corpusEngine, messageOf, observationLabRaw, observationLabStory, playCorpus } from "../../test/support/observationLab";

const errorsOf = (patch: Record<string, unknown>) => {
  const parsed = parseStory(observationLabRaw(patch));
  return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

const outcome = (state: EngineState, id: string) => {
  const noticed = state.blackboard.values[observationKey(id)];
  const missed = state.blackboard.values[observationMissedKey(id)];
  return { noticed: typeof noticed === "number" ? noticed : null, missed: typeof missed === "number" ? missed : null };
};

const comparable = (state: EngineState) => ({ values: state.blackboard.values, latched: state.blackboard.latched, active: state.activeCheckpointId, path: state.visitedPath, boundary: state.boundary });

describe("v2.9 08 observations: schema and validation", () => {
  test("the frozen corpus parses, compiles latching code keys and loads the game layer", () => {
    const story = observationLabStory();
    expect(story.observations).toHaveLength(40);
    expect(story.qualityByKey[observationKey("o01")]).toMatchObject({ type: "int", source: "code", latching: true, monotonic: true });
    expect(story.qualityByKey[observationMissedKey("o31")]).toBeDefined();
    expect(story.qualityByKey[observationMissedKey("o01")]).toBeUndefined();
    expect(usesGameLayer({ observations: [] })).toBe(true);
  });

  test("a story whose only game content is observations has a game layer", () => {
    const raw = labRaw();
    const bare = parseStoryOrThrow({ ...raw, codex: undefined, quests: undefined, observations: [{ id: "a", text: "Dust on the sill.", when: { q: "met_tom", op: "==", v: true } }] });
    expect(bare.codex).toBeUndefined();
    expect(bare.quests).toBeUndefined();
    expect(hasGameLayer(bare)).toBe(true);
  });

  test("refusals: duplicate id, long or macro text, start, unknown checkpoint, unknown key with nearest name, own key, unknown source", () => {
    const one = (observation: Record<string, unknown>) => errorsOf({ observations: [{ id: "a", text: "Dust on the sill.", when: { reached: "river" }, ...observation }] });
    expect(errorsOf({ observations: [{ id: "a", text: "x", when: { reached: "river" } }, { id: "a", text: "y", when: { reached: "river" } }] }).join("\n")).toMatch(/duplicate observation 'a'/);
    expect(one({ text: "x".repeat(201) }).join("\n")).toMatch(/at most 200/);
    expect(one({ text: "{{user}} sees dust." }).join("\n")).toMatch(/macros/);
    expect(one({ when: "start" }).join("\n")).toMatch(/codex fact/);
    expect(one({ when: { reached: "rivr" } }).join("\n")).toMatch(/unknown checkpoint 'rivr' \(did you mean "river"\?\)/);
    expect(one({ when: { q: "met_tomm", op: "==", v: true } }).join("\n")).toMatch(/unknown quality 'met_tomm' \(did you mean "met_tom"\?\)/);
    expect(one({ when: { q: "obs_a", op: ">=", v: 1 } }).join("\n")).toMatch(/which this observation writes/);
    expect(one({ source: "nobody" }).join("\n")).toMatch(/neither a codex entry nor a roster id/);
    expect(one({ source: "innkeeper" })).toEqual([]);
    expect(one({ id: "Bad_Id" }).join("\n")).toMatch(/lowercase slug/);
    expect(one({ passive: { roll: { sides: 6, target: 4 }, modifiers: [{ q: "nope", v: true, add: 1 }] } }).join("\n")).toMatch(/unknown quality 'nope'/);
    expect(one({ passive: { roll: { sides: 6, target: 4 }, outcome: {} } }).join("\n")).toMatch(/unknown key/);
    expect(one({ voice: "Instinct" }).join("\n")).toMatch(/unknown key/);
    expect(errorsOf({ qualities: [...(labRaw().qualities as unknown[]), { key: "obs_mine", type: "int", source: "code", rubric: "x" }] }).join("\n")).toMatch(/kept for observations/);
  });

  test("identity is id, rev, gate and passive; the text is not part of it", () => {
    const base = { id: "a", text: "Dust.", when: { reached: "river" } };
    expect(observationIdentity(base)).toBe(observationIdentity({ ...base, text: "Thick dust." } as typeof base));
    expect(observationIdentity(base)).not.toBe(observationIdentity({ ...base, rev: 2 }));
    expect(observationIdentity(base)).not.toBe(observationIdentity({ ...base, when: { reached: "mill" } }));
    expect(observationIdentity(base)).not.toBe(observationIdentity({ ...base, passive: { roll: { sides: 6, target: 3 } } }));
  });
});

describe("v2.9 08 O1: deterministic reveal over the frozen corpus", () => {
  test("every observation lands exactly at its expected boundary (40/40)", () => {
    const engine = corpusEngine(observationLabStory());
    playCorpus(engine);
    const state = engine.serialize();
    const misses = OBSERVATION_CORPUS.observations.filter((observation) => {
      const got = outcome(state, observation.id);
      const want = OBSERVATION_CORPUS.expected[observation.id];
      return got.noticed !== want.noticed || got.missed !== want.missed;
    }).map((observation) => ({ id: observation.id, got: outcome(state, observation.id), want: OBSERVATION_CORPUS.expected[observation.id] }));
    expect(misses).toEqual([]);
  });

  test("a replay with the same chat and story ids notices the same set at the same boundaries", () => {
    const first = corpusEngine(observationLabStory());
    const second = corpusEngine(observationLabStory());
    playCorpus(first);
    playCorpus(second);
    expect(comparable(second.serialize())).toEqual(comparable(first.serialize()));
  });

  test("without chat ids a passive observation never rolls and a plain one still lands", () => {
    const engine = corpusEngine(observationLabStory(), null);
    playCorpus(engine);
    const state = engine.serialize();
    expect(outcome(state, "o31")).toEqual({ noticed: null, missed: null });
    expect(outcome(state, "o01")).toEqual({ noticed: 1, missed: null });
  });

  test("a passive draw is seeded by chat, story, boundary and id, never Math.random", () => {
    const spy = jest.spyOn(Math, "random");
    const observation = { id: "dice", text: "x", when: { reached: "river" }, passive: { roll: { sides: 20, target: 11 } } };
    const values = {};
    const a = observationRoll(observation, { chatId: "c1", storyId: "s" }, 3, values);
    expect(observationRoll(observation, { chatId: "c1", storyId: "s" }, 3, values)).toEqual(a);
    const faces = Array.from({ length: 40 }, (_, index) => observationRoll(observation, { chatId: `c${index}`, storyId: "s" }, 3, values)?.faces[0]);
    expect(new Set(faces).size).toBeGreaterThan(5);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("a miss is final: the gate holding again never re-rolls", () => {
    const story = observationLabStory();
    const view = { boundary: 9, values: { searched_dock: true, [observationMissedKey("o32")]: 3 }, visitedPath: ["start"], activeCheckpointId: "start", chance: OBSERVATION_CORPUS.chance };
    expect(observationLatches(story, view).filter((write) => write.q.includes("o32"))).toEqual([]);
  });

  test("unnoticed observation gate keys join the discovery units; settled ones leave", () => {
    const story = observationLabStory();
    const fresh = observationScopeUnits(story, {}).facts.flat();
    expect(fresh).toContain("lost");
    expect(fresh).toContain("codex_p_widow_gone");
    const engine = corpusEngine(story);
    playCorpus(engine);
    const left = observationScopeUnits(story, engine.serialize().blackboard.values).facts.flat();
    expect(left).toEqual(["lost", "lost"]);
  });

  test("a passive modifier key joins its observation's discovery unit while unsettled; noticed or missed it leaves", () => {
    const story = parseStoryOrThrow(observationLabRaw({
      qualities: [...(observationLabRaw().qualities as unknown[]), { key: "lamp", type: "bool", source: "extractor", rubric: "Do they carry a lamp?" }],
      observations: [
        { id: "mark", text: "A scratch on the door.", when: { q: "lost", op: "==", v: true }, passive: { roll: { sides: 20, target: 11 }, modifiers: [{ q: "lamp", v: true, add: 4 }] } },
        { id: "soot", text: "Soot on the hearth.", when: { reached: "start" }, passive: { roll: { sides: 20, target: 11 }, modifiers: [{ q: "lamp", v: true, add: 2 }] } },
      ],
    }));
    expect(observationScopeUnits(story, {}).facts).toEqual([["lost", "lamp"], ["lamp"]]);
    expect(observationScopeUnits(story, { [observationKey("mark")]: 2 }).facts).toEqual([["lamp"]]);
    expect(observationScopeUnits(story, { [observationMissedKey("mark")]: 2, [observationKey("soot")]: 1 }).facts).toEqual([]);
  });

  test("resolveRoll is the roll half of resolveCheck", () => {
    const check = { id: "c", quality: "q", narrate: "hidden" as const, roll: { sides: 6, target: 7, dice: 2 }, modifiers: [{ q: "m", v: true, add: 2 }], outcome: { quality: "o", bands: "margin" as const, partial_margin: 2 } };
    const units = [0.5, 0.9];
    const values = { m: true };
    const { degree, ...roll } = resolveCheck(check, units, values);
    expect(roll).toEqual(resolveRoll(check.roll, check.modifiers, units, values));
    expect(degree).toBe("strong");
  });
});

describe("v2.9 08 O2: rollback equals replay over every cut", () => {
  const cuts = OBSERVATION_CORPUS.script.map((_, index) => messageOf(index + 1));

  test("the observations detector covers every compiled observation key", () => {
    const story = observationLabStory();
    expect(uncoveredCodeKeys(story, new Set()).filter(isObservationKey)).toEqual([]);
    const detector = ROLLBACK_DETECTORS.find((entry) => entry.id === "observations");
    expect(detector?.moved(story, {}, { [observationKey("o01")]: 1 })).toBe(true);
    expect(detector?.moved(story, {}, { [observationMissedKey("o32")]: 3 })).toBe(true);
    expect(detector?.moved(story, {}, { met_tom: true })).toBe(false);
  });

  test.each(cuts)("cut at message %i: rollback then replay equals the straight run, and the cut alone equals a run to it", (message) => {
    const story = observationLabStory();
    const straight = corpusEngine(story);
    playCorpus(straight);
    const cut = corpusEngine(story);
    playCorpus(cut);
    expect(cut.shouldRollbackFromMessage(message)).toBe(true);
    const boundary = cut.boundaryBeforeMessage(message);
    expect(boundary).not.toBeNull();
    expect(cut.rollbackTo(boundary as number).ok).toBe(true);
    const upTo = corpusEngine(story);
    playCorpus(upTo, cut.serialize().boundary);
    expect(comparable(cut.serialize())).toEqual(comparable(upTo.serialize()));
    playCorpus(cut, OBSERVATION_CORPUS.script.length, cut.serialize().boundary);
    expect(comparable(cut.serialize())).toEqual(comparable(straight.serialize()));
  });

  test("a code-only boundary that only latches an observation still rolls back", () => {
    const story = parseStoryOrThrow({ ...labRaw(), observations: [{ id: "late", text: "The lamp is lit.", when: { q: "codex_p_ferryman_debt", op: ">=", v: 1 } }] });
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: "heard_debt", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    expect(engine.serialize().blackboard.values[observationKey("late")]).toBe(2);
    expect(engine.shouldRollbackFromMessage(4)).toBe(true);
  });
});

describe("v2.9 08 story edits to observations", () => {
  const played = () => {
    const story = observationLabStory();
    const engine = corpusEngine(story);
    playCorpus(engine);
    return { story, state: engine.serialize() };
  };
  const edited = (change: (list: Array<Record<string, unknown>>) => Array<Record<string, unknown>>): NormalizedStory =>
    observationLabStory({ observations: change(JSON.parse(JSON.stringify(OBSERVATION_CORPUS.observations)) as Array<Record<string, unknown>>) });

  test("a reworded noticed line is compatible and keeps its latch", () => {
    const { story, state } = played();
    const next = edited((list) => list.map((entry) => (entry.id === "o01" ? { ...entry, text: "The rope is badly frayed." } : entry)));
    const diff = diffStories(story, next, state);
    expect(diff.entries.map((entry) => entry.code)).toEqual(["observation-edited"]);
    expect(pruneEngineState(state, next, diff).blackboard.values[observationKey("o01")]).toBe(1);
  });

  test("a changed gate, passive or rev is a new discovery: the latch and the miss are pruned", () => {
    const { story, state } = played();
    const next = edited((list) => list.map((entry) => (entry.id === "o01" ? { ...entry, rev: 2 } : entry.id === "o32" ? { ...entry, passive: { roll: { sides: 6, target: 1 } } } : entry)));
    const diff = diffStories(story, next, state);
    expect(diff.entries.map((entry) => entry.code)).toEqual(["observation-replaced", "observation-replaced"]);
    const pruned = pruneEngineState(state, next, diff);
    expect(pruned.blackboard.values[observationKey("o01")]).toBeUndefined();
    expect(pruned.blackboard.values[observationMissedKey("o32")]).toBeUndefined();
  });

  test("a removed observation is pruned, never left as an orphan", () => {
    const { story, state } = played();
    const next = edited((list) => list.filter((entry) => entry.id !== "o03"));
    const diff = diffStories(story, next, state);
    expect(diff.entries.map((entry) => entry.code)).toEqual(["observation-removed"]);
    expect(diff.classification).toBe("compatible");
    expect(pruneEngineState(state, next, diff).blackboard.values[observationKey("o03")]).toBeUndefined();
  });
});
