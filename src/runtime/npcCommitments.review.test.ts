import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoryEngine, commitKey, parseStoryV2, parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2, type PrimitiveValue, type ValidationError } from "@engine/index";
import { COMMITMENT_COPY, commitmentDiscoveryUnits, commitmentHooks, commitmentLines, commitmentState, heldCommitments, keptCommitments } from "@engine/life/commitments";
import { gameLayer, loadGameLayer } from "@engine/validate/gameLayer";
import { EPISTEMIC_INJECTION_KEY } from "@constants/defaults";
import { composeGame } from "./widgets";
import { gameSlices, loadGameComposer, storyHasGame } from "./gameSnapshot";
import { MemoryInjector } from "./memoryInjector";
import { JournalPanel } from "../components/panels/JournalPanel";
import type { GameView } from "./gameTypes";
import type { MemoryRuntimeState } from "./types";
import type { InjectorHosts } from "./hostPorts";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/npc-commitments.story.json"), "utf8")) as Record<string, unknown>;
const STORY = parseStoryV2OrThrow(RAW);
const CAST = { mara: "Mara", tom: "Tom", sera: "Sera", narrator: "DM Narrator" };
const ENABLED = ["mara", "tom", "sera", "narrator"];
const EVENTS = ["offered_help", "past_gate", "mara_betrayed", "debt_repaid", "tom_swore", "fair_held", "met_sera", "word_sent", "mara_at_market"];
const WHATS = heldCommitments(STORY).map(({ commitment }) => commitment.what);
type Turn = Record<string, PrimitiveValue>;
type Roster = Array<Record<string, unknown>>;

const random = (seed: number) => {
  let state = seed >>> 0 || 1;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
};

const play = (engine: StoryEngine, turns: Turn[], from = 0, lag = false) => {
  turns.forEach((deltas, index) => {
    const message = (from + index + 1) * 2;
    const window = lag ? {} : { turnRange: { from: message - 1, to: message } };
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, ...window, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  });
  return engine;
};

const fresh = (story: NormalizedStoryV2 = STORY) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  return engine;
};

const randomTurns = (next: () => number, length = 1 + Math.floor(next() * 12)): Turn[] =>
  Array.from({ length }, () => Object.fromEntries(EVENTS.filter(() => next() < 0.16).map((key) => [key, true])));

const compose = (story: NormalizedStoryV2, engine: StoryEngine, state: EngineState = engine.serialize()): GameView =>
  composeGame({ story, state, boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: CAST, enabled: ENABLED }).player;

const surfaces = (game: GameView): string => [JSON.stringify(game), renderToStaticMarkup(createElement(JournalPanel, { game }))].join("\n");

const errorsOf = (raw: Record<string, unknown>): string[] => {
  const parsed = parseStoryV2(raw);
  return Array.isArray(parsed) ? (parsed as ValidationError[]).map((error) => `${error.path}: ${error.message}`) : [];
};

const withCommitment = (patch: Record<string, unknown>): Record<string, unknown> => ({
  ...RAW,
  roster: (RAW.roster as Roster).map((member) => (member.id === "mara" ? { ...member, commitments: [{ ...(member.commitments as Roster)[0], ...patch }] } : member)),
});

beforeAll(async () => {
  await loadGameLayer();
  await loadGameComposer();
});

describe("v2.8 plan 55 M1: commitment latches roll back exactly as a replay rebuilds them", () => {
  test.each(Array.from({ length: 60 }, (_, index) => index + 1))("seed %i: detection is complete, rollback then replay equals the straight run", (seed) => {
    const next = random(seed * 6151);
    const turns = randomTurns(next, 6 + (seed % 10));
    const lag = seed % 2 === 0;
    const straight = play(fresh(), turns, 0, lag);
    const replayed = play(fresh(), turns, 0, lag);
    const message = 2 * (1 + Math.floor(next() * turns.length));
    const moved = replayed.stateLog.some((entry) => entry.context.lastMessageId >= message && Object.keys(entry.after.blackboard.values)
      .some((key) => key.startsWith("life_commit_") && entry.before.blackboard.values[key] !== entry.after.blackboard.values[key]));
    if (moved) expect(replayed.shouldRollbackFromMessage(message)).toBe(true);
    if (replayed.shouldRollbackFromMessage(message)) {
      expect(replayed.rollbackTo(replayed.boundaryBeforeMessage(message) as number).ok).toBe(true);
      const restored = replayed.serialize().boundary;
      play(replayed, turns.slice(restored), restored, lag);
    }
    expect(replayed.serialize().blackboard.values).toEqual(straight.serialize().blackboard.values);
  });

  test("swipe, edit and delete of the keeping reply take the kept state back; reopen is identical; a code-only boundary is detected", () => {
    const turns: Turn[] = [{ offered_help: true }, {}, { past_gate: true }];
    const engine = play(fresh(), turns, 0, true);
    expect(commitmentState("mara", heldCommitments(STORY)[0].commitment, engine.serialize().blackboard.values)).toEqual({ state: "kept", at: 3 });
    const reopened = fresh();
    reopened.hydrate(engine.serialize(), engine.serializeHistory());
    expect(reopened.serialize().blackboard.values).toEqual(engine.serialize().blackboard.values);
    for (const live of [engine, reopened]) {
      expect(live.shouldRollbackFromMessage(6)).toBe(true);
      expect(live.rollbackTo(live.boundaryBeforeMessage(6) as number).ok).toBe(true);
      expect(live.serialize().blackboard.values[commitKey("mara", "gate", "kept")]).toBeUndefined();
      expect(live.serialize().blackboard.values[commitKey("mara", "gate", "made")]).toBe(1);
    }
    const codeOnly = play(fresh(), [{ offered_help: true, past_gate: true }, {}], 0, true);
    const last = codeOnly.stateLog.at(-1)!;
    const changed = Object.keys(last.after.blackboard.values).filter((key) => last.before.blackboard.values[key] !== last.after.blackboard.values[key]);
    expect(changed).toEqual([commitKey("mara", "gate", "kept")]);
    expect(codeOnly.shouldRollbackFromMessage(4)).toBe(true);
  });
});

const injector = (values: Record<string, unknown>, boundary: number) => {
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
    getStory: () => STORY, getState: () => ({ boundary, activeCheckpointId: "start", blackboard: { values, versions: {} } }) as never,
    memory: () => memory, enabled: () => true, capable: () => true, ledgerBindings: () => [], setPinnedOverflow: () => undefined, beatFor: () => "", hosts: () => hosts,
  });
  memoryInjector.update();
  const resting = blocks.get(EPISTEMIC_INJECTION_KEY) ?? "";
  const draft = (id: keyof typeof CAST) => { memoryInjector.onMemberDrafted(names.indexOf(CAST[id])); return blocks.get(EPISTEMIC_INJECTION_KEY) ?? ""; };
  return { resting, draft, shared: { tiers: memoryInjector.blocks(), ledger: memoryInjector.ledgerBlock() } };
};

describe("v2.8 plan 55 M2: the holder alone is reminded", () => {
  it("each open commitment's line is in its holder's drafted block only: 0 in other members, the resting block, shared tiers, the ledger or the player view (150 seeds)", () => {
    let hits = 0;
    let carried = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const engine = play(fresh(), randomTurns(random(seed * 31)));
      const state = engine.serialize();
      const { resting, draft, shared } = injector(state.blackboard.values, state.boundary);
      const blocks = Object.fromEntries((Object.keys(CAST) as Array<keyof typeof CAST>).map((id) => [id, draft(id)]));
      const player = surfaces(compose(STORY, engine));
      heldCommitments(STORY).forEach(({ member, commitment }) => {
        const line = COMMITMENT_COPY.open(commitment.what);
        if (commitmentState(member, commitment, state.blackboard.values)?.state === "made") {
          if (blocks[member].includes(line)) carried += 1; else hits += 1;
        }
        hits += Object.entries(blocks).filter(([id, block]) => id !== member && block.includes(commitment.what)).length;
        hits += [resting, JSON.stringify(shared)].filter((text) => text.includes(commitment.what)).length;
        if (player.includes("You told the player") || player.includes("You kept your word")) hits += 1;
      });
    }
    expect(hits).toBe(0);
    expect(carried).toBeGreaterThan(100);
  });

  it("overdue after due or 12 open turns; kept once; never a line about the player's duty", () => {
    const [gate, debt] = heldCommitments(STORY).map(({ commitment }) => commitment);
    const engine = play(fresh(), [{ offered_help: true }, {}, {}, {}]);
    const values = engine.serialize().blackboard.values;
    expect(commitmentLines(STORY, values, "mara", 4)).toEqual([`- ${COMMITMENT_COPY.open(gate.what)}`, `- ${COMMITMENT_COPY.open(debt.what)}`]);
    expect(commitmentLines(STORY, values, "mara", 5)[0]).toBe(`- ${COMMITMENT_COPY.open(gate.what)} ${COMMITMENT_COPY.overdue}`);
    expect(commitmentLines(STORY, values, "mara", 12)[1]).toBe(`- ${COMMITMENT_COPY.open(debt.what)} ${COMMITMENT_COPY.overdue}`);
    play(engine, [{ past_gate: true }], 4);
    const kept = engine.serialize().blackboard.values;
    expect(commitmentLines(STORY, kept, "mara", 5)[0]).toBe(`- ${COMMITMENT_COPY.kept(gate.what)}`);
    expect(commitmentLines(STORY, kept, "mara", 6).some((line) => line.includes(gate.what))).toBe(false);
    expect(gameLayer()?.life.privateLifeLines(STORY, kept, "mara", [], 5)).toContain(COMMITMENT_COPY.kept(gate.what));
  });
});

describe("v2.8 plan 55 M3: never broken by time", () => {
  const cases: Array<[string, unknown]> = [
    ["a top-level not", { not: { q: "past_gate", op: "==", v: true } }],
    ["time alone", { q: "message_count", op: ">=", v: 30 }],
    ["== false", { q: "past_gate", op: "==", v: false }],
    ["the start value", { all: [{ q: "offered_help", op: "==", v: true }, { q: "mara_betrayed", op: "!=", v: true }] }],
  ];
  test.each(cases)("refuses broken_when on %s", (_name, broken) => {
    expect(errorsOf(withCommitment({ broken_when: broken })).some((error) => error.includes("commitment-broken-on-inaction"))).toBe(true);
  });

  test.each([
    ["a promise to a member", { to: "tom" }, "to the player"],
    ["due.story_day without a clock", { due: { story_day: 3 } }, "needs a clock"],
    ["an underscore id", { id: "north_gate" }, "lowercase letters, digits and -"],
    ["no kept_when", { kept_when: undefined }, "needs kept_when"],
  ])("refuses %s", (_name, patch, message) => {
    expect(errorsOf(withCommitment(patch)).some((error) => error.includes(message))).toBe(true);
  });

  it("refuses kept_when holding at the start", () => {
    const raw = withCommitment({ kept_when: { q: "rel_mara_player_trust", op: "==", v: 0 } });
    (raw.roster as Roster)[0].relationships = [{ toward: "player", axes: ["trust"] }];
    expect(errorsOf(raw).some((error) => error.includes("kept at once"))).toBe(true);
  });

  it("over 400 random walks no commitment reaches broken without its event key turning true by then, and none at all without it", () => {
    let bad = 0;
    let broken = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const engine = play(fresh(), randomTurns(random(seed * 97), 16));
      engine.stateLog.forEach((entry) => {
        const key = commitKey("mara", "gate", "broken");
        if (entry.before.blackboard.values[key] === undefined && entry.after.blackboard.values[key] !== undefined) {
          broken += 1;
          if (entry.after.blackboard.values.mara_betrayed !== true) bad += 1;
        }
      });
      const quiet = play(fresh(), Array.from({ length: 20 }, () => ({ offered_help: true })));
      if (quiet.serialize().blackboard.values[commitKey("mara", "gate", "broken")] !== undefined) bad += 1;
    }
    expect(bad).toBe(0);
    expect(broken).toBeGreaterThan(10);
  });
});

describe("v2.8 plan 55 M4/M5: the player sees only what was said in their hearing, and owes nothing", () => {
  it("M4: over 500 seeds no promise text for an unknown holder or one made out of hearing; heard promises of known holders show with their state", () => {
    let leaks = 0;
    let shown = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = play(fresh(), randomTurns(random(seed)));
      const values = engine.serialize().blackboard.values;
      const text = surfaces(compose(STORY, engine));
      if (text.includes("hide the ledger")) leaks += 1;
      if (values.met_sera !== true && text.includes("carry word to the crown")) leaks += 1;
      const expected = heldCommitments(STORY).filter(({ member, commitment }) => commitment.heard !== false && (member !== "sera" || values.met_sera === true))
        .flatMap(({ member, commitment }) => {
          const state = commitmentState(member, commitment, values);
          return state ? [COMMITMENT_COPY.promised(commitment.what, state.state)] : [];
        });
      const rows = (compose(STORY, engine).codex?.people ?? []).flatMap((entry) => (entry.rows ?? []).filter((row) => row.kind === "promised").map((row) => row.text));
      if (JSON.stringify([...rows].sort()) !== JSON.stringify([...expected].sort())) leaks += 1;
      shown += rows.length;
    }
    expect(leaks).toBe(0);
    expect(shown).toBeGreaterThan(500);
  });

  it("M5: no player surface frames an obligation of the player, counts down or reminds them (500 seeds)", () => {
    const debt = /\byou (owe|must|should|have to|need to|promised|still have)\b|\boverdue\b|\bdue\b|\bturns? left\b|\breminder\b/i;
    let hits = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      const engine = play(fresh(), randomTurns(random(seed * 13)));
      if (debt.test(surfaces(compose(STORY, engine)))) hits += 1;
    }
    expect(hits).toBe(0);
  });
});

describe("v2.8 plan 55 M6 (SC4): a commitments-only story renders; one with nothing stays null", () => {
  it("renders the holder's page from commitments alone", () => {
    const only = parseStoryV2OrThrow({ ...RAW, codex: undefined });
    expect(storyHasGame(only)).toBe(true);
    const engine = play(fresh(only), [{ offered_help: true }]);
    const slice = gameSlices({
      story: only, state: engine.serialize(), boundaryLog: engine.stateLog, checks: undefined, threads: { open: [], resolved: [] }, chat: [], castNames: CAST, authorView: false, enabled: ENABLED,
    });
    expect(slice.game?.codex?.people.map((entry) => entry.name)).toEqual(["Mara", "Sera"].filter((name) => name !== "Sera"));
    expect(slice.game?.codex?.people[0].rows?.map((row) => row.text)).toEqual([
      COMMITMENT_COPY.promised("get past the north gate together", "made"), COMMITMENT_COPY.promised("repay the debt from the river", "made"),
    ]);
    const plain = parseStoryV2OrThrow({ ...RAW, codex: undefined, roster: (RAW.roster as Roster).map(({ commitments: _c, schedule: _s, ...member }) => member) });
    expect(storyHasGame(plain)).toBe(false);
  });
});

describe("v2.8 plan 55: director hooks, kept effects, discovery", () => {
  it("open, heard promises of members who are not away become director hooks", () => {
    const values = play(fresh(), [{ offered_help: true, tom_swore: true }]).serialize().blackboard.values;
    expect(commitmentHooks(STORY, values)).toEqual([COMMITMENT_COPY.hook("Mara", "get past the north gate together"), COMMITMENT_COPY.hook("Mara", "repay the debt from the river")]);
    const away = play(fresh(), [{ offered_help: true, mara_at_market: true, location: "harbour" }]).serialize().blackboard.values;
    expect(commitmentHooks(STORY, away)).toEqual([]);
  });

  it("a kept promise with an effect lands once and replays its world_info from the latch", () => {
    const raw = withCommitment({ effect: { world_info: { lorebook: "Lab", enable: ["Gate open"] } } });
    const story = parseStoryV2OrThrow(raw);
    const engine = play(fresh(story), [{ offered_help: true }, { past_gate: true }]);
    const entry = engine.stateLog.at(-1)!;
    expect(keptCommitments(story, entry.before.blackboard.values, entry.after.blackboard.values).map((kept) => kept.commitment.id)).toEqual(["gate"]);
    expect(gameLayer()?.life.lifeWorldInfo(story, entry.after.blackboard.values)).toEqual([{ lorebook: "Lab", enable: ["Gate open"] }]);
    expect(gameLayer()?.life.lifeWorldInfo(story, entry.before.blackboard.values)).toEqual([]);
  });

  it("the read is offered made_when keys before, kept and broken keys while open, nothing after", () => {
    const before = commitmentDiscoveryUnits(STORY, {}).facts;
    expect(before).toEqual(expect.arrayContaining([["offered_help"], ["tom_swore"], ["met_sera"], ["debt_repaid"]]));
    const open = commitmentDiscoveryUnits(STORY, play(fresh(), [{ offered_help: true }]).serialize().blackboard.values).facts;
    expect(open).toEqual(expect.arrayContaining([["past_gate", "mara_betrayed"]]));
    const kept = commitmentDiscoveryUnits(STORY, play(fresh(), [{ offered_help: true }, { past_gate: true }]).serialize().blackboard.values).facts;
    expect(kept.flat()).not.toContain("past_gate");
  });
});
