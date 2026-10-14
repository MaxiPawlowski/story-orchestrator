import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryV2OrThrow, standingKey, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { privateLifeLines } from "@engine/life/lines";
import { deriveScopeWithSources } from "@extraction/scope";
import { FACTION_SCOPE_CAP, FACTION_SOURCE, SCOPE_SOURCES } from "@extraction/scopeSources";
import { DIRECTOR_STANDING_TITLE, renderDirectorPrompt } from "@generation/living/prompt";
import { composeGame, type GameSources } from "./widgets";
import { gameSlices, loadGameComposer, storyHasGame } from "./gameSnapshot";
import { directorInput } from "./livingUnit";
import type { LivingInputs } from "./livingInputs";

const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}`), "utf8")) as Record<string, unknown>;
const FACTIONS = read("factions.story.json");
const LIFE = read("character-life.story.json");

const run = (story: NormalizedStoryV2, turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((deltas, at) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })), turnRange: { from: at * 2, to: at * 2 + 1 } });
    engine.commitBoundary({ lastMessageId: at * 2 + 1, chatLength: at * 2 + 2 });
  });
  return engine;
};

const sources = (story: NormalizedStoryV2, engine: StoryEngine): GameSources => ({
  story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: { mara: "Mara", tom: "Tom", sera: "Sera" },
});

const inputs: LivingInputs = {
  canon: "", openThreads: [], resolvedThreads: [], plans: [], refused: null, playerNames: [], tension: null, restatesSecret: () => false, scrub: (text) => text,
};

const prompt = (story: NormalizedStoryV2, engine: StoryEngine) => renderDirectorPrompt(directorInput({
  story, raw: {}, frontierId: story.startCheckpointId, state: engine.serialize(), sealsOn: true, inputs, model: (async () => "") as never, debugResponse: null,
}));

const withoutFactions = (raw: Record<string, unknown>) => ({
  ...raw, factions: undefined, quests: [], roster: (raw.roster as Array<Record<string, unknown>>).map(({ factions: _factions, ...member }) => member),
});

const hiddenCrownRemoved = (raw: Record<string, unknown>) => ({
  ...raw,
  factions: (raw.factions as Array<Record<string, unknown>>).filter((faction) => faction.id !== "crown"),
  roster: (raw.roster as Array<Record<string, unknown>>).map((member) => (member.id === "sera" ? { ...member, factions: undefined } : member)),
});

describe("v2.8 plan 53 F1/F2: the player sees band words of visible factions, nothing else", () => {
  const turns: Array<Record<string, PrimitiveValue>> = [{ met_guild: true }, { ledger_stolen: true }, { location: "docks" }, { apprentice_saved: true }];

  it("F1: no standing value, range, trend or recency reaches the player view (500 random blackboards)", () => {
    const story = parseStoryV2OrThrow({ ...FACTIONS, widgets: [{ id: "groups", kind: "roster", title: "Groups", audience: "player", rows: [{ id: "g", label: "The Guild", faction: "guild" }] }] });
    const engine = run(story, turns);
    let seed = 7;
    const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let at = 0; at < 500; at += 1) {
      const state = engine.serialize();
      const values = { ...state.blackboard.values, [standingKey("guild")]: Math.round(next() * 10 - 5), [standingKey("crown")]: Math.round(next() * 6 - 3), met_crown: next() < 0.5 };
      const player = composeGame({ ...sources(story, engine), state: { ...state, blackboard: { ...state.blackboard, values } } }).player;
      const standing = player.sheet.find((group) => group.label === "Standing");
      expect(standing?.items.every((item) => item.value === undefined && item.min === undefined && item.max === undefined && !item.trend && item.changedAgo === undefined)).toBe(true);
      const shown = JSON.stringify({ standing: player.standing, sheet: standing, rows: player.widgets.map((widget) => widget.body) });
      expect(shown).not.toMatch(/-?\d/);
      expect(JSON.stringify(player)).not.toContain("rep_");
    }
  });

  it("F2: a faction whose visible_when is false leaves the player view byte-identical to the story without it", () => {
    const withCrown = parseStoryV2OrThrow(FACTIONS);
    const withoutCrown = parseStoryV2OrThrow(hiddenCrownRemoved(FACTIONS));
    const left = composeGame(sources(withCrown, run(withCrown, turns))).player;
    const right = composeGame(sources(withoutCrown, run(withoutCrown, turns))).player;
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(JSON.stringify(left)).not.toContain("Silver Crown");
  });

  it("F12 (SC4): a story whose only game feature is factions renders the Standing group; one with nothing stays null", async () => {
    await loadGameComposer();
    const only = parseStoryV2OrThrow({ ...FACTIONS, quests: [], factions: (FACTIONS.factions as Array<Record<string, unknown>>).map(({ visible_when: _v, ...faction }) => faction) });
    expect(storyHasGame(only)).toBe(true);
    const engine = run(only, [{}]);
    const slice = gameSlices({ story: only, state: engine.serialize(), boundaryLog: engine.stateLog, checks: undefined, threads: { open: [], resolved: [] }, chat: [], castNames: {}, authorView: false });
    expect(slice.game?.statSheet?.body.kind === "meters" && slice.game.statSheet.body.groups.map((group) => group.label)).toEqual(["Standing"]);
    expect(slice.game?.standing).toEqual([{ name: "The Guild", band: "Neutral" }, { name: "The Silver Crown", band: "Watches you" }]);
    const none = parseStoryV2OrThrow({ format: 2, title: "N", description: "d", qualities: [], roster: [], transitions: [], checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true }] });
    expect(gameSlices({ story: none, state: run(none, [{}]).serialize(), boundaryLog: [], checks: undefined, threads: { open: [], resolved: [] }, chat: [], castNames: {}, authorView: false }).game).toBeNull();
  });
});

describe("v2.8 plan 53 F5/F11: prompts without factions are unchanged; hidden factions never reach the director", () => {
  it("F5: a member outside every faction gets a byte-identical private block, and a story without factions an identical read scope", () => {
    const life = parseStoryV2OrThrow(LIFE);
    const plus = parseStoryV2OrThrow({
      ...LIFE,
      roster: (LIFE.roster as Array<Record<string, unknown>>).map((member) => (member.id === "narrator" ? { ...member, factions: ["guild"] } : member)),
      factions: [{ id: "guild", name: "The Guild", bands: [{ max: 0, label: "Cold" }, { label: "Warm" }], moves: [] }],
    });
    const values = run(life, [{ location: "docks" }]).serialize().blackboard.values;
    expect(privateLifeLines(plus, values, "arin")).toBe(privateLifeLines(life, values, "arin"));
    const state = run(life, [{}]).serialize();
    const scope = (list: typeof SCOPE_SOURCES) => JSON.stringify(deriveScopeWithSources(life, state.activeCheckpointId, state.blackboard, [], { rotation: 3 }, list).scope);
    expect(scope(SCOPE_SOURCES)).toBe(scope(SCOPE_SOURCES.filter((source) => source !== FACTION_SOURCE)));
  });

  it("F5: the director prompt of a story without factions carries no standing list", () => {
    const story = parseStoryV2OrThrow(withoutFactions(FACTIONS));
    const engine = run(story, [{}]);
    expect(directorInput({ story, raw: {}, frontierId: "hall", state: engine.serialize(), sealsOn: true, inputs, model: (async () => "") as never, debugResponse: null })).not.toHaveProperty("standing");
    expect(prompt(story, engine)).not.toContain(DIRECTOR_STANDING_TITLE);
  });

  it("F11: a hidden faction's name, band and members are absent from the director prompt; introduce sends the name only", () => {
    const story = parseStoryV2OrThrow(FACTIONS);
    const engine = run(story, [{ met_guild: true }]);
    const text = prompt(story, engine);
    expect(text).toContain(`${DIRECTOR_STANDING_TITLE}:\n- The Guild: Neutral`);
    expect(text).not.toMatch(/Silver Crown|Distrusts you|Watches you|Favours you/);
    const introduced = parseStoryV2OrThrow({ ...FACTIONS, factions: (FACTIONS.factions as Array<Record<string, unknown>>).map((faction) => (faction.id === "crown" ? { ...faction, introduce: true } : faction)) });
    const shown = prompt(introduced, run(introduced, [{ met_guild: true }]));
    expect(shown).toContain("- The Silver Crown: the player has not met this group; you may introduce it");
    expect(shown).not.toMatch(/Distrusts you|Watches you|Favours you/);
  });
});

describe("v2.8 plan 53 F14: move gates are offered by the scope, in rotation", () => {
  const many = () => ({
    ...FACTIONS,
    qualities: [...(FACTIONS.qualities as unknown[]), ...[1, 2, 3, 4, 5, 6].map((at) => ({ key: `deed_${at}`, type: "bool", source: "extractor", rubric: `Did deed ${at} happen?` }))],
    factions: [{ id: "guild", name: "The Guild", bands: [{ max: 0, label: "Cold" }, { label: "Warm" }], moves: [1, 2, 3, 4, 5, 6].map((at) => ({ id: `deed-${at}`, when: { q: `deed_${at}`, op: "==", v: true }, add: 1 })) }],
    roster: (FACTIONS.roster as Array<Record<string, unknown>>).map((member) => (member.id === "sera" ? { ...member, factions: undefined } : member)),
  });

  it("offers a pending move's gate key, drops it once the move fired, and the control without the source starves", () => {
    const story = parseStoryV2OrThrow(FACTIONS);
    const before = run(story, [{}]).serialize();
    const keys = (state: typeof before, list = SCOPE_SOURCES) => deriveScopeWithSources(story, state.activeCheckpointId, state.blackboard, [], { rotation: 0 }, list)
      .scope.filter((entry) => entry.pulledBy.some((pull) => pull.kind === "faction")).map((entry) => entry.key);
    expect(keys(before)).toEqual(expect.arrayContaining(["apprentice_saved", "ledger_stolen", "envoy_helped"]));
    const control = deriveScopeWithSources(story, before.activeCheckpointId, before.blackboard, [], { rotation: 0 }, SCOPE_SOURCES.filter((source) => source !== FACTION_SOURCE)).scope.map((entry) => entry.key);
    expect(control).not.toContain("apprentice_saved");
    const after = run(story, [{ apprentice_saved: true }]).serialize();
    expect(keys(after)).not.toContain("apprentice_saved");
  });

  it("asks every pending move gate within ceil(moves / cap) rotations", () => {
    const story = parseStoryV2OrThrow(many());
    const state = run(story, [{}]).serialize();
    const asked = new Set<string>();
    for (let rotation = 0; rotation < Math.ceil(6 / FACTION_SCOPE_CAP); rotation += 1) {
      const scope = deriveScopeWithSources(story, state.activeCheckpointId, state.blackboard, [], { rotation }, SCOPE_SOURCES).scope;
      scope.filter((entry) => entry.pulledBy.some((pull) => pull.kind === "faction")).forEach((entry) => asked.add(entry.key));
    }
    expect([...asked].filter((key) => key.startsWith("deed_")).sort()).toEqual([1, 2, 3, 4, 5, 6].map((at) => `deed_${at}`));
  });
});
