import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, parseStoryOrThrow, relationshipKey, revealKey, type EngineState, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { labelledRelationships } from "@engine/life/labels";
import { relationshipFeelings } from "@engine/life/lines";
import { deriveScopeWithSources } from "@extraction/scope";
import { DISCOVERY_SCOPE_CAP, DISCOVERY_SOURCE, SCOPE_SOURCES } from "@extraction/scopeSources";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import { composeGame } from "./widgets";
import { gameSlices, loadGameComposer, storyHasGame } from "./gameSnapshot";
import { withheldNames } from "./playerProjection";
import { buildSessionJournal } from "./journal";
import { MemoryInjector } from "./memoryInjector";
import { playerSheetMarkup } from "../components/sheet/sheetMarkup";
import type { GameView } from "./gameTypes";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/relationship-labels.story.json"), "utf8")) as Record<string, unknown>;
const STORY = parseStoryOrThrow(RAW);
const CAST = { mara: "Mara", tom: "Tom", sera: "Sera", narrator: "DM Narrator" };
const ENABLED = ["mara", "tom", "sera", "narrator"];
const FLAGS = ["shared_meal", "saw_letter", "paid_debt", "overheard", "found_ring", "heard_rumor", "met_sera"];
type Roster = Array<Record<string, unknown>>;

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

const randomTurns = (next: () => number): Array<Record<string, PrimitiveValue>> => Array.from({ length: 1 + Math.floor(next() * 8) }, () => Object.fromEntries([
  ...FLAGS.filter(() => next() < 0.2).map((key) => [key, true]),
  ...(next() < 0.4 ? [[relationshipKey("tom", "player", "trust"), Math.floor(next() * 7) - 2]] : []),
]));

const compose = (story: NormalizedStory, engine: StoryEngine, enabled = ENABLED, state: EngineState = engine.serialize()): GameView =>
  composeGame({ story, state, boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST, enabled }).player;

const surfaces = (game: GameView): string => [JSON.stringify(game), playerSheetMarkup(game)].join("\n");

const secrets = (story: NormalizedStory) => labelledRelationships(story).flatMap(({ member, relationship }) =>
  (relationship.secret ?? []).map((secret) => ({ member, toward: relationship.toward, secret, key: revealKey(member, relationship.toward, secret.id) })));

const unrevealed = (story: NormalizedStory, values: Readonly<Record<string, unknown>>) => secrets(story).filter((entry) => values[entry.key] === undefined);

const withoutSecrets = (raw: Record<string, unknown>) => ({
  ...raw,
  roster: (raw.roster as Roster).map((member) => (member.relationships
    ? { ...member, relationships: (member.relationships as Roster).map(({ secret: _secret, ...relationship }) => relationship) } : member)),
});

describe("v2.8 plan 51 R1/R3/R12: the player sees authored words of known people, nothing else", () => {
  it("R1 + R3: over 500 random paths no unrevealed secret label, id, count or reveal key reaches the view, the Journal or the log, and no number at all", () => {
    let leaks = 0;
    let shown = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = run(STORY, randomTurns(random(seed)));
      const values = engine.serialize().blackboard.values;
      const game = compose(STORY, engine);
      const text = surfaces(game);
      leaks += unrevealed(STORY, values).filter((entry) => text.includes(entry.secret.label)).length;
      leaks += ["life_reveal", "life_label", "rel_", "revealed_when"].filter((needle) => JSON.stringify(game.codex ?? {}).includes(needle)).length;
      const rows = (game.codex?.people ?? []).flatMap((entry) => entry.rows ?? []);
      leaks += rows.filter((row) => /\d/.test(row.text)).length;
      const revealedShown = rows.filter((row) => row.kind === "learned").length;
      const revealedKnown = secrets(STORY).filter((entry) => values[entry.key] !== undefined && (entry.member !== "sera" || values.met_sera === true)
        && (entry.toward !== "sera" || values.met_sera === true)).length;
      if (revealedShown !== revealedKnown) leaks += 1;
      if (rows.length) shown += 1;
    }
    expect(leaks).toBe(0);
    expect(shown).toBe(500);
  });

  it("R2: the player page is byte-identical with and without unrevealed secret labels declared", () => {
    const bare = parseStoryOrThrow(withoutSecrets(RAW));
    for (let seed = 1; seed <= 200; seed += 1) {
      const turns = randomTurns(random(seed)).map((turn) => Object.fromEntries(Object.entries(turn).filter(([key]) => !["saw_letter", "paid_debt", "overheard", "found_ring", "heard_rumor"].includes(key))));
      const left = compose(STORY, run(STORY, turns));
      const right = compose(bare, run(bare, turns));
      expect(surfaces(left)).toBe(surfaces(right));
    }
  });

  it("R12: a row whose holder or target the player does not know is absent, NPC-to-NPC included (500 seeds)", () => {
    let leaks = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const next = random(seed * 31);
      const enabled = ENABLED.filter(() => next() < 0.6);
      const engine = run(STORY, randomTurns(next));
      const values = engine.serialize().blackboard.values;
      const game = compose(STORY, engine, enabled);
      const known = (id: string) => (id === "sera" ? values.met_sera === true : enabled.includes(id));
      const text = surfaces(game);
      labelledRelationships(STORY).filter(({ member, relationship }) => !known(member) || (relationship.toward !== "player" && !known(relationship.toward)))
        .forEach(({ relationship }) => {
          const words = [...(relationship.public ?? []).map((row) => row.label), ...(relationship.secret ?? []).map((row) => row.label)];
          const other = labelledRelationships(STORY).filter((entry) => entry.relationship !== relationship).flatMap((entry) => (entry.relationship.public ?? []).map((row) => row.label));
          leaks += words.filter((word) => !other.includes(word) && text.includes(word)).length;
        });
      if (!known("tom")) leaks += text.includes("Toward Tom") ? 1 : 0;
    }
    expect(leaks).toBe(0);
  });

  it("history grammar: a revealed secret reads 'Learned', the public label speaks in the present, a reveal makes a log row and a fresh mark", () => {
    const engine = run(STORY, [{}, { saw_letter: true, shared_meal: true, overheard: true }]);
    const game = compose(STORY, engine, ["mara", "tom"]);
    const mara = game.codex?.people.find((entry) => entry.name === "Mara");
    expect(mara?.rows).toEqual([
      { text: "Toward you: warming to you", kind: "label" },
      { text: "Learned: secretly loyal to you", kind: "learned", fresh: true },
      { text: "Toward Tom: rivals", kind: "label" },
      { text: "Learned (toward Tom): envies his post", kind: "learned", fresh: true },
    ]);
    expect(mara?.fresh).toBe(true);
    expect(game.log.filter((row) => row.kind === "reveal").map((row) => row.text)).toEqual(["Mara: secretly loyal to you", "Mara toward Tom: envies his post"]);
    expect(game.codex?.people.map((entry) => entry.name)).toEqual(["Mara", "Tom"]);
    const events = buildSessionJournal({ records: [], boundaryLog: engine.stateLog, audits: [], reconciliationEvents: [], payloadCaptures: [], talkDecisions: [] });
    expect(events.filter((event) => event.kind === "reveal").map((event) => event.boundary)).toEqual([2]);
  });

  it("a member with an authored People page gets the labels on that page once the page is known", () => {
    const hidden = compose(STORY, run(STORY, [{ heard_rumor: true }]));
    expect(hidden.codex?.people.some((entry) => entry.name === "Sera")).toBe(false);
    const met = compose(STORY, run(STORY, [{ heard_rumor: true }, { met_sera: true }]));
    const sera = met.codex?.people.find((entry) => entry.name === "Sera");
    expect(sera?.facts.map((fact) => fact.text)).toEqual(["Carries the crown's seal."]);
    expect(sera?.rows?.map((row) => row.text)).toEqual(["Toward you: aloof", "Learned: reports on you to the crown"]);
  });
});

describe("v2.8 plan 51 R10 (SC4): a labels-only story renders; one with nothing stays null", () => {
  it("renders the holder's page from labels alone", async () => {
    await loadGameComposer();
    const only = parseStoryOrThrow({ ...RAW, codex: undefined });
    expect(storyHasGame(only)).toBe(true);
    const engine = run(only, [{}]);
    const slice = gameSlices({
      story: only, state: engine.serialize(), boundaryLog: engine.stateLog, checks: undefined, threads: { open: [], resolved: [] }, chat: [], castNames: CAST, authorView: false, enabled: ENABLED,
    });
    expect(slice.game?.codex?.people.map((entry) => entry.name)).toEqual(["Mara", "Tom", "Sera"]);
    const plain = parseStoryOrThrow(withoutSecrets({ ...RAW, codex: undefined, roster: (RAW.roster as Roster).map(({ relationships: _r, ...member }) => member) }));
    expect(storyHasGame(plain)).toBe(false);
  });
});

describe("v2.8 plan 51 R11: label gate keys ride the discovery source, in rotation", () => {
  it("offers reveal and public gate keys, and the control without the source starves", () => {
    const state = run(STORY, [{}]).serialize();
    const asked = new Set<string>();
    const rotations = Math.ceil(9 / DISCOVERY_SCOPE_CAP) + 2;
    for (let rotation = 0; rotation < rotations; rotation += 1) {
      deriveScopeWithSources(STORY, state.activeCheckpointId, state.blackboard, [], { rotation }, SCOPE_SOURCES).scope
        .filter((entry) => entry.pulledBy.some((pull) => pull.kind === "discovery")).forEach((entry) => asked.add(entry.key));
    }
    expect([...asked].sort()).toEqual(expect.arrayContaining(["found_ring", "heard_rumor", "met_sera", "overheard", "paid_debt", "saw_letter", "shared_meal"]));
    const control = deriveScopeWithSources(STORY, state.activeCheckpointId, state.blackboard, [], { rotation: 0 }, SCOPE_SOURCES.filter((source) => source !== DISCOVERY_SOURCE)).scope.map((entry) => entry.key);
    expect(control).not.toContain("saw_letter");
  });
});

const injector = (values: Record<string, unknown>) => {
  const blocks = new Map<string, string>();
  const names = Object.values(CAST);
  const hosts = {
    prompt: { setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); }, clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); } },
    roster: { getActiveGroup: () => ({ id: "g", members: [], disabled_members: [] }), resolveGroupMemberId: (name: string) => `${name}.png`, chatRows: () => [], systemUserName: "SillyTavern System" },
    chat: { chatRows: () => [], lastMessageText: () => "", chatWindow: () => ({ messages: [] }) },
    injection: { getCharacterNameById: (index: number) => names[index], readInjectedPromptBlocks: () => [] },
  } as unknown as InjectorHosts;
  const budgets = { facts: 5000, session_details: 5000, short_term: 5000, scene_history: 5000 };
  const memory = {
    settings: { enabled: true, epistemicLedgerCapable: true, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierTokenBudgets: budgets },
    entries: [], epistemic: [], ledger: [], arcs: [], derived: [], pinnedOverflow: 0,
  } as unknown as MemoryRuntimeState;
  const memoryInjector = new MemoryInjector({
    getStory: () => STORY, getState: () => ({ boundary: 5, activeCheckpointId: "start", blackboard: { values, versions: {} } }) as never,
    memory: () => memory, enabled: () => true, capable: () => true, ledgerBindings: () => [], setPinnedOverflow: () => undefined, beatFor: () => "", hosts: () => hosts,
  });
  memoryInjector.update();
  const resting = blocks.get(EPISTEMIC_INJECTION_KEY) ?? "";
  const draft = (id: keyof typeof CAST) => { memoryInjector.onMemberDrafted(names.indexOf(CAST[id])); return blocks.get(EPISTEMIC_INJECTION_KEY) ?? ""; };
  return { resting, draft, shared: { tiers: memoryInjector.blocks(), ledger: memoryInjector.ledgerBlock() } };
};

describe("v2.8 plan 51 R8: an unrevealed secret label reaches only its holder's private block", () => {
  it("0 hits in other members' blocks, the resting block, the warden's feelings, the player view; the suggestion filter withholds it (120 seeds)", () => {
    let hits = 0;
    let holderCarries = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      const engine = run(STORY, randomTurns(random(seed * 7)));
      const values = engine.serialize().blackboard.values;
      const { resting, draft, shared } = injector(values);
      const blocks = Object.fromEntries((Object.keys(CAST) as Array<keyof typeof CAST>).map((id) => [id, draft(id)]));
      const player = surfaces(compose(STORY, engine));
      const withheld = withheldNames(STORY, [], "start", values);
      unrevealed(STORY, values).forEach(({ member, secret }) => {
        const label = secret.label;
        if (blocks[member].includes(label)) holderCarries += 1;
        hits += Object.entries(blocks).filter(([id, block]) => id !== member && block.includes(label)).length;
        hits += [resting, player, JSON.stringify(shared), ...Object.keys(CAST).flatMap((id) => relationshipFeelings(STORY, values, id))].filter((text) => text.includes(label)).length;
        if (!withheld.includes(label)) hits += 1;
      });
    }
    expect(hits).toBe(0);
    expect(holderCarries).toBeGreaterThan(0);
  });
});
