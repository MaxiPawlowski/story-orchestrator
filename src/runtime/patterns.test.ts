import { parseStory, parseStoryOrThrow, type EngineState, type NormalizedStory } from "@engine/index";
import type { StoryPattern } from "@engine/patternSchema";
import type { EffectRef } from "./recapPort";
import {
  applyBoundary, branchKey, callbackLines, currentBranches, currentRing, foldFloor, hintLines, patternProjection, patternRev, reconcilePatterns, runBoundary, sanitizeState, toMatchRefs,
} from "./patterns";
import { createPatterns, rollbackPatterns, type PatternResting, type PatternsState } from "./patternsPort";

const check = (id: string, narrate = "public") => ({ id, label: id, quality: `${id}_ok`, roll: { sides: 20, target: 10 }, narrate });

const RAW = {
  id: "patterns", title: "Patterns", description: "",
  qualities: ["a", "b", "c", "x", "hide"].map((id) => ({ key: `${id}_ok`, type: "bool", source: "code", rubric: `${id}?` }))
    .concat([{ key: "go", type: "bool", source: "extractor", rubric: "go?" }] as never),
  checkpoints: [
    { id: "start", name: "Start", objective: "o", type: "anchor", start: true, checks: [check("a"), check("b"), check("c"), check("x"), check("hide", "hidden")] },
    { id: "gate", name: "Gate", player_name: "The Gate", objective: "o", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "gate", priority: 1, gate: { q: "go", op: "==", v: true } }, { from: "gate", to: "start", priority: 1, gate: { q: "go", op: "==", v: false } }],
  roster: [{ id: "mara", name: "Mara" }, { id: "tobin", name: "Tobin" }],
  quests: [
    { id: "q1", title: "Ferry the crates", kind: "side", giver: "mara", done_when: { q: "a_ok", op: "==", v: true }, steps: [] },
    { id: "q2", title: "Mend the nets", kind: "side", giver: "mara", done_when: { q: "b_ok", op: "==", v: true }, steps: [] },
    { id: "q3", title: "Find the lamp", kind: "side", giver: "tobin", visible_when: { q: "go", op: "==", v: true }, done_when: { q: "c_ok", op: "==", v: true }, steps: [] },
  ],
  milestones: [{ id: "spring", title: "The Spring", when: { q: "a_ok", op: "==", v: true } }, { id: "vault", title: "The Vault", when: { q: "b_ok", op: "==", v: true }, secret: true }],
};

const storyWith = (patterns: StoryPattern[]): NormalizedStory => parseStoryOrThrow({ ...RAW, patterns });

const ABC = (extra: Partial<StoryPattern> = {}): StoryPattern => ({
  id: "abc", steps: [{ kind: "check", id: "a" }, { kind: "check", id: "b" }, { kind: "check", id: "c" }], label: { text: "A, then B, then C." }, ...extra,
});

const at = { messageId: 0, chapterId: null, visible: true, authored: false, causes: [] };
const chk = (id: string, boundary: number, to = "success"): EffectRef => ({ ...at, kind: "check", id, to, boundary, messageId: boundary * 2 });
const quest = (id: string, boundary: number, to = "done"): EffectRef => ({ ...at, kind: "quest", id, from: "active", to, boundary, messageId: boundary * 2 });

type Turns = Array<[number, EffectRef[]]>;

const play = (story: NormalizedStory, turns: Turns, state: PatternsState = createPatterns()): PatternsState =>
  turns.reduce((acc, [boundary, refs]) => applyBoundary(story, acc, { boundary, messageId: boundary * 2 }, refs), state);

const turnsOf = (...groups: EffectRef[][]): Turns => groups.map((refs, index) => [index + 1, refs.map((ref) => ({ ...ref, boundary: index + 1, messageId: (index + 1) * 2 }))]);

const cursors = (state: PatternsState) => state.completed.map((completion) => completion.refs.map((ref) => `${ref.id}@${ref.boundary}.${ref.index}`).join(" "));

describe("v2.9 05 A: frozen ordering fixtures", () => {
  it("A–B–B–C completes once with the later B, for once and each", () => {
    const turns = turnsOf([chk("a", 0)], [chk("b", 0)], [chk("b", 0)], [chk("c", 0)]);
    expect(cursors(play(storyWith([ABC()]), turns))).toEqual(["a@1.0 b@3.0 c@4.0"]);
    expect(cursors(play(storyWith([ABC({ repeat: "each" })]), turns))).toEqual(["a@1.0 b@3.0 c@4.0"]);
  });

  it("an unless between B1 and C kills the waiting parent; the copy advanced by B2 survives", () => {
    const story = storyWith([ABC({ unless: [{ kind: "check", id: "b", between: [2, 3] }] })]);
    const state = play(story, turnsOf([chk("a", 0)], [chk("b", 0)], [chk("b", 0)], [chk("c", 0)]));
    expect(cursors(state)).toEqual(["a@1.0 b@3.0 c@4.0"]);
    expect(currentRing(state).map((kill) => [kill.reason, kill.next, `${kill.ref.boundary}.${kill.ref.index}`])).toContainEqual(["unless", 2, "3.0"]);
  });

  it("two steps matched in one boundary complete in derivation order only", () => {
    const story = storyWith([{ id: "ab", steps: [{ kind: "check", id: "a" }, { kind: "check", id: "b" }], label: { text: "Both." } }]);
    expect(cursors(play(story, turnsOf([chk("a", 0), chk("b", 0)])))).toEqual(["a@1.0 b@1.1"]);
    expect(cursors(play(story, turnsOf([chk("b", 0), chk("a", 0)])))).toEqual([]);
  });

  it("a ref that is both the next step and an open unless advances the copy and kills only the parent", () => {
    const story = storyWith([{ id: "ab", steps: [{ kind: "check", id: "a" }, { kind: "check", id: "b" }], unless: [{ kind: "check", id: "b", between: [1, 2] }], label: { text: "Both." } }]);
    expect(cursors(play(story, turnsOf([chk("a", 0)], [chk("b", 0)])))).toEqual(["a@1.0 b@2.0"]);
  });

  it("a bound variable must agree: two quests from one giver complete, from two givers do not", () => {
    const story = storyWith([{ id: "patron", steps: [{ kind: "quest", to: "done", where: { giver: "?who" } }, { kind: "quest", to: "done", where: { giver: "?who" } }], label: { text: "Two favours." } }]);
    expect(cursors(play(story, turnsOf([quest("q1", 0)], [quest("q3", 0)])))).toEqual([]);
    const same = play(story, turnsOf([quest("q1", 0)], [quest("q3", 0)], [quest("q2", 0)]));
    expect(cursors(same)).toEqual(["q1@1.0 q2@3.0"]);
  });

  it("the ref that matched step i is outside its own unless interval", () => {
    const story = storyWith([ABC({ unless: [{ kind: "check", id: "a", between: [1, 2] }] })]);
    expect(cursors(play(story, turnsOf([chk("a", 0)], [chk("b", 0)], [chk("c", 0)])))).toEqual(["a@1.0 b@2.0 c@3.0"]);
    const again = play(story, turnsOf([chk("a", 0)], [chk("a", 0)], [chk("b", 0)], [chk("c", 0)]));
    expect(cursors(again)).toEqual(["a@2.0 b@3.0 c@4.0"]);
    expect(currentRing(again).some((kill) => kill.reason === "unless")).toBe(true);
  });

  it("within counts from the first step: exactly within still matches, within + 1 expires", () => {
    const story = storyWith([{ id: "ab", steps: [{ kind: "check", id: "a" }, { kind: "check", id: "b" }], within: 3, label: { text: "Quick." } }]);
    expect(cursors(play(story, [[1, [chk("a", 1)]], [4, [chk("b", 4)]]]))).toEqual(["a@1.0 b@4.0"]);
    const late = play(story, [[1, [chk("a", 1)]], [2, []], [3, []], [4, []], [5, [chk("b", 5)]]]);
    expect(cursors(late)).toEqual([]);
    expect(currentRing(late).map((kill) => kill.reason)).toEqual(["expired"]);
  });

  it("reads only what the player can see: hidden checks, secret milestones, hidden quests and living transitions never match", () => {
    const story = storyWith([{ id: "any", steps: [{ kind: "milestone" }], repeat: "each", label: { text: "A milestone." } }, { id: "c", steps: [{ kind: "check" }], repeat: "each", label: { text: "A check." } }]);
    const refs: EffectRef[] = [
      { ...at, kind: "milestone", id: "vault", boundary: 1 }, { ...at, kind: "check", id: "hide", to: "success", boundary: 1 },
      { ...at, kind: "check", id: "a", to: "success", boundary: 1, visible: false }, { ...at, kind: "transition", id: "x", from: "start", to: "liv_1", boundary: 1 },
      { ...at, kind: "quest", id: "q1", to: "hidden", boundary: 1, visible: false },
    ];
    expect(toMatchRefs(story, refs)).toEqual([]);
    expect(play(story, [[1, refs]]).completed).toEqual([]);
  });
});

describe("v2.9 05 A: validation", () => {
  const errors = (patterns: unknown[]) => {
    const parsed = parseStory({ ...RAW, patterns });
    return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
  };
  it("refuses private sources, bad vocabulary and over-limit patterns", () => {
    const label = { text: "x" };
    expect(errors([{ id: "m", steps: [{ kind: "milestone", id: "vault" }], label }])).toEqual([expect.stringContaining("secret")]);
    expect(errors([{ id: "h", steps: [{ kind: "check", id: "hide" }], label }])).toEqual([expect.stringContaining("not narrated public")]);
    expect(errors([{ id: "l", steps: [{ kind: "transition", to: "liv_3" }], label }])).toEqual([expect.stringContaining("living")]);
    expect(errors([{ id: "q", steps: [{ kind: "quest", id: "q1", to: "hidden" }], label }])).toEqual([expect.stringContaining("hidden is not seen")]);
    expect(errors([{ id: "o", steps: [{ kind: "check", id: "a", to: "great" }], label }])).toEqual([expect.stringContaining("outcome")]);
    expect(errors([{ id: "s", steps: [1, 2, 3, 4].map(() => ({ kind: "milestone" })), label }])).toEqual([expect.stringContaining("1 to 3 steps")]);
    expect(errors([{ id: "v", steps: [{ kind: "quest", where: { giver: "?a", id: "?b" } }, { kind: "quest", where: { giver: "?c" } }], label }])).toEqual([expect.stringContaining("at most 2")]);
    expect(errors([{ id: "u", steps: [{ kind: "quest" }, { kind: "quest", where: { giver: "?late" } }], unless: [{ kind: "quest", where: { giver: "?late" }, between: [1, 2] }], label }]))
      .toEqual([expect.stringContaining("not bound")]);
    expect(errors([{ id: "w", steps: [{ kind: "milestone" }], within: 201, label }])).toEqual([expect.stringContaining("1 to 200")]);
    expect(errors([{ id: "t", steps: [{ kind: "milestone" }], label: { text: "x".repeat(241) }, hint: "h" }])).toEqual([expect.stringContaining("240")]);
    expect(errors([{ id: "n", steps: [{ kind: "milestone" }] }])).toEqual([expect.stringContaining("label, a hint or a pending")]);
    expect(errors([{ id: "k", steps: [{ kind: "milestone", where: { giver: "mara" } }], label }])).toEqual([expect.stringContaining("unknown key")]);
  });

  it("a story whose only game-layer field is patterns loads and matches", () => {
    const only = parseStoryOrThrow({
      id: "only", title: "Only", description: "", qualities: [{ key: "go", type: "bool", source: "extractor", rubric: "go?" }],
      checkpoints: RAW.checkpoints.map(({ checks: _checks, ...rest }) => rest), transitions: RAW.transitions, roster: RAW.roster,
      patterns: [{ id: "back", steps: [{ kind: "transition", to: "gate" }, { kind: "transition", to: "start" }], label: { text: "Out and back again." } }],
    });
    expect(only.patterns?.map((pattern) => pattern.id)).toEqual(["back"]);
    const reached = (to: string, from: string, boundary: number): EffectRef => ({ ...at, kind: "transition", id: `${from}->${to}#0`, from, to, boundary });
    expect(cursors(play(only, [[1, [reached("gate", "start", 1)]], [2, [reached("start", "gate", 2)]]]))).toEqual(["start->gate#0@1.0 gate->start#0@2.0"]);
  });
});

const seeded = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
};

const IDS = ["a", "b", "c", "x"];
const randomTurns = (seed: number, boundaries: number, perBoundary: number): Turns => {
  const next = seeded(seed);
  return Array.from({ length: boundaries }, (_, index) => {
    const boundary = index + 1;
    const count = Math.floor(next() * (perBoundary + 1));
    return [boundary, Array.from({ length: count }, () => (next() < 0.7 ? chk(IDS[Math.floor(next() * IDS.length)], boundary, next() < 0.5 ? "success" : "failure")
      : quest(["q1", "q2", "q3"][Math.floor(next() * 3)], boundary)))];
  });
};

const MIX: StoryPattern[] = [
  ABC({ unless: [{ kind: "check", id: "x", between: [1, 3] }], within: 6 }),
  { id: "fail-pass", steps: [{ kind: "check", where: { id: "?c", outcome: "failure" } }, { kind: "check", where: { id: "?c", outcome: "success" } }], repeat: "each", label: { text: "Tried again." }, pending: "One more try." },
  { id: "patron", steps: [{ kind: "quest", where: { giver: "?who" } }, { kind: "quest", where: { giver: "?who" } }], repeat: "each", within: 20, label: { text: "Two favours." } },
];

const fold = (story: NormalizedStory, turns: Turns) => {
  let branches: ReturnType<typeof currentBranches> = [];
  const blocked = new Set<string>();
  const completed: string[] = [];
  turns.forEach(([boundary, refs]) => {
    const result = runBoundary(story, branches, blocked, boundary, toMatchRefs(story, refs));
    result.tombstones.forEach((tombstone) => blocked.add(tombstone.patternId));
    completed.push(...result.completions.map((completion) => completion.occurrence));
    branches = result.branches;
  });
  return { branches: branches.map(branchKey).sort(), completed };
};

const persisted = (state: PatternsState) => sanitizeState(JSON.parse(JSON.stringify(state))) as PatternsState;

describe("v2.9 05 A/B: incremental matcher ≡ fold over refs (property)", () => {
  const story = storyWith(MIX);
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i, with persistence and a moving floor", (seed) => {
    const turns = randomTurns(seed, 60, 4);
    let state = createPatterns();
    turns.forEach(([boundary, refs]) => {
      state = persisted(foldFloor(applyBoundary(story, state, { boundary, messageId: boundary * 2 }, refs), boundary - 7));
    });
    const expected = fold(story, turns);
    expect(currentBranches(state).map(branchKey).sort()).toEqual(expected.branches);
    expect(state.completed.map((completion) => completion.occurrence)).toEqual(expected.completed);
  });

  it("more than 600 refs within 200 boundaries", () => {
    const turns = randomTurns(99, 200, 8);
    expect(turns.reduce((sum, [, refs]) => sum + refs.length, 0)).toBeGreaterThan(600);
    const state = turns.reduce((acc, [boundary, refs]) => foldFloor(applyBoundary(story, acc, { boundary, messageId: boundary * 2 }, refs), boundary - 200), createPatterns());
    const expected = fold(story, turns);
    expect(currentBranches(state).map(branchKey).sort()).toEqual(expected.branches);
    expect(state.completed.slice(-200).map((completion) => completion.occurrence)).toEqual(expected.completed.slice(-200));
  });
});

describe("v2.9 05 B: rollback ≡ replay to every retained boundary", () => {
  const story = storyWith(MIX);
  const view = (state: PatternsState) => ({ branches: currentBranches(state).map(branchKey).sort(), completed: state.completed.map((entry) => entry.occurrence), tombstones: state.tombstones });

  it("every cut above the floor equals playing only up to it", () => {
    const turns = randomTurns(7, 80, 4);
    const floor = 30;
    const full = turns.reduce((acc, [boundary, refs]) => foldFloor(applyBoundary(story, acc, { boundary, messageId: boundary * 2 }, refs), Math.min(floor, boundary - 1)), createPatterns());
    for (let cut = floor; cut <= 80; cut += 1) {
      const replay = turns.filter(([boundary]) => boundary <= cut)
        .reduce((acc, [boundary, refs]) => foldFloor(applyBoundary(story, acc, { boundary, messageId: boundary * 2 }, refs), Math.min(floor, boundary - 1)), createPatterns());
      expect(view(rollbackPatterns(full, cut) as PatternsState)).toEqual(view(replay));
    }
  });

  it("a cut below the floor is recorded as a gap, never claimed equal", () => {
    const turns = randomTurns(3, 40, 3);
    const full = turns.reduce((acc, [boundary, refs]) => foldFloor(applyBoundary(story, acc, { boundary, messageId: boundary * 2 }, refs), 20), createPatterns());
    expect(rollbackPatterns(full, 10)?.gaps).toContainEqual({ from: 11, to: 20, reason: "history" });
  });

  it("re-running a boundary after a rollback replaces it, never doubles it", () => {
    const state = play(storyWith([ABC({ repeat: "each" })]), turnsOf([chk("a", 0)], [chk("b", 0)], [chk("c", 0)]));
    const again = applyBoundary(storyWith([ABC({ repeat: "each" })]), rollbackPatterns(state, 2) as PatternsState, { boundary: 3, messageId: 6 }, [chk("c", 3)]);
    expect(cursors(again)).toEqual(["a@1.0 b@2.0 c@3.0"]);
  });
});

describe("v2.9 05 B: once survives eviction, edits and removal", () => {
  it("a once pattern evicted from the 200 completions still never completes again", () => {
    const story = storyWith([{ id: "first", steps: [{ kind: "check", id: "a" }], label: { text: "First." } }, { id: "many", steps: [{ kind: "check", id: "b" }], repeat: "each", label: { text: "Again." } }]);
    let state = play(story, [[1, [chk("a", 1)]]]);
    for (let boundary = 2; boundary <= 230; boundary += 1) state = applyBoundary(story, state, { boundary, messageId: boundary }, [chk("b", boundary)]);
    expect(state.completed.some((completion) => completion.patternId === "first")).toBe(false);
    state = applyBoundary(story, state, { boundary: 231, messageId: 231 }, [chk("a", 231)]);
    expect(state.completed.filter((completion) => completion.patternId === "first")).toEqual([]);
    expect(state.tombstones.filter((tombstone) => tombstone.patternId === "first")).toHaveLength(1);
  });

  it("an edited pattern drops its live branches and is marked partial; a removed one keeps its completions; re-added keeps its tombstone", () => {
    const two = [ABC(), { id: "ab", steps: [{ kind: "check" as const, id: "a" }, { kind: "check" as const, id: "b" }], label: { text: "Both." } }];
    const state = play(storyWith(two), turnsOf([chk("a", 0)], [chk("b", 0)]));
    expect(currentBranches(state).map((branch) => [branch.patternId, branch.next])).toEqual([["abc", 1], ["abc", 2]]);
    const edited = reconcilePatterns(state, storyWith([ABC({ within: 9 }), two[1]]));
    expect(currentBranches(edited)).toEqual([]);
    expect(edited.partial).toEqual(["abc"]);
    expect(reconcilePatterns(state, storyWith([two[1]])).completed.map((completion) => completion.patternId)).toEqual(["ab"]);
    const relabelled = reconcilePatterns(state, storyWith([ABC({ label: { text: "Renamed." } }), two[1]]));
    expect(relabelled).toBe(state);
    const readded = play(storyWith(two), turnsOf([chk("a", 0)], [chk("b", 0)]).map(([boundary, refs]) => [boundary + 2, refs.map((ref) => ({ ...ref, boundary: boundary + 2 }))]), state);
    expect(readded.completed.filter((completion) => completion.patternId === "ab")).toHaveLength(1);
    expect(patternRev(ABC())).toBe(patternRev(ABC({ label: { text: "other" }, hint: "h" })));
  });
});

describe("v2.9 05 C: public projection and the public filter", () => {
  const story = storyWith([
    { id: "fail-pass", steps: [{ kind: "check", where: { id: "?c", outcome: "failure" } }, { kind: "check", where: { id: "?c", outcome: "success" } }], repeat: "each",
      label: { text: "Tried the climb again." }, hint: "The cliff that won once has been climbed.", pending: "A second try is close." },
    { id: "tobin", steps: [{ kind: "check", id: "x" }], label: { text: "Tobin nods at last." } },
    { id: "lamp", steps: [{ kind: "check", id: "c" }], label: { text: "Find the lamp is done." } },
    { id: "secret", steps: [{ kind: "check", id: "b" }], label: { text: "The key opens the old vault." } },
  ]);
  const engine = (boundary: number) => ({ boundary, activeCheckpointId: "start", visitedPath: ["start"], blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState;
  const resting: PatternResting = { enabled: ["mara"], restates: (text) => /vault/.test(text) };
  const state = play(story, [[1, [chk("a", 1, "failure"), chk("x", 1), chk("c", 1), chk("b", 1)]], [2, []], [3, [chk("a", 3, "success")]]]);

  it("pending is the one-step-left branch; completed lasts the hint window; withheld text is omitted, never redacted", () => {
    const pendingOnly = play(story, [[1, [chk("a", 1, "failure")]]]);
    expect(patternProjection(story, pendingOnly, engine(1), resting)).toEqual([
      { patternId: "fail-pass", rev: patternRev(story.patterns![0]), phase: "pending", text: "A second try is close.", evidence: [{ kind: "check", id: "a", boundary: 1, index: 0, messageId: 2 }], boundary: 1 },
    ]);
    const shown = patternProjection(story, state, engine(3), resting);
    expect(shown.map((entry) => [entry.patternId, entry.phase])).toEqual([["fail-pass", "completed"]]);
    expect(shown[0].evidence.map((ref) => `${ref.id}@${ref.boundary}`)).toEqual(["a@1", "a@3"]);
    expect(patternProjection(story, state, engine(6), resting)).toEqual([]);
    expect(patternProjection(story, state, engine(3), { ...resting, enabled: ["mara", "tobin"] }).map((entry) => entry.patternId)).toEqual(["tobin", "fail-pass"]);
  });

  it("the callback line and the narrator hint pass the same filter, again at delivery", () => {
    expect(callbackLines(story, state, engine(3), resting).map((line) => line.text)).toEqual(["Tried the climb again."]);
    expect(callbackLines(story, state, engine(3), { enabled: ["mara", "tobin"], restates: () => false }).map((line) => line.text))
      .toEqual(["Tobin nods at last.", "The key opens the old vault.", "Tried the climb again."]);
    expect(hintLines(story, state, engine(3), resting)).toEqual(["The cliff that won once has been climbed."]);
    expect(hintLines(story, state, engine(3), { ...resting, restates: () => true })).toEqual([]);
    expect(hintLines(story, state, engine(6), resting)).toEqual([]);
  });

  it("a hidden quest title in a label is withheld", () => {
    expect(callbackLines(story, state, engine(3), resting).map((line) => line.text)).not.toContain("Find the lamp is done.");
  });

  it("same chat state gives a byte-identical projection", () => {
    expect(JSON.stringify(patternProjection(story, persisted(state), engine(3), resting))).toBe(JSON.stringify(patternProjection(story, state, engine(3), resting)));
  });
});

describe("v2.9 05 P5: matcher cost on the stress fixture", () => {
  it("16 patterns x 3 steps, 600 refs: p95 per boundary is measured and bounded", () => {
    const stress = storyWith(Array.from({ length: 16 }, (_, at): StoryPattern => ({
      id: `p${at}`, repeat: "each", within: 50, label: { text: `Pattern ${at}.` },
      steps: [{ kind: "check", where: { id: "?c" } }, { kind: "check", id: IDS[at % 4] }, { kind: "check", where: { id: "?c" } }],
    })));
    const turns = randomTurns(5, 100, 18).map(([boundary, refs]): [number, EffectRef[]] => [boundary, refs.filter((ref) => ref.kind === "check")]);
    const times: number[] = [];
    let state = createPatterns();
    let refs = 0;
    turns.forEach(([boundary, list]) => {
      refs += list.length;
      const start = performance.now();
      state = foldFloor(applyBoundary(stress, state, { boundary, messageId: boundary }, list), boundary - 200);
      times.push(performance.now() - start);
    });
    const p95 = [...times].sort((left, right) => left - right)[Math.floor(times.length * 0.95)];
    if (process.env.SO_PATTERN_PERF) process.stdout.write(`P5 refs=${refs} branches=${currentBranches(state).length} p95=${p95.toFixed(3)}ms bytes=${JSON.stringify(state).length} added=${JSON.stringify(state.deltas.map((d) => d.added)).length} removed=${JSON.stringify(state.deltas.map((d) => d.removed)).length} killed=${JSON.stringify(state.deltas.map((d) => d.killed)).length} completed=${JSON.stringify(state.completed).length}\n`);
    expect(refs).toBeGreaterThanOrEqual(500);
    expect(p95).toBeLessThan(50);
  });
});
