import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryEngine, codexArmedKey, codexReturnKey, isCodexKey, type EngineState, type NormalizedStory, type PrimitiveValue, type ValidationError } from "@engine/index";
import { codexItems } from "@engine/codex";
import { parseStory, parseStoryOrThrow } from "@engine/validate";
import { diffStories, pruneEngineState } from "@engine/storyDiff";
import { composeGame } from "./widgets";
import { JournalPanel } from "../components/panels/JournalPanel";
import { labRaw, randomWrites, rng } from "../../test/support/codexLab";
import type { GameView } from "./gameTypes";

type Turn = Array<{ q: string; v: PrimitiveValue }>;
type RawPlace = { id: string; returns?: Array<Record<string, unknown>> } & Record<string, unknown>;

const CAST = { tom: "Tom", ada: "Ada" };
const is = (key: string) => ({ q: key, op: "==", v: true });
const DOOR = "The back door still hangs off one hinge.";
const NETS = "Someone has mended the cut nets.";
const WHEEL = "The wheel has stopped at last.";

const RETURNS: Record<string, Array<Record<string, unknown>>> = {
  boathouse: [{ id: "door", text: DOOR, when: is("lost") }, { id: "nets", text: NETS, when: { reached: "mill" } }],
  mill: [{ id: "wheel", text: WHEEL, when: is("paid") }],
};

const placesWith = (change: (places: RawPlace[]) => RawPlace[] = (places) => places): Record<string, unknown> => {
  const raw = labRaw();
  const codex = raw.codex as { people: unknown[]; places: RawPlace[] };
  const places = codex.places.map((place) => (RETURNS[place.id] ? { ...place, returns: RETURNS[place.id] } : place));
  return { ...raw, codex: { ...codex, places: change(JSON.parse(JSON.stringify(places)) as RawPlace[]) } };
};

const returnsStory = (change?: (places: RawPlace[]) => RawPlace[]): NormalizedStory => parseStoryOrThrow(placesWith(change));

const door = (places: RawPlace[]) => places.find((place) => place.id === "boathouse")!.returns!.find((back) => back.id === "door")!;

const engineFor = (story: NormalizedStory) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  return engine;
};

const play = (engine: StoryEngine, turns: Turn[], from = 0, lag = true) => {
  turns.forEach((deltas, index) => {
    const message = (from + index + 1) * 2;
    const window = lag ? {} : { turnRange: { from: message - 1, to: message } };
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, ...window, deltas: deltas.map((delta) => ({ ...delta, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  });
};

const view = (story: NormalizedStory, engine: StoryEngine): GameView =>
  composeGame({ story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST, enabled: ["tom", "ada"] }).player;

const boathouseRows = (game: GameView) => game.codex?.places.find((entry) => entry.name === "Kessel boathouse")?.rows ?? [];

const errorsOf = (raw: Record<string, unknown>): string[] => {
  const parsed = parseStory(raw);
  return Array.isArray(parsed) ? (parsed as ValidationError[]).map((error) => `${error.path}: ${error.message}`) : [];
};

const at = (location: string): Turn => [{ q: "location", v: location }];

describe("M52e E1: a return line shows only when the party comes back after the event", () => {
  const story = returnsStory();

  test("known place, event while away, then back: the line shows once, fresh, as a return row", () => {
    const engine = engineFor(story);
    play(engine, [at("boathouse"), at("landing"), [{ q: "lost", v: true }], at("boathouse")]);
    const values = engine.serialize().blackboard.values;
    expect(values[codexArmedKey("boathouse", "door")]).toBe(3);
    expect(values[codexReturnKey("boathouse", "door")]).toBe(4);
    expect(boathouseRows(view(story, engine))).toEqual([{ text: DOOR, kind: "return", fresh: true }]);
    play(engine, [[]], 4);
    expect(boathouseRows(view(story, engine))).toEqual([{ text: DOOR, kind: "return" }]);
  });

  test("the event while still at the place shows nothing until the party leaves and comes back", () => {
    const engine = engineFor(story);
    play(engine, [at("boathouse"), [{ q: "lost", v: true }], []]);
    expect(boathouseRows(view(story, engine))).toEqual([]);
    play(engine, [at("mill"), at("boathouse")], 3);
    expect(boathouseRows(view(story, engine))).toEqual([{ text: DOOR, kind: "return", fresh: true }]);
  });

  test("an event before the place is known waits for it: the first visit is not a return", () => {
    const engine = engineFor(story);
    play(engine, [[{ q: "lost", v: true }], at("boathouse"), []]);
    expect(boathouseRows(view(story, engine))).toEqual([]);
    expect(engine.serialize().blackboard.values[codexArmedKey("boathouse", "door")]).toBeUndefined();
    play(engine, [at("landing"), at("boathouse")], 3);
    expect(boathouseRows(view(story, engine)).map((row) => row.text)).toEqual([DOOR]);
  });

  test("a reached gate counts as the event; rows keep authored order", () => {
    const engine = engineFor(story);
    play(engine, [at("boathouse"), [{ q: "met_tom", v: true }, { q: "location", v: "landing" }], [{ q: "saw_mill", v: true }], [{ q: "lost", v: true }], at("boathouse")]);
    expect(boathouseRows(view(story, engine)).map((row) => row.text)).toEqual([DOOR, NETS]);
  });

  test("a story without returns writes no return keys", () => {
    const plain = parseStoryOrThrow(labRaw());
    const engine = engineFor(plain);
    play(engine, [at("boathouse"), at("landing"), [{ q: "lost", v: true }], at("boathouse")]);
    expect(Object.keys(engine.serialize().blackboard.values).filter((key) => key.startsWith("codex_a_") || key.startsWith("codex_r_"))).toEqual([]);
  });
});

describe("M52e E2: returns are projection-only", () => {
  const story = returnsStory();
  const texts = [DOOR, NETS, WHEEL];
  const run = (seed: number) => {
    const random = rng(seed);
    const engine = engineFor(story);
    play(engine, Array.from({ length: 2 + Math.floor(random.next() * 16) }, () => randomWrites(random, story)));
    return engine;
  };

  test("over 500 random paths no unshown return text reaches the view or the Journal; some paths show one", () => {
    let leaks = 0;
    let shown = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = run(seed);
      const game = view(story, engine);
      const surfaces = `${JSON.stringify(game)}\n${renderToStaticMarkup(createElement(JournalPanel, { game }))}`;
      const values = engine.serialize().blackboard.values;
      const unshown = codexItems(story).flatMap(({ entry }) => (entry.returns ?? []).filter((back) => values[codexReturnKey(entry.id, back.id)] === undefined).map((back) => back.text));
      leaks += unshown.filter((text) => surfaces.includes(text)).length;
      if (texts.some((text) => surfaces.includes(text))) shown += 1;
    }
    expect(leaks).toBe(0);
    expect(shown).toBeGreaterThan(20);
  });

  test("the place page is byte-identical with and without unshown returns declared", () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const engine = run(seed);
      const state = engine.serialize();
      const values = state.blackboard.values;
      const trimmed = returnsStory((places) => places.map((place) => {
        const kept = (place.returns ?? []).filter((back) => values[codexReturnKey(place.id, String(back.id))] !== undefined);
        const { returns: _drop, ...rest } = place;
        return kept.length ? { ...rest, returns: kept } : rest;
      }));
      const twin = engineFor(trimmed);
      twin.hydrate({ ...state, blackboard: { ...state.blackboard, values: Object.fromEntries(Object.entries(values).filter(([key]) => !isCodexKey(key) || trimmed.qualityByKey[key])) } } as EngineState);
      expect(JSON.stringify(view(trimmed, twin).codex)).toBe(JSON.stringify(view(story, engine).codex));
    }
  });
});

describe("M52e E3: return latches roll back exactly as a replay rebuilds them", () => {
  const story = returnsStory();
  test.each(Array.from({ length: 60 }, (_, index) => index + 1))("seed %i", (seed) => {
    const random = rng(seed * 104729);
    const lag = seed % 2 === 0;
    const turns = Array.from({ length: 8 + (seed % 12) }, () => randomWrites(random, story));
    const straight = engineFor(story);
    play(straight, turns, 0, lag);
    const replayed = engineFor(story);
    play(replayed, turns, 0, lag);
    const message = 2 * (1 + Math.floor(random.next() * turns.length));
    const moved = replayed.stateLog.some((entry) => entry.context.lastMessageId >= message && Object.keys(entry.after.blackboard.values)
      .some((key) => (key.startsWith("codex_a_") || key.startsWith("codex_r_")) && entry.before.blackboard.values[key] !== entry.after.blackboard.values[key]));
    if (moved) expect(replayed.shouldRollbackFromMessage(message)).toBe(true);
    if (replayed.shouldRollbackFromMessage(message)) {
      const boundary = replayed.boundaryBeforeMessage(message);
      expect(boundary).not.toBeNull();
      expect(replayed.rollbackTo(boundary as number).ok).toBe(true);
      const restored = replayed.serialize().boundary;
      play(replayed, turns.slice(restored), restored, lag);
    }
    expect(replayed.serialize().blackboard.values).toEqual(straight.serialize().blackboard.values);
  });

  test("code-only boundary: a swipe of the reply that came back removes the line, and replay restores it", () => {
    const engine = engineFor(story);
    play(engine, [at("boathouse"), at("landing"), [{ q: "lost", v: true }], at("boathouse")]);
    expect(engine.shouldRollbackFromMessage(8)).toBe(true);
    expect(engine.rollbackTo(engine.boundaryBeforeMessage(8) as number).ok).toBe(true);
    expect(engine.serialize().blackboard.values[codexReturnKey("boathouse", "door")]).toBeUndefined();
    expect(engine.serialize().blackboard.values[codexArmedKey("boathouse", "door")]).toBe(3);
    play(engine, [at("boathouse")], 3);
    expect(engine.serialize().blackboard.values[codexReturnKey("boathouse", "door")]).toBe(4);
  });
});

type Change = (raw: Record<string, unknown>) => void;
const places = (raw: Record<string, unknown>) => (raw.codex as { places: Array<Record<string, unknown>> }).places;
const firstReturn = (raw: Record<string, unknown>) => (places(raw)[1].returns as Array<Record<string, unknown>>)[0];

describe("M52e E4: validation", () => {
  const cases: Array<[string, Change, string]> = [
    ["a return on a person", (raw) => { (raw.codex as { people: Array<Record<string, unknown>> }).people[0].returns = [{ id: "x", text: "Back again.", when: is("lost") }]; },
      "returns belong to a place"],
    ["a place without a location", (raw) => { places(raw)[0].returns = [{ id: "x", text: "Back again.", when: is("lost") }]; }, "needs the place's location"],
    ["a return known at the start", (raw) => { firstReturn(raw).when = "start"; }, "never \"start\""],
    ["an unknown checkpoint", (raw) => { firstReturn(raw).when = { reached: "nowhere" }; }, "unknown checkpoint 'nowhere'"],
    ["a duplicate id", (raw) => { places(raw)[1].returns = [...(places(raw)[1].returns as unknown[]), { id: "door", text: "Again.", when: is("paid") }]; }, "duplicate return 'door'"],
    ["more than six", (raw) => { places(raw)[1].returns = Array.from({ length: 7 }, (_, index) => ({ id: `r${index}`, text: "Again.", when: is("paid") })); }, "at most 6 returns"],
    ["a return without when", (raw) => { delete firstReturn(raw).when; }, "a return needs when"],
    ["an authored codex_r_ quality", (raw) => { (raw.qualities as unknown[]).push({ key: "codex_r_x", type: "int", source: "code", rubric: "x" }); }, "kept for the codex"],
  ];

  test.each(cases)("refuses %s", (_name, change, message) => {
    const raw = placesWith();
    change(raw);
    expect(errorsOf(raw).some((error) => error.includes(message))).toBe(true);
  });

  test("the returns story is valid and compiles two latching ints per return", () => {
    const story = returnsStory();
    expect(story.qualityByKey[codexArmedKey("boathouse", "door")]).toMatchObject({ type: "int", source: "code", latching: true, monotonic: true });
    expect(story.qualityByKey[codexReturnKey("mill", "wheel")]).toMatchObject({ type: "int", source: "code", latching: true, monotonic: true });
  });
});

describe("M52e E5: story edits to a return", () => {
  const shownState = (story: NormalizedStory) => {
    const engine = engineFor(story);
    play(engine, [at("boathouse"), at("landing"), [{ q: "lost", v: true }], at("boathouse")]);
    return engine.serialize();
  };

  test("rewording keeps the shown line; a gate change or rev bump drops it; removal prunes it", () => {
    const story = returnsStory();
    const state = shownState(story);
    const reworded = returnsStory((list) => { door(list).text = "The door is gone now."; return list; });
    const edit = diffStories(story, reworded, state);
    expect(edit.entries.map((entry) => entry.code)).toEqual(["codex-return-edited"]);
    expect(pruneEngineState(state, reworded, edit).blackboard.values[codexReturnKey("boathouse", "door")]).toBe(4);
    for (const next of [
      returnsStory((list) => { door(list).when = is("paid"); return list; }),
      returnsStory((list) => { door(list).rev = 2; return list; }),
    ]) {
      const diff = diffStories(story, next, state);
      expect(diff.classification).toBe("compatible");
      expect(diff.entries.map((entry) => entry.code)).toEqual(["codex-return-replaced"]);
      const pruned = pruneEngineState(state, next, diff).blackboard.values;
      expect(pruned[codexReturnKey("boathouse", "door")]).toBeUndefined();
      expect(pruned[codexArmedKey("boathouse", "door")]).toBeUndefined();
    }
    const removed = returnsStory((list) => { const place = list.find((item) => item.id === "boathouse")!; place.returns = place.returns!.filter((back) => back.id !== "door"); return list; });
    const diff = diffStories(story, removed, state);
    expect(diff.entries.map((entry) => entry.code)).toEqual(["codex-return-removed"]);
    expect(pruneEngineState(state, removed, diff).blackboard.values[codexReturnKey("boathouse", "door")]).toBeUndefined();
  });
});
