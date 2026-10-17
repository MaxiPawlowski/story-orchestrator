import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryEngine, parseStoryV2OrThrow, relationshipKey, revealKey, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { labelledRelationships } from "@engine/life/labels";
import { composeGame } from "./widgets";
import { WidgetCard } from "../components/widgets/WidgetCard";
import type { GameView, WidgetView } from "./gameTypes";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}`), "utf8")) as Record<string, unknown>;
const SCENE = { id: "here", kind: "scene", title: "Here now" };
const LABELS_RAW = { ...fixture("relationship-labels.story.json"), widgets: [SCENE] };
const LABELS = parseStoryV2OrThrow(LABELS_RAW);
const LABEL_CAST = { mara: "Mara", tom: "Tom", sera: "Sera", narrator: "DM Narrator" };
const LABEL_ENABLED = ["mara", "tom", "sera", "narrator"];
const FLAGS = ["shared_meal", "saw_letter", "paid_debt", "overheard", "found_ring", "heard_rumor", "met_sera"];
const FACTIONS_RAW = fixture("factions.story.json");
const FACTION_CAST = { mara: "Mara", tom: "Tom", sera: "Sera", narrator: "DM Narrator" };
const RECENCY = /"(changedAgo|fresh|trend|at|since)"/;

const random = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
};

const run = (story: NormalizedStoryV2, turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((deltas, at) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })), turnRange: { from: at * 2, to: at * 2 + 1 } });
    engine.commitBoundary({ lastMessageId: at * 2 + 1, chatLength: at * 2 + 2 });
  });
  return engine;
};

const labelTurns = (next: () => number): Array<Record<string, PrimitiveValue>> => Array.from({ length: 1 + Math.floor(next() * 8) }, () => Object.fromEntries([
  ...FLAGS.filter(() => next() < 0.2).map((key) => [key, true]),
  ...(next() < 0.4 ? [[relationshipKey("tom", "player", "trust"), Math.floor(next() * 7) - 2]] : []),
]));

const compose = (story: NormalizedStoryV2, engine: StoryEngine, castNames: Record<string, string>, enabled: string[]): GameView =>
  composeGame({ story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames, enabled }).player;

const sceneWidget = (game: GameView): WidgetView | undefined => game.widgets.find((widget) => widget.body.kind === "scene");
const shown = (game: GameView): string => [JSON.stringify(game.scene ?? {}), (() => { const widget = sceneWidget(game); return widget ? renderToStaticMarkup(createElement(WidgetCard, { widget })) : ""; })()].join("\n");

const secrets = labelledRelationships(LABELS).flatMap(({ member, relationship }) =>
  (relationship.secret ?? []).map((secret) => ({ member, toward: relationship.toward, label: secret.label, key: revealKey(member, relationship.toward, secret.id) })));

describe("65 A+ scene card lines: relationship labels and standing", () => {
  test("N3: over 500 seeds no unrevealed secret label reaches the card (text or markup), and every label line has a known holder and target", () => {
    let leaks = 0;
    let unknownPairs = 0;
    let revealedSeen = 0;
    let labelRuns = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const next = random(seed);
      const enabled = LABEL_ENABLED.filter(() => next() < 0.75);
      const engine = run(LABELS, labelTurns(next));
      const values = engine.serialize().blackboard.values;
      const game = compose(LABELS, engine, LABEL_CAST, enabled);
      const text = shown(game);
      leaks += secrets.filter((secret) => values[secret.key] === undefined && text.includes(secret.label)).length;
      const known = (id: string) => id === "player" || (enabled.includes(id) && (id !== "sera" || values.met_sera === true));
      const listed = new Set((game.scene?.present ?? []).map((member) => member.name));
      unknownPairs += labelledRelationships(LABELS).filter(({ member, relationship }) => !known(member) || !known(relationship.toward)).flatMap(({ relationship }) =>
        [...(relationship.public ?? []).map((row) => row.label), ...(relationship.secret ?? []).map((row) => row.label)])
        .filter((label) => (game.scene?.present ?? []).some((member) => (member.labels ?? []).some((line) => line.endsWith(`: ${label}`)))).length;
      unknownPairs += (game.scene?.present ?? []).filter((member) => member.labels?.length && !listed.has(member.name)).length;
      revealedSeen += secrets.filter((secret) => values[secret.key] !== undefined && known(secret.member) && known(secret.toward) && text.includes(secret.label)).length;
      if ((game.scene?.present ?? []).some((member) => member.labels?.length)) labelRuns += 1;
    }
    expect(leaks).toBe(0);
    expect(unknownPairs).toBe(0);
    expect(revealedSeen).toBeGreaterThan(50);
    expect(labelRuns).toBeGreaterThan(300);
  });

  test("labels name only the player or a member listed on the card; a learned secret reads as history", () => {
    const engine = run(LABELS, [{ saw_letter: true, overheard: true }]);
    const both = compose(LABELS, engine, LABEL_CAST, ["mara", "tom"]).scene?.present;
    expect(both?.find((member) => member.name === "Mara")?.labels).toEqual([
      "Toward you: wary", "Learned: secretly loyal to you", "Toward Tom: rivals", "Learned (toward Tom): envies his post",
    ]);
    const alone = compose(LABELS, engine, LABEL_CAST, ["mara"]).scene?.present;
    expect(alone?.find((member) => member.name === "Mara")?.labels).toEqual(["Toward you: wary", "Learned: secretly loyal to you"]);
  });

  test("N4: no recency over 500 seeds: no changedAgo, fresh, trend or boundary in the scene projection, and no number in a line", () => {
    const factions = parseStoryV2OrThrow({ ...FACTIONS_RAW, widgets: [{ ...SCENE, options: { standing: true } }] });
    let hits = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const next = random(seed * 7);
      const labelGame = compose(LABELS, run(LABELS, labelTurns(next)), LABEL_CAST, LABEL_ENABLED);
      const factionTurns = Array.from({ length: 1 + Math.floor(next() * 6) }, () => Object.fromEntries(
        ["met_guild", "met_crown", "apprentice_saved", "ledger_stolen", "envoy_helped", "debt_paid"].filter(() => next() < 0.3).map((key) => [key, true])));
      const factionGame = compose(factions, run(factions, factionTurns), FACTION_CAST, ["mara", "tom", "sera", "narrator"]);
      for (const game of [labelGame, factionGame]) {
        const json = JSON.stringify(game.scene ?? {});
        hits += RECENCY.test(json) ? 1 : 0;
        hits += (game.scene?.present ?? []).flatMap((member) => [...(member.labels ?? []), ...(member.standing ?? [])]).filter((line) => /\d|ago|changed/.test(line)).length;
        hits += JSON.stringify(sceneWidget(game) ?? {}).includes("changedAgo") ? 1 : 0;
      }
    }
    expect(hits).toBe(0);
  });

  test("standing shows only with options.standing, only for a member's visible groups, as the band word; display.standing false hides it", () => {
    const withOption = parseStoryV2OrThrow({ ...FACTIONS_RAW, widgets: [{ ...SCENE, options: { standing: true } }] });
    const enabled = ["mara", "tom", "sera", "narrator"];
    const standing = (story: NormalizedStoryV2, turns: Array<Record<string, PrimitiveValue>>) =>
      Object.fromEntries((compose(story, run(story, turns), FACTION_CAST, enabled).scene?.present ?? []).map((member) => [member.name, member.standing ?? []]));
    expect(standing(withOption, [{}])).toEqual({ Mara: [], Tom: [], Sera: [] });
    expect(standing(withOption, [{ met_guild: true }])).toEqual({ Mara: ["The Guild: Neutral"], Tom: ["The Guild: Neutral"], Sera: [] });
    expect(standing(withOption, [{ met_guild: true }, { ledger_stolen: true }])).toEqual({ Mara: ["The Guild: Hostile"], Tom: ["The Guild: Hostile"], Sera: [] });
    expect(standing(withOption, [{ met_crown: true }])).toEqual({ Mara: [], Tom: [], Sera: ["The Silver Crown: Watches you"] });
    const without = parseStoryV2OrThrow({ ...FACTIONS_RAW, widgets: [SCENE] });
    expect(standing(without, [{ met_guild: true, met_crown: true }])).toEqual({ Mara: [], Tom: [], Sera: [] });
    const hidden = parseStoryV2OrThrow({ ...FACTIONS_RAW, display: { standing: false }, widgets: [{ ...SCENE, options: { standing: true } }] });
    expect(standing(hidden, [{ met_guild: true, met_crown: true }])).toEqual({ Mara: [], Tom: [], Sera: [] });
  });

  test("a hidden group's standing never reaches the card: byte-identical with and without the hidden faction (200 seeds)", () => {
    const base = { ...FACTIONS_RAW, widgets: [{ ...SCENE, options: { standing: true } }] };
    const story = parseStoryV2OrThrow(base);
    let differ = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = random(seed * 13);
      const turns = Array.from({ length: 1 + Math.floor(next() * 5) }, () => Object.fromEntries(["met_guild", "envoy_helped", "debt_paid"].filter(() => next() < 0.4).map((key) => [key, true])));
      const text = shown(compose(story, run(story, turns), FACTION_CAST, ["mara", "tom", "sera", "narrator"]));
      differ += /Silver Crown|Distrusts|Watches|Favours/.test(text) ? 1 : 0;
    }
    expect(differ).toBe(0);
  });

  test("the validator keeps standing on scene panels and takes only true or false", () => {
    expect(() => parseStoryV2OrThrow({ ...FACTIONS_RAW, widgets: [{ id: "log", kind: "log", title: "Log", options: { standing: true } }] })).toThrow(/only a scene panel shows a member's group standing/);
    expect(() => parseStoryV2OrThrow({ ...FACTIONS_RAW, widgets: [{ ...SCENE, options: { standing: "yes" } }] })).toThrow(/standing is true or false/);
  });

  test("N8 (A+): rollback equals replay of the lines over 4 seeds", () => {
    const same = [31, 32, 33, 34].filter((seed) => {
      const turns = labelTurns(random(seed)).concat(labelTurns(random(seed + 100)));
      const cut = Math.max(1, Math.floor(turns.length / 2));
      const replay = run(LABELS, turns.slice(0, cut));
      const long = run(LABELS, turns);
      long.rollbackTo(replay.serialize().boundary);
      return JSON.stringify(compose(LABELS, long, LABEL_CAST, LABEL_ENABLED).scene) === JSON.stringify(compose(LABELS, replay, LABEL_CAST, LABEL_ENABLED).scene);
    });
    expect(same).toHaveLength(4);
  });
});
