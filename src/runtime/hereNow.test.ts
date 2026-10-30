import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryOrThrow, relationshipKey, revealKey, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { labelledRelationships } from "@engine/life/labels";
import { composeGame } from "./widgets";
import { hereNowOffered } from "./sceneCard";
import { sheetTabs } from "./storySheet";
import type { GameView } from "./gameTypes";
import type { RuntimeSnapshot } from "./types";

const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}`), "utf8")) as Record<string, unknown>;
const withoutWidgets = (raw: Record<string, unknown>) => parseStoryOrThrow({ ...raw, widgets: [] });
const LABELS = withoutWidgets(fixture("relationship-labels.story.json"));
const FACTIONS = withoutWidgets(fixture("factions.story.json"));
const PLAIN = withoutWidgets(fixture("delayed-echoes.story.json"));
const CAST = { mara: "Mara", tom: "Tom", sera: "Sera", narrator: "DM Narrator" };
const FLAGS = ["shared_meal", "saw_letter", "paid_debt", "overheard", "found_ring", "heard_rumor", "met_sera"];

const random = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
};

const run = (story: NormalizedStory, turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((deltas, at) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })), turnRange: { from: at * 2, to: at * 2 + 1 } });
    engine.commitBoundary({ lastMessageId: at * 2 + 1, chatLength: at * 2 + 2 });
  });
  return engine;
};

const compose = (story: NormalizedStory, engine: StoryEngine, enabled: string[]): GameView =>
  composeGame({ story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST, enabled }).player;

const sheetSnapshot = (game: GameView | null, journal = true) => ({
  ready: true, game, memoryShown: [], presence: { shown: { journal, statSheet: true, widgets: true, suggestions: false, wand: true } },
}) as unknown as RuntimeSnapshot;

describe("v3.0 29 (35 S1): the Here now tab reuses sceneView and is offered without an authored scene widget", () => {
  test("offered for labelled relationships or factions, not for a plain story", () => {
    expect(hereNowOffered(LABELS)).toBe(true);
    expect(hereNowOffered(FACTIONS)).toBe(true);
    expect(hereNowOffered(PLAIN)).toBe(false);
    const plain = compose(PLAIN, run(PLAIN, []), ["mara", "tom"]);
    expect(plain.scene).toBeUndefined();
    expect(sheetTabs(sheetSnapshot(plain)).map((tab) => tab.id)).not.toContain("here");
  });

  test("a factions story gets a scene view and a Here now tab, offered only with the story pages shown", () => {
    const game = compose(FACTIONS, run(FACTIONS, []), Object.keys(CAST));
    expect(game.scene).toBeDefined();
    expect(sheetTabs(sheetSnapshot(game)).map((tab) => tab.id)).toContain("here");
    expect(sheetTabs(sheetSnapshot(game, false)).map((tab) => tab.id)).not.toContain("here");
  });

  test("over 300 seeds no unrevealed secret label reaches the Here now view", () => {
    const secrets = labelledRelationships(LABELS).flatMap(({ member, relationship }) =>
      (relationship.secret ?? []).map((secret) => ({ label: secret.label, key: revealKey(member, relationship.toward, secret.id) })));
    expect(secrets.length).toBeGreaterThan(0);
    let leaks = 0;
    let offered = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = random(seed);
      const enabled = Object.keys(CAST).filter(() => next() < 0.8);
      const turns = Array.from({ length: 1 + Math.floor(next() * 6) }, () => Object.fromEntries([
        ...FLAGS.filter(() => next() < 0.25).map((key) => [key, true]),
        ...(next() < 0.4 ? [[relationshipKey("tom", "player", "trust"), Math.floor(next() * 7) - 2]] : []),
      ]));
      const engine = run(LABELS, turns);
      const values = engine.serialize().blackboard.values;
      const game = compose(LABELS, engine, enabled);
      if (game.scene) offered += 1;
      const text = JSON.stringify(game.scene ?? {});
      leaks += secrets.filter((secret) => !values[secret.key] && text.includes(secret.label)).length;
    }
    expect(offered).toBe(300);
    expect(leaks).toBe(0);
  });
});

describe("v3.0 29 IC5: story sheet tabs come from what the story has", () => {
  test("journal, people, stats, widgets and memory follow the game view and presence switches", () => {
    const game = compose(FACTIONS, run(FACTIONS, []), Object.keys(CAST));
    const ids = sheetTabs(sheetSnapshot(game)).map((tab) => tab.id);
    expect(ids).toContain("memory");
    expect(ids.indexOf("here")).toBeLessThan(ids.indexOf("memory"));
    expect(sheetTabs({ ...sheetSnapshot(game), ready: false } as RuntimeSnapshot)).toEqual([]);
    const ideas = sheetTabs({ ...sheetSnapshot(null), presence: { shown: { suggestions: true } } } as unknown as RuntimeSnapshot).map((tab) => tab.id);
    expect(ideas).toEqual(["ideas", "memory"]);
  });
});
