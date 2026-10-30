import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryEngine, type NormalizedStory } from "@engine/index";
import { parseStoryOrThrow } from "@engine/validate";
import { entryKnown } from "@engine/codex";
import { composeGame } from "./widgets";
import { WidgetCard } from "../components/widgets/WidgetCard";
import { labRaw, randomWrites, rng } from "../../test/support/codexLab";
import type { GameView, SceneView, WidgetView } from "./gameTypes";

const CAST = { tom: "Tom", ada: "Ada", nar: "The Narrator" };
const PORTRAITS = { tom: "/characters/tom.png", ada: "/characters/ada.png", nar: "/characters/nar.png" };
const PLACES = ["Kessel boathouse", "Grimsby mill", null];
const ROSTER = [{ id: "tom", name: "Tom" }, { id: "ada", name: "Ada" }, { id: "nar", name: "The Narrator", view: "omniscient" }];
const SCENE = { id: "here", kind: "scene", title: "Here now" };

const sceneStory = (patch: Record<string, unknown> = {}): NormalizedStory => parseStoryOrThrow(labRaw({ roster: ROSTER, widgets: [SCENE], ...patch }));

const run = (story: NormalizedStory, seed: number, turns?: number) => {
  const random = rng(seed);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const count = turns ?? 1 + Math.floor(random.next() * 12);
  for (let at = 1; at <= count; at += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: randomWrites(random, story).map((delta) => ({ ...delta, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: at * 2, chatLength: at * 2 + 1 });
  }
  return engine;
};

const compose = (story: NormalizedStory, engine: StoryEngine, extra: { enabled?: string[]; location?: string | null } = {}): GameView =>
  composeGame({
    story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST,
    enabled: extra.enabled ?? ["tom", "ada", "nar"], location: extra.location ?? null, portraits: PORTRAITS,
  }).player;

const sceneWidget = (game: GameView): WidgetView | undefined => game.widgets.find((widget) => widget.body.kind === "scene");
const markup = (widget: WidgetView | undefined) => (widget ? renderToStaticMarkup(createElement(WidgetCard, { widget })) : "");
const textOf = (html: string) => html.replace(/<[^>]+>/g, "\u0000").split("\u0000").map((part) => part.trim()).filter(Boolean);
const HEADINGS = new Set(["Here now", "Where", "When", "With you"]);

describe("65 here-now scene card", () => {
  const story = sceneStory();

  test("N1/N2/N2p: over 500 generated runs the card holds only the location, the displayed time and known present names; an unmet member leaves no trace", () => {
    let extras = 0;
    let unknownTraces = 0;
    let unmetRuns = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = run(story, seed);
      const values = engine.serialize().blackboard.values;
      const location = PLACES[seed % PLACES.length];
      const game = compose(story, engine, { location });
      const widget = sceneWidget(game);
      const metTom = entryKnown("people", story.codex!.people!.find((entry) => entry.member === "tom")!, values);
      const allowed = new Set([...(location ? [location] : []), "Ada", ...(metTom ? ["Tom"] : [])]);
      const html = markup(widget);
      extras += textOf(html).filter((text) => !HEADINGS.has(text) && !allowed.has(text) && text !== "A" && text !== "T").length;
      const view: SceneView | undefined = game.scene;
      expect(view?.present.map((member) => member.name)).toEqual(["Tom", "Ada"].filter((name) => allowed.has(name)));
      if (!metTom) {
        unmetRuns += 1;
        unknownTraces += [/Tom/, /tom\.png/, />T</].filter((pattern) => pattern.test(html) || pattern.test(JSON.stringify(game.scene))).length;
      }
      unknownTraces += [/Narrator/, /nar\.png/].filter((pattern) => pattern.test(html)).length;
    }
    expect(extras).toBe(0);
    expect(unknownTraces).toBe(0);
    expect(unmetRuns).toBeGreaterThan(50);
  });

  test("N2p: a listed member without a portrait shows initials, never an image; only listed members get a portrait", () => {
    const engine = run(story, 3, 0);
    const game = composeGame({
      story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST,
      enabled: ["tom", "ada"], portraits: { tom: "/characters/tom.png" },
    }).player;
    const html = markup(sceneWidget(game));
    expect(html).not.toContain("<img");
    expect(html).toContain(">A<");
    expect(html).not.toContain("tom.png");
  });

  test("N5: disabled members leave the card across 4 scripted cast changes", () => {
    const engine = run(story, 7, 0);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "met_tom", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    const casts: Array<[string[], string[]]> = [[["tom"], ["Tom"]], [["ada"], ["Ada"]], [[], []], [["tom", "ada", "nar"], ["Tom", "Ada"]]];
    const hits = casts.filter(([enabled, names]) => JSON.stringify(compose(story, engine, { enabled }).scene?.present.map((member) => member.name) ?? []) === JSON.stringify(names));
    expect(hits).toHaveLength(4);
  });

  test("N6: no time option or no clock gives no time line; without a codex the card is the location and the members", () => {
    const engine = run(story, 11, 3);
    expect(compose(story, engine, { location: "Grimsby mill" }).scene?.time).toBeNull();
    const timed = sceneStory({ widgets: [{ ...SCENE, options: { time: true } }] });
    expect(compose(timed, run(timed, 11, 3), { location: "Grimsby mill" }).scene?.time).toBeNull();
    const plain = sceneStory({ codex: undefined });
    const view = compose(plain, run(plain, 11, 3), { location: "Grimsby mill" }).scene;
    expect(view).toEqual({ location: "Grimsby mill", time: null, present: [{ name: "Tom", portrait: "/characters/tom.png", page: null }, { name: "Ada", portrait: "/characters/ada.png", page: null }] });
  });

  test("page links name only known People pages", () => {
    const engine = run(story, 5, 0);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "met_tom", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(compose(story, engine).scene?.present).toEqual([
      { name: "Tom", portrait: "/characters/tom.png", page: "Tom" },
      { name: "Ada", portrait: "/characters/ada.png", page: null },
    ]);
  });

  test("N8: rollback equals replay of the projection over 4 seeds", () => {
    const same = [21, 22, 23, 24].filter((seed) => {
      const replay = run(story, seed, 4);
      const long = run(story, seed, 8);
      long.rollbackTo(replay.serialize().boundary);
      return JSON.stringify(compose(story, long, { location: "Grimsby mill" }).scene) === JSON.stringify(compose(story, replay, { location: "Grimsby mill" }).scene);
    });
    expect(same).toHaveLength(4);
  });

  test("v3.0 29: a story with people pages and no scene widget still gets the Here now projection, and the validator keeps the time option on scene panels", () => {
    const bare = parseStoryOrThrow(labRaw({ roster: ROSTER }));
    expect(compose(bare, run(bare, 2, 2)).scene?.present.map((member) => member.name)).toEqual(["Ada"]);
    expect(() => parseStoryOrThrow(labRaw({ widgets: [{ id: "log", kind: "log", title: "Log", options: { time: true } }] }))).toThrow(/only a scene panel shows the story's time/);
  });
});
