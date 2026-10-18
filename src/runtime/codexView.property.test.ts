import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryEngine, codexEntryKey, codexFactKey, type EngineState, type NormalizedStory } from "@engine/index";
import { codexItems, entryKnown, factKnown } from "@engine/codex";
import { parseStoryOrThrow } from "@engine/validate";
import { composeGame } from "./widgets";
import { withheldNames } from "./playerProjection";
import { JournalPanel } from "../components/panels/JournalPanel";
import { labRaw, labStory, randomWrites, rng } from "../../test/support/codexLab";
import type { GameView } from "./gameTypes";

const CAST = { tom: "Tom", ada: "Ada" };

const run = (story: NormalizedStory, seed: number) => {
  const random = rng(seed);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const turns = 1 + Math.floor(random.next() * 14);
  for (let at = 1; at <= turns; at += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: randomWrites(random, story).map((delta) => ({ ...delta, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: at * 2, chatLength: at * 2 + 1 });
  }
  return engine;
};

const view = (story: NormalizedStory, state: EngineState, engine: StoryEngine): GameView =>
  composeGame({ story, state, boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST, enabled: ["tom", "ada"] }).player;

const page = (game: GameView, tab: "people" | "places" | null): string => {
  const markup = renderToStaticMarkup(createElement(JournalPanel, { game }));
  if (!tab || !game.codex?.[tab].length) return markup;
  return markup + game.codex[tab].map((entry) => [entry.name, ...entry.facts.map((fact) => `${fact.text}|${fact.from ?? ""}`)].join("/")).join(";");
};

const hiddenTexts = (story: NormalizedStory, values: Record<string, unknown>): string[] => codexItems(story).flatMap(({ page: name, entry }) => [
  ...entry.facts.filter((fact) => !factKnown(name, entry, fact, values)).map((fact) => fact.text),
  ...(entryKnown(name, entry, values) ? [] : [entry.name ?? "", ...(entry.aliases ?? [])].filter((text) => text.length >= 4)),
]);

const knownOnly = (story: NormalizedStory, values: Record<string, unknown>): NormalizedStory => {
  const raw = labRaw();
  const codex = raw.codex as Record<"people" | "places", Array<{ id: string; facts: Array<{ id: string; source?: string }> }>>;
  const known = (name: "people" | "places", id: string) => entryKnown(name, story.codex![name]!.find((item) => item.id === id)!, values);
  const kept = new Set((["people", "places"] as const).flatMap((name) => codex[name].filter((entry) => known(name, entry.id)).map((entry) => entry.id)));
  const keep = (name: "people" | "places") => codex[name].flatMap((entry) => {
    const parsed = story.codex![name]!.find((item) => item.id === entry.id)!;
    if (!kept.has(entry.id)) return [];
    const facts = entry.facts.filter((fact) => factKnown(name, parsed, parsed.facts.find((item) => item.id === fact.id)!, values))
      .map(({ source, ...fact }) => (source && kept.has(source) ? { ...fact, source } : fact));
    return [{ ...entry, facts }];
  });
  return parseStoryOrThrow({ ...raw, codex: { people: keep("people"), places: keep("places") } });
};

describe("C1/C2/C3: the codex is projection-only", () => {
  const story = labStory();

  test("the lab fixture has at least 20 facts on at least 6 entries", () => {
    expect(codexItems(story).length).toBeGreaterThanOrEqual(6);
    expect(codexItems(story).flatMap(({ entry }) => entry.facts).length).toBeGreaterThanOrEqual(20);
  });

  test("C1: over 500 random paths no unknown fact text, entry name or count reaches the view, the Journal, the log or the suggestion filter's leak", () => {
    let leaks = 0;
    let shownSomething = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = run(story, seed);
      const state = engine.serialize();
      const game = view(story, state, engine);
      const surfaces = [JSON.stringify(game), page(game, null), page(game, "people"), page(game, "places")].join("\n");
      const hidden = hiddenTexts(story, state.blackboard.values);
      leaks += hidden.filter((text) => surfaces.includes(text)).length;
      const withheld = withheldNames(story, state.visitedPath, state.activeCheckpointId, state.blackboard.values);
      const unmet = codexItems(story).filter(({ page: name, entry }) => !entryKnown(name, entry, state.blackboard.values))
        .flatMap(({ entry }) => [entry.name ?? "", ...(entry.aliases ?? [])]).filter((name) => name.length >= 4);
      leaks += unmet.filter((name) => !withheld.includes(name)).length;
      if (game.codex) shownSomething += 1;
    }
    expect(leaks).toBe(0);
    expect(shownSomething).toBe(500);
  });

  test("C2: the player page is byte-identical with and without the unknown entries and facts declared", () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const engine = run(story, seed);
      const state = engine.serialize();
      const trimmed = knownOnly(story, state.blackboard.values);
      const twin = new StoryEngine({ now: () => 0 });
      twin.loadStory(trimmed);
      twin.hydrate({ ...state, blackboard: { ...state.blackboard, values: Object.fromEntries(Object.entries(state.blackboard.values).filter(([key]) => !key.startsWith("codex_") || trimmed.qualityByKey[key])) } });
      const full = view(story, state, engine).codex;
      const alone = composeGame({ story: trimmed, state: twin.serialize(), boundaryLog: [], checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST, enabled: ["tom", "ada"] }).player.codex;
      expect(JSON.stringify(alone)).toBe(JSON.stringify(full));
    }
  });

  test("C3: every count shown equals the projected rows", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const engine = run(story, seed);
      const game = view(story, engine.serialize(), engine);
      const markup = page(game, null);
      if (game.codex?.people.length) expect(markup).toContain(`People · ${game.codex.people.length}`);
      if (game.codex?.places.length) expect(markup).toContain(`Places · ${game.codex.places.length}`);
      if (!game.codex?.places.length) expect(markup).not.toContain("Places ·");
    }
  });

  test("C12: at boundary 0 only the start lines show, with nothing unknown alongside", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    const game = view(story, engine.serialize(), engine);
    expect(game.codex).toEqual({
      people: [{ name: "You", fresh: false, facts: [{ text: "Grew up on the far shore.", fresh: false }, { text: "Carries little coin.", fresh: false }] }],
      places: [{ name: "The landing", fresh: false, facts: [{ text: "The planks are rotten near the end.", fresh: false }] }],
    });
  });

  test("provenance, fresh marker and the learned log row", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "found_ledger", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "heard_debt", v: true, source: "extractor" }, { q: "met_tom", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
    const game = view(story, engine.serialize(), engine);
    const ferryman = game.codex!.people.find((entry) => entry.name === "Tom")!;
    expect(ferryman.fresh).toBe(true);
    expect(ferryman.facts).toEqual([
      { text: "Runs the night crossing.", fresh: true, from: "At The river" },
      { text: "Owes money to someone upriver.", fresh: true, from: "From Marla the innkeeper" },
    ]);
    expect(game.codex!.people.find((entry) => entry.name === "Marla the innkeeper")!.fresh).toBe(false);
    expect(game.log.filter((row) => row.kind === "learned").map((row) => row.text)).toEqual(["Learned about Tom", "Learned about Marla the innkeeper", "Learned about Kessel boathouse"]);
    expect(engine.serialize().blackboard.values[codexEntryKey("people", "ferryman")]).toBe(2);
    expect(engine.serialize().blackboard.values[codexFactKey("people", "innkeeper", "ledger")]).toBe(1);
  });

  test("a source that is not known yet gives no provenance; display.codex false hides the pages and the log rows", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "heard_debt", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(view(story, engine.serialize(), engine).codex!.people[0].facts).toEqual([{ text: "Owes money to someone upriver.", fresh: true }]);
    const hidden = labStory({ display: { codex: false } });
    const off = new StoryEngine({ now: () => 0 });
    off.loadStory(hidden);
    off.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "heard_debt", v: true, source: "extractor" }] });
    off.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    const game = view(hidden, off.serialize(), off);
    expect(game.codex).toBeUndefined();
    expect(game.log.some((row) => row.kind === "learned")).toBe(false);
  });
});
