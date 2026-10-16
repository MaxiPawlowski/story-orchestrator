import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { chanceSeed, seededStream } from "@engine/chance";
import { parseStoryV2OrThrow, StoryEngine, TENSION_LEVELS, type NormalizedStoryV2 } from "@engine/index";
import type { ModelCall } from "@extraction/index";
import { renderDirectorPrompt } from "@generation/living/prompt";
import { planSceneTest, sceneSignal, sceneSignalLine, type SceneIds, type SceneTestRecord } from "@generation/living/sceneTest";
import { focusCandidates } from "@pacing/focus";
import type { LivingRuntimeState } from "@generation/living/types";
import { sanitizeLivingState } from "@generation/living/sanitize";
import { mintToken, tokenMatches, type RunContext } from "../runToken";
import { livingInputs, type LivingInputs } from "../livingInputs";
import { directorInput } from "../livingUnit";
import { LivingPort } from "../livingPort";
import { livingSlice } from "../livingSnapshot";
import { composeInlineTimeline, type InlineSources } from "../inlineTimeline";
import { defaultInlineSettings } from "../settingsModel";
import { LivingCoordinator, type LivingCoordinatorDeps } from "./livingCoordinator";

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures", `${name}.story.json`), "utf8"));
const withScene = (raw: Record<string, unknown>, living: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ ...raw, living: { ...(raw.living as object), scene_test: { chaos: { from: "tension" } }, ...living } });

const SIGNAL = /^Scene signal: .*$/m;
const FRONTIER = /^The current turning point \(the new one follows it\): "([^"]+)"/m;
const FOCUS = /advances the open thread "([^"]+)"/;
const OPEN = /Threads the player has opened and is still pursuing \(build on one of these first\):\n- ([^\n]+)/;

const nextName = (frontier: string): string => (frontier === "The opening" ? "Turn 1" : `Turn ${Number(/Turn (\d+)/.exec(frontier)?.[1] ?? 0) + 1}`);

const replyFor = (prompt: string, broken = false): string => {
  const name = nextName(FRONTIER.exec(prompt)?.[1] ?? "The opening");
  const index = name.split(" ")[1];
  const scene = broken ? {} : /Scene signal: altered/.test(prompt) ? { changed: "place" }
    : /Scene signal: interrupt/.test(prompt) ? { advances: FOCUS.exec(prompt)?.[1] ?? OPEN.exec(prompt)?.[1] ?? "" } : {};
  return JSON.stringify({
    name, objective: `The tide brings the ${index}th sign to the quay.`, tension: "stirring", snapshot: {}, opens_when: { new: { key: `sign_${index}`, rubric: `Has sign ${index} been seen?` } },
    new_qualities: [], builds_on: null, new_chapter: false, final: false, reason: `pass ${index}`, ...scene,
  });
};

const boundaryInputs = (boundary: number, drift = 0): LivingInputs => ({
  canon: "", openThreads: [`the dark lanterns ${(boundary + drift) % 3}`, `the keeper's silence ${(boundary + drift) % 2}`], resolvedThreads: [], plans: [], refused: null,
  playerNames: ["Max"], tension: TENSION_LEVELS[(boundary + drift) % 5], restatesSecret: () => false, scrub: (text) => text,
});

interface RigOptions {
  horizon?: number;
  ids?: () => SceneIds | null;
  authorView?: boolean;
  critic?: string[];
  drift?: () => number;
  living?: Record<string, unknown>;
}

const rig = (options: RigOptions = {}) => {
  const raw = withScene(fixture("living-premise"), { ...(options.horizon ? { horizon: options.horizon } : {}), ...options.living });
  const context: RunContext = { chatId: "c1", storyId: "s1", storyHash: "h1", sessionEpoch: 1, windowRevision: 0 };
  const engine = new StoryEngine({ now: () => 0 });
  const loaded = { record: { id: "s1", hash: "h1", raw }, story: parseStoryV2OrThrow(raw) as NormalizedStoryV2 };
  engine.loadStory(loaded.story);
  const extras: { living?: LivingRuntimeState } = {};
  const prompts: string[] = [];
  const drawn: SceneTestRecord[] = [];
  const critic = [...(options.critic ?? [])];
  const brokenOnce = { left: 0 };
  const model = (async (prompt: string) => {
    if (prompt.startsWith("Review one generated turning point")) return { text: critic.shift() ?? JSON.stringify({ pass: true, issues: [] }), finish: "stop" as const };
    prompts.push(prompt);
    const broken = brokenOnce.left > 0;
    if (broken) brokenOnce.left -= 1;
    return { text: replyFor(prompt, broken), finish: "stop" as const };
  }) as ModelCall;
  const deps: LivingCoordinatorDeps = {
    getStory: () => loaded.story,
    getState: () => engine.serialize(),
    loaded: () => ({ raw: loaded.record.raw, hash: loaded.record.hash, storyId: loaded.record.id }),
    getLiving: () => extras.living,
    setLiving: (next) => { extras.living = next; },
    setPlayedRaw: (next) => {
      loaded.record = { ...loaded.record, raw: next };
      loaded.story = parseStoryV2OrThrow(next);
      engine.replaceGraph(loaded.story);
    },
    pruneExpansion: () => 0,
    discardUnknownPending: () => engine.discardPendingUnknown(),
    ensureActive: () => engine.ensureActiveCheckpoint(),
    historyFloor: () => engine.historyFrom().boundary,
    enabled: () => true, branching: () => false, prefetch: () => false, authorView: () => options.authorView ?? false, sealsOn: () => true,
    inputs: () => boundaryInputs(engine.serialize().boundary, options.drift?.() ?? 0),
    recentTurns: async () => [], chatRows: () => [], askDivergence: async () => null,
    saveRecord: (story) => ({ ok: true, id: String(story.id), title: story.title }), storyIdTaken: () => false,
    model,
    ownership: { mint: () => mintToken(context), check: (token) => tokenMatches(context, token) },
    journal: () => undefined, persist: async () => undefined, notify: () => undefined,
    sceneIds: options.ids ?? (() => ({ chatId: "chat-1", storyId: "s1" })),
    enabledIds: () => ["harbourmaster", "innkeeper", "keeper", "narrator"],
    sceneDrawn: (record) => { drawn.push(record); },
  };
  const coordinator = new LivingCoordinator(deps);
  coordinator.adopt("activate");
  const commit = async (sets: readonly string[] = []) => {
    if (sets.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: sets.map((q) => ({ q, v: true, source: "extractor" as const })) });
    const boundary = engine.serialize().boundary + 1;
    const result = engine.commitBoundary({ lastMessageId: boundary * 2, chatLength: boundary * 2 + 1 });
    await coordinator.applyAccepted({ boundary: result.boundary, messageId: boundary * 2 });
    coordinator.compact();
  };
  const step = async (seed: number, index: number) => {
    if (coordinator.due()) await coordinator.propose();
    const open = loaded.story.qualities.filter((quality) => quality.key.startsWith("liv_") && quality.source === "extractor").map((quality) => quality.key);
    const random = seededStream(chanceSeed([seed, index]));
    await commit(open.filter(() => random() < 0.5));
  };
  const rollback = (boundary: number) => {
    engine.rollbackTo(boundary);
    coordinator.restoreAfterRollback(engine.serialize().boundary);
  };
  const reopen = () => { extras.living = sanitizeLivingState(JSON.parse(JSON.stringify(extras.living))); };
  const toFirstTurn = async () => {
    await coordinator.propose();
    const first = extras.living?.proposals.at(-1);
    if (first?.status === "proposed") await coordinator.decide(first.id, "accepted");
    await commit();
    await commit(["liv_1_sign_1"]);
    await commit();
    return engine.serialize().activeCheckpointId;
  };
  return { engine, loaded, extras, coordinator, deps, prompts, drawn, commit, step, rollback, reopen, brokenOnce, toFirstTurn };
};

const frozen = (rigged: ReturnType<typeof rig>) => JSON.stringify(rigged.extras.living?.sceneTests ?? []);

const linesByFrontier = (prompts: readonly string[]): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  prompts.forEach((prompt) => {
    const frontier = FRONTIER.exec(prompt)?.[1] ?? "?";
    (map.get(frontier) ?? map.set(frontier, new Set()).get(frontier))?.add(SIGNAL.exec(prompt)?.[0] ?? "(expected)");
  });
  return map;
};

const STEPS = 14;

const straightRun = async (seed: number, horizon: number) => {
  const rigged = rig({ horizon });
  for (let index = 0; index < STEPS; index += 1) await rigged.step(seed, index);
  return { tests: frozen(rigged), lines: linesByFrontier(rigged.prompts) };
};

const cutRun = async (seed: number, horizon: number, cut: number, ids?: () => SceneIds | null) => {
  const random = seededStream(chanceSeed([seed, horizon, cut, "cut"]));
  const at = 1 + Math.floor(random() * (STEPS - 1));
  const back = Math.floor(random() * at);
  const rigged = rig({ horizon, ids });
  for (let index = 0; index < at; index += 1) await rigged.step(seed, index);
  const planned = rigged.extras.living?.sceneTests?.length ?? 0;
  rigged.rollback(back);
  const dropped = planned - (rigged.extras.living?.sceneTests?.length ?? 0);
  if (random() < 0.3) rigged.reopen();
  for (let index = back; index < STEPS; index += 1) await rigged.step(seed, index);
  return { tests: frozen(rigged), lines: linesByFrontier(rigged.prompts), dropped };
};

const sameLines = (cut: Map<string, Set<string>>, straight: Map<string, Set<string>>): boolean =>
  [...cut.entries()].every(([frontier, lines]) => lines.size === 1 && straight.get(frontier)?.size === 1 && [...lines][0] === [...(straight.get(frontier) ?? [])][0]);

describe("v2.8 48 S1 rollback ≡ replay of scene tests and the director line", () => {
  it.each([1, 3])("0 mismatches over 4 seeds × 100 cuts at horizon %i", async (horizon) => {
    const mismatches: string[] = [];
    let unexpected = 0;
    let dropped = 0;
    for (const seed of [1, 2, 3, 4]) {
      const straight = await straightRun(seed, horizon);
      unexpected += (JSON.parse(straight.tests) as SceneTestRecord[]).filter((record) => record.applied !== "expected").length;
      for (let cut = 0; cut < 100; cut += 1) {
        const replay = await cutRun(seed, horizon, cut);
        dropped += replay.dropped;
        if (replay.tests !== straight.tests || !sameLines(replay.lines, straight.lines)) mismatches.push(`${seed}:${cut}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(unexpected).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(50);
  }, 240_000);

  it("control: draws keyed by the wall clock fail", async () => {
    let tick = 0;
    const clock = () => ({ chatId: `chat-${Date.now()}-${(tick += 1)}`, storyId: "s1" });
    const mismatches: number[] = [];
    for (let cut = 0; cut < 20; cut += 1) {
      const straight = await (async () => {
        const rigged = rig({ horizon: 3, ids: clock });
        for (let index = 0; index < STEPS; index += 1) await rigged.step(9, index);
        return frozen(rigged);
      })();
      const replay = await cutRun(9, 3, cut, clock);
      if (replay.tests !== straight) mismatches.push(cut);
    }
    expect(mismatches.length).toBeGreaterThan(10);
  }, 120_000);

  it("code-only boundary: a plan with nothing applied still makes the swipe roll back, and the record goes", async () => {
    const rigged = rig();
    expect(await rigged.toFirstTurn()).toBe("liv_1");
    await rigged.coordinator.propose();
    const living = rigged.extras.living as LivingRuntimeState;
    expect(living.sceneTests?.map((record) => [record.frontierId, record.plannedAt])).toEqual([["liv_1", 3]]);
    rigged.extras.living = { ...living, proposals: living.proposals.map((proposal) => ({ ...proposal, status: "failed" as const })) };
    const port = new LivingPort(rigged.deps);
    expect(rigged.extras.living.ops.every((op) => op.boundary <= 2)).toBe(true);
    expect(port.movedAfter(2)).toBe(true);
    expect(port.movedAfter(3)).toBe(false);
    rigged.rollback(2);
    expect(rigged.extras.living?.sceneTests).toEqual([]);
  });
});

const UNEXPECTED_CHAT = (() => {
  const candidates = focusCandidates({ arcs: boundaryInputs(3).openThreads, unknownNames: [] });
  const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const } } } };
  for (let index = 0; index < 200; index += 1) {
    const record = planSceneTest({ story, ids: { chatId: `c${index}`, storyId: "s1" }, frontierId: "liv_1", frontierName: "Turn 1", plannedAt: 3, messageId: 6, tension: boundaryInputs(3).tension, candidates, prior: [] });
    if (record?.applied === "interrupt") return `c${index}`;
  }
  return "none";
})();

describe("v2.8 48 S3 frozen, no reroll", () => {
  it("regenerate ×10, a critic-refusal retry, a broken answer, a tension change and new arcs keep the outcome and focus; a swipe past it then replay redraws the original", async () => {
    let drift = 0;
    const rigged = rig({
      authorView: true, living: { autonomy: "suggest" }, drift: () => drift, ids: () => ({ chatId: UNEXPECTED_CHAT, storyId: "s1" }),
      critic: [JSON.stringify({ pass: true, issues: [] }), JSON.stringify({ pass: false, issues: ["the objective decides for the player"] })],
    });
    expect(await rigged.toFirstTurn()).toBe("liv_1");
    await rigged.coordinator.propose();
    const original = rigged.extras.living?.sceneTests?.[0];
    expect(original).toMatchObject({ frontierId: "liv_1", plannedAt: 3, applied: "interrupt" });
    const first = frozen(rigged);
    const before = rigged.prompts.length - 1;
    for (let index = 0; index < 10; index += 1) {
      drift = index + 1;
      rigged.brokenOnce.left = index === 3 ? 1 : 0;
      const waiting = rigged.extras.living?.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "failed").at(-1);
      expect(await rigged.coordinator.regenerate(waiting?.id ?? "")).not.toBeNull();
    }
    expect(frozen(rigged)).toBe(first);
    expect(rigged.drawn).toHaveLength(1);
    const lines = new Set(rigged.prompts.slice(before).map((prompt) => SIGNAL.exec(prompt)?.[0] ?? "(expected)"));
    expect([...lines]).toEqual([sceneSignalLine(sceneSignal(original ?? null) ?? { applied: "altered", expected: { from: "", thread: null } })]);
    expect(rigged.prompts.length - before).toBeGreaterThan(11);
    rigged.rollback(2);
    expect(rigged.extras.living?.sceneTests).toEqual([]);
    drift = 0;
    await rigged.commit();
    await rigged.coordinator.propose();
    expect(rigged.extras.living?.sceneTests).toEqual([original]);
  });
});

describe("v2.8 48 S4 expected = today", () => {
  const GOLDEN = join(process.cwd(), "test/goldens/living-scene-test/director-prompt-premise.txt");
  const scene = (patch: Partial<SceneTestRecord> = {}): SceneTestRecord => ({
    frontierId: "liv_open", plannedAt: 0, messageId: 0, chaos: 2, p: 3 / 7, unit: 0.1, drawn: "interrupt", applied: "interrupt", focus: "the dark lanterns",
    expected: { from: "The opening", thread: "the dark lanterns" }, ...patch,
  });
  const build = (raw: Record<string, unknown>, sceneTest?: SceneTestRecord | null) => {
    const story = parseStoryV2OrThrow(raw) as NormalizedStoryV2;
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    const inputs: LivingInputs = { ...boundaryInputs(0), openThreads: ["the dark lanterns"], tension: "tense" };
    return renderDirectorPrompt(directorInput({
      story, raw, frontierId: "liv_open", state: engine.serialize(), sealsOn: true, inputs, model: (async () => ({ text: "" })) as never, debugResponse: null,
      ...(sceneTest !== undefined ? { sceneTest } : {}),
    }));
  };

  it("absent scene_test and an expected outcome give the byte-identical prompt (golden)", () => {
    const today = build(fixture("living-premise"));
    if (process.env.SO_RECORD_SCENE_GOLDEN === "1" || !existsSync(GOLDEN)) {
      mkdirSync(join(GOLDEN, ".."), { recursive: true });
      writeFileSync(GOLDEN, today, "utf8");
    }
    expect(today).toBe(readFileSync(GOLDEN, "utf8").split("\r\n").join("\n"));
    expect(build(withScene(fixture("living-premise")), scene({ applied: "expected", drawn: "expected" }))).toBe(today);
    expect(build(withScene(fixture("living-premise")), null)).toBe(today);
    expect(build(withScene(fixture("living-premise")), scene())).not.toBe(today);
  });

  it("a changed outcome adds exactly one line", () => {
    const today = build(fixture("living-premise")).split("\n");
    const changed = build(withScene(fixture("living-premise")), scene()).split("\n");
    expect(changed.length - today.length).toBe(1);
    expect(changed.filter((line) => !today.includes(line))).toEqual([expect.stringMatching(/^Scene signal: interrupt\./)]);
  });
});

const inlineSources = (sceneTests: SceneTestRecord[] | undefined, authorView: boolean, level: 1 | 2 | 3 | 4): InlineSources => ({
  story: null, settings: { ...defaultInlineSettings(), level }, authorView, chatLength: 12, boundaryLog: [], audits: [], pending: [], reconciliation: [],
  memory: { entries: [], arcs: [], derived: [], conflicts: [], verifyDrops: [] }, loreFired: [], talkDecisions: [], judgeCalls: [], proposals: [], curatorPass: null,
  effects: [], tensionHistory: [], tension: { expected: null, hint: null }, payloadCaptures: [],
  pipeline: { state: "idle", text: "", detail: null, needsSetup: false, nextAction: null } as never, agencyRecovery: false, lastRollback: null, saveNotice: null,
  ...(sceneTests ? { sceneTests } : {}),
});

describe("v2.8 48 S5 player clean at fixed played state", () => {
  const records: SceneTestRecord[] = (["expected", "altered", "interrupt"] as const).map((applied, index) => ({
    frontierId: `liv_${index + 1}`, plannedAt: index * 2, messageId: index * 3, chaos: index, p: (index + 1) / 7, unit: 0.05, drawn: applied, applied,
    ...(applied === "interrupt" ? { focus: "the dark lanterns" } : {}), expected: { from: "The opening", thread: "the dark lanterns" },
  }));

  it("player inline view, at every player level, is byte-identical with and without scene tests at each outcome", () => {
    for (const level of [1, 2, 3, 4] as const) {
      const without = JSON.stringify(composeInlineTimeline(inlineSources(undefined, false, level)));
      for (const record of records) expect(JSON.stringify(composeInlineTimeline(inlineSources([record], false, level)))).toBe(without);
    }
    const author = composeInlineTimeline(inlineSources(records, true, 3));
    expect(Object.values(author.byMessage).flat().filter((item) => item.text.startsWith("Scene test:")).map((item) => [item.text, item.persona]))
      .toEqual([["Scene test: expected", "author"], ["Scene test: altered", "author"], ["Scene test: interrupt", "author"]]);
  });

  it("the player's living slice is identical with and without scene tests", () => {
    const story = parseStoryV2OrThrow(withScene(fixture("living-premise"))) as NormalizedStoryV2;
    const plain = parseStoryV2OrThrow(fixture("living-premise")) as NormalizedStoryV2;
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    const living = { authored: null, folded: [], ops: [], proposals: [], epochBumps: 0, passes: 0, lastPass: null };
    const slice = (s: NormalizedStoryV2, sceneTests?: SceneTestRecord[]) =>
      JSON.stringify(livingSlice({ story: s, state: engine.serialize(), living: { ...living, ...(sceneTests ? { sceneTests } : {}) }, authorView: false, enabled: true, branching: true, epoch: null }));
    expect(slice(story, records)).toBe(slice(plain));
  });
});

describe("v2.8 49 C4 focus is spoiler-safe by information (through the director's real inputs)", () => {
  it("0 forbidden strings over 10,000 draws; a known secret-holder is picked at its share; the control emits each forbidden string", () => {
    const secret = "she sold the lantern oil";
    const hidden = "the drowned bell under the pier";
    const unmet = "Corvin";
    const arcs = [
      { id: "a1", status: "open", text: `Maren is hiding the harbour ledger [${secret}]` },
      { id: "a2", status: "open", text: "the dark lanterns on the north quay" },
      { id: "a3", status: "open", text: `${unmet} was seen at the pier` },
      { id: "a4", status: "hidden", text: hidden },
    ];
    const resting = (text: string) => text.replace(/\s*\[[^\]]*\]/g, "");
    const sources = (filtered: boolean) => livingInputs({
      memory: {
        injector: { restingFilter: () => (filtered ? resting : (text: string) => text) },
        canon: { getCanon: () => "" },
        getOpenArcs: () => (filtered ? arcs.filter((arc) => arc.status === "open") : arcs).map((arc) => arc.text),
        getArcs: () => arcs,
      },
      state: () => null, refused: () => null, playerName: () => "Max",
    });
    const run = (filtered: boolean) => {
      const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const }, min_gap: 0 } } };
      const candidates = focusCandidates({ arcs: sources(filtered).openThreads, unknownNames: filtered ? [unmet] : [] });
      const lines: string[] = [];
      const picks = new Map<string, number>();
      for (let index = 0; index < 10_000; index += 1) {
        const record = planSceneTest({ story, ids: { chatId: `c${index}`, storyId: "s" }, frontierId: "liv_1", frontierName: "F", plannedAt: index, messageId: index, tension: "peak", candidates, prior: [] });
        const signal = sceneSignal(record);
        if (signal) lines.push(sceneSignalLine(signal));
        if (record?.focus) picks.set(record.focus, (picks.get(record.focus) ?? 0) + 1);
      }
      return { lines, picks };
    };
    const safe = run(true);
    expect(safe.lines.filter((line) => [secret, hidden, unmet].some((needle) => line.includes(needle)))).toEqual([]);
    const total = [...safe.picks.values()].reduce((sum, count) => sum + count, 0);
    expect(Math.abs((safe.picks.get("Maren is hiding the harbour ledger") ?? 0) / total - 0.5)).toBeLessThanOrEqual(0.02);
    const control = run(false);
    expect([secret, hidden, unmet].map((needle) => control.lines.some((line) => line.includes(needle)))).toEqual([true, true, true]);
  });
});

const chatDrawing = (outcome: "altered" | "interrupt", threads: readonly string[], plannedAt = 3): string => {
  const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const } } } };
  const candidates = focusCandidates({ arcs: threads, unknownNames: [] });
  for (let index = 0; index < 500; index += 1) {
    const record = planSceneTest({ story, ids: { chatId: `p${index}`, storyId: "s1" }, frontierId: "liv_1", frontierName: "Turn 1", plannedAt, messageId: 6, tension: "peak", candidates, prior: [] });
    if (record?.applied === outcome) return `p${index}`;
  }
  return "none";
};

describe("v2.8 48 C5 frozen scene text is re-checked against today's privacy before every director request", () => {
  const fixed = (openThreads: string[], scrub: (text: string) => string = (text) => text): LivingInputs => ({
    canon: "", openThreads, resolvedThreads: [], plans: [], refused: null, playerNames: ["Max"], tension: "peak",
    restatesSecret: (text) => scrub(text).trim() !== text.trim(), scrub,
  });
  const frozenThenRegenerate = async (outcome: "altered" | "interrupt", thread: string, tighten: (rigged: ReturnType<typeof rig>) => void) => {
    const rigged = rig({ authorView: true, living: { autonomy: "suggest" }, ids: () => ({ chatId: chatDrawing(outcome, [thread]), storyId: "s1" }) });
    const notes: string[] = [];
    rigged.deps.journal = (summary) => { notes.push(summary); };
    expect(await rigged.toFirstTurn()).toBe("liv_1");
    rigged.deps.inputs = () => fixed([thread]);
    await rigged.coordinator.propose();
    const original = frozen(rigged);
    expect(rigged.extras.living?.sceneTests?.[0]).toMatchObject({ frontierId: "liv_1", applied: outcome, expected: { thread } });
    expect(rigged.prompts.at(-1)).toContain(`Scene signal: ${outcome}`);
    expect(rigged.prompts.at(-1)).toContain(thread);
    tighten(rigged);
    const waiting = rigged.extras.living?.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "failed").at(-1);
    expect(await rigged.coordinator.regenerate(waiting?.id ?? "")).not.toBeNull();
    const prompt = rigged.prompts.at(-1) ?? "";
    return { prompt, original, after: frozen(rigged), drawn: rigged.drawn.length, notes };
  };

  it.each(["altered", "interrupt"] as const)("a late held-secret read: the %s line is withheld, the draw is kept, no reroll", async (outcome) => {
    const thread = "the keeper's ledger of the drowned";
    const run = await frozenThenRegenerate(outcome, thread, (rigged) => {
      const scrub = (text: string) => text.replace(/\s*ledger of the drowned/, "");
      rigged.deps.inputs = () => fixed([], scrub);
    });
    expect(run.prompt).not.toContain("ledger of the drowned");
    expect(SIGNAL.test(run.prompt)).toBe(false);
    expect(run.after).toBe(run.original);
    expect(run.drawn).toBe(1);
    expect(run.notes).toContain("scene signal withheld");
  });

  it.each(["altered", "interrupt"] as const)("a disclosure change (a member becomes unknown): the %s line is withheld, the draw is kept, no reroll", async (outcome) => {
    const thread = "Ysolde keeps the lamp dark";
    const run = await frozenThenRegenerate(outcome, thread, (rigged) => {
      rigged.deps.enabledIds = () => ["harbourmaster", "innkeeper", "narrator"];
      rigged.deps.inputs = () => fixed([]);
    });
    expect(run.prompt).not.toContain(thread);
    expect(SIGNAL.test(run.prompt)).toBe(false);
    expect(run.after).toBe(run.original);
    expect(run.drawn).toBe(1);
  });

  it("control: privacy unchanged keeps the frozen line byte-identical on regenerate", async () => {
    const thread = "Ysolde keeps the lamp dark";
    const run = await frozenThenRegenerate("interrupt", thread, () => undefined);
    expect(run.prompt).toContain(`advances the open thread "${thread}"`);
    expect(run.notes).not.toContain("scene signal withheld");
  });
});

describe("v2.8 48 C6 history compaction keeps what a frontier still needs", () => {
  const steady = (): LivingInputs => ({
    canon: "", openThreads: ["the dark lanterns"], resolvedThreads: [], plans: [], refused: null, playerNames: ["Max"], tension: "peak",
    restatesSecret: () => false, scrub: (text) => text,
  });
  const LONG = 205;

  it("more than 200 boundaries on one unresolved frontier: regenerate keeps the frozen draw, nothing redraws", async () => {
    const rigged = rig({ authorView: true, living: { autonomy: "suggest" }, ids: () => ({ chatId: chatDrawing("interrupt", ["the dark lanterns"]), storyId: "s1" }) });
    rigged.deps.inputs = steady;
    expect(await rigged.toFirstTurn()).toBe("liv_1");
    await rigged.coordinator.propose();
    const original = frozen(rigged);
    expect(rigged.extras.living?.sceneTests?.[0]).toMatchObject({ frontierId: "liv_1", plannedAt: 3, applied: "interrupt" });
    const line = SIGNAL.exec(rigged.prompts.at(-1) ?? "")?.[0];
    for (let index = 0; index < LONG; index += 1) await rigged.commit();
    expect(rigged.engine.historyFrom().boundary).toBeGreaterThan(3);
    expect(frozen(rigged)).toBe(original);
    const waiting = rigged.extras.living?.proposals.filter((proposal) => proposal.status === "proposed" || proposal.status === "failed").at(-1);
    expect(await rigged.coordinator.regenerate(waiting?.id ?? "")).not.toBeNull();
    expect(frozen(rigged)).toBe(original);
    expect(rigged.drawn).toHaveLength(1);
    expect(SIGNAL.exec(rigged.prompts.at(-1) ?? "")?.[0]).toBe(line);
  }, 120_000);

  it("widely spaced frontiers with min_gap 2: the earlier interrupt still spaces the next one after compaction", async () => {
    const SECOND = 3 + 2 + LONG;
    const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const }, min_gap: 2 } } };
    const candidates = focusCandidates({ arcs: ["the dark lanterns"], unknownNames: [] });
    const draw = (chatId: string, frontierId: string, plannedAt: number) =>
      planSceneTest({ story, ids: { chatId, storyId: "s1" }, frontierId, frontierName: "F", plannedAt, messageId: 0, tension: "peak", candidates, prior: [] });
    const chatId = Array.from({ length: 2000 }, (_, index) => `w${index}`)
      .find((id) => draw(id, "liv_1", 3)?.applied === "interrupt" && draw(id, "liv_2", SECOND)?.drawn === "interrupt") ?? "none";
    const rigged = rig({ living: { scene_test: { chaos: { from: "tension" }, min_gap: 2 } }, ids: () => ({ chatId, storyId: "s1" }) });
    rigged.deps.inputs = steady;
    expect(await rigged.toFirstTurn()).toBe("liv_1");
    await rigged.coordinator.propose();
    await rigged.commit();
    await rigged.commit(["liv_2_sign_2"]);
    for (let index = 0; index < LONG; index += 1) await rigged.commit();
    expect(rigged.engine.historyFrom().boundary).toBeGreaterThan(3);
    expect(rigged.coordinator.frontier()).toBe("liv_2");
    await rigged.coordinator.propose();
    const records = rigged.extras.living?.sceneTests ?? [];
    expect(records.map((record) => [record.frontierId, record.plannedAt, record.drawn, record.applied]))
      .toEqual([["liv_1", 3, "interrupt", "interrupt"], ["liv_2", SECOND, "interrupt", "altered"]]);
  }, 120_000);
});

describe("v2.8 48 C7 the director's open threads drop arcs naming an unmet person (SC3)", () => {
  const OPEN_BLOCK = /Threads the player has opened and is still pursuing[^\n]*\n((?:- [^\n]+\n?)+)/;
  const openThreadsIn = async (enabled: string[]) => {
    const rigged = rig();
    rigged.deps.enabledIds = () => enabled;
    rigged.deps.inputs = () => ({
      canon: "", openThreads: ["Ysolde keeps the lamp dark", "the dark lanterns", "Q waits at the gate"], resolvedThreads: [], plans: [], refused: null,
      playerNames: ["Max"], tension: "stirring", restatesSecret: () => false, scrub: (text) => text,
    });
    await rigged.coordinator.propose();
    return OPEN_BLOCK.exec(rigged.prompts[0] ?? "")?.[1] ?? "";
  };

  it("a member the player has not met is dropped from the open threads; a known thread stays", async () => {
    const block = await openThreadsIn(["harbourmaster", "innkeeper", "narrator"]);
    expect(block).toContain("the dark lanterns");
    expect(block).not.toContain("Ysolde keeps the lamp dark");
  });

  it("control: with the member known the same thread reaches the director", async () => {
    const block = await openThreadsIn(["harbourmaster", "innkeeper", "keeper", "narrator"]);
    expect(block).toContain("Ysolde keeps the lamp dark");
    expect(block).toContain("Q waits at the gate");
  });
});

describe("v2.8 48 S6 chaos writers", () => {
  const FORBIDDEN = /Date\.now|new Date|Math\.random|agencyRecovery|refus|performance\.now/;
  const sources = ["src/generation/living/sceneTest.ts", "src/pacing/focus.ts"];
  const coordinatorScene = () => {
    const text = readFileSync(join(process.cwd(), "src/runtime/coordinators/livingCoordinator.ts"), "utf8");
    const start = text.indexOf("private sceneTest(");
    return text.slice(start, text.indexOf("\n  }\n", start) > 0 ? text.indexOf("\n  }\n", start) : text.indexOf("\r\n  }\r\n", start));
  };

  it("no chaos path reads the agency recovery, a refusal counter or the wall clock", () => {
    const offenders = sources.filter((path) => FORBIDDEN.test(readFileSync(join(process.cwd(), path), "utf8")));
    expect(offenders).toEqual([]);
    expect(coordinatorScene().length).toBeGreaterThan(100);
    expect(FORBIDDEN.test(coordinatorScene())).toBe(false);
    expect(/inputs\.refused/.test(coordinatorScene())).toBe(false);
  });

  it("control: a planted writer is caught", () => {
    expect(FORBIDDEN.test("const chaos = sceneChaos(tension) + (Date.now() % 2);")).toBe(true);
    expect(FORBIDDEN.test("const chaos = inputs.refused ? 4 : sceneChaos(tension);")).toBe(true);
  });
});
