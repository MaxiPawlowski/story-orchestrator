import { parseStoryOrThrow, type BoundaryResult, type EngineState, type NormalizedStory, type StoryEngine } from "@engine/index";
import { composeLines, currentSection } from "./consequences";
import { createNarratorSheetPort, PATTERN_HINT_HEADER } from "./narratorSheetPort";
import { currentBranches } from "./patterns";
import {
  createPatternsPort, loadPatternsKit, patternCallbacks, patternHints, patternProjection, patternResting, patternsUnavailable, rollbackPatterns, sanitizePatterns, type PatternsState,
} from "./patternsPort";
import type { EffectRef, RecapOutcome } from "./recapPort";
import { PATTERNS_UNAVAILABLE_CHECK } from "./checksGame";
import type { LoadedStory, RuntimeExtras, RuntimeSnapshot } from "./types";

const story: NormalizedStory = parseStoryOrThrow({
  id: "port", title: "Port", description: "",
  qualities: [{ key: "climb_ok", type: "bool", source: "code", rubric: "?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, checks: [{ id: "climb", label: "Climb", quality: "climb_ok", roll: { sides: 20, target: 10 }, narrate: "public" }] }],
  transitions: [],
  roster: [{ id: "nar", name: "Narrator", view: "omniscient" }],
  patterns: [{
    id: "second-try", steps: [{ kind: "check", id: "climb", to: "failure" }, { kind: "check", id: "climb", to: "success" }],
    label: { text: "The climb, won at the second try." }, hint: "Let the cliff feel conquered.", pending: "The cliff is still there.",
  }],
});

const ref = (to: string, boundary: number): EffectRef => ({ kind: "check", id: "climb", to, boundary, messageId: boundary * 2, chapterId: null, visible: true, authored: false, causes: [] });
const result = (boundary: number) => ({ boundary, context: { lastMessageId: boundary * 2 } }) as unknown as BoundaryResult;
const engineState = (boundary: number) => ({ boundary, activeCheckpointId: "start", visitedPath: ["start"], blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState;
const resting = patternResting(["nar"], (text) => text);

const harness = (floor = 0) => {
  const extras = { memory: { settings: { patterns: true } } } as unknown as RuntimeExtras;
  const calls = { persist: 0, refresh: 0 };
  let on = true;
  const port = createPatternsPort({
    engine: { historyFrom: () => ({ boundary: floor, messageId: 0 }) } as unknown as StoryEngine,
    loaded: () => ({ story } as unknown as LoadedStory), extras: () => extras, enabled: () => on,
    persist: async () => { calls.persist += 1; }, notify: () => undefined, refresh: () => { calls.refresh += 1; },
  });
  return { port, extras, calls, off: () => { on = false; } };
};

beforeAll(async () => { await loadPatternsKit(); });

describe("v2.9 05 B: runtime slice", () => {
  it("cold load: step 0 on the first boundary lands in the first delta, and the pattern completes later", () => {
    const { port, extras, calls } = harness();
    port.onBoundary(result(1), { derived: [ref("failure", 1)] });
    expect(extras.patterns?.deltas[0].added.map((branch) => branch.patternId)).toEqual(["second-try"]);
    port.onBoundary(result(2), { derived: [] });
    port.onBoundary(result(3), { derived: [ref("success", 3)] });
    expect(extras.patterns?.completed.map((completion) => completion.label)).toEqual(["The climb, won at the second try."]);
    expect(calls.refresh).toBe(1);
    expect(sanitizePatterns(JSON.parse(JSON.stringify(extras.patterns)))).toEqual(extras.patterns);
  });

  it("consumes the recap's own return: a missing kit or recap is a gap and a degrades check, never a second derivation", () => {
    const { port, extras } = harness();
    port.onBoundary(result(1), { unavailable: "kit" } as RecapOutcome);
    port.onBoundary(result(2), null);
    expect(extras.patterns?.gaps).toEqual([{ from: 1, to: 2, reason: "kit" }]);
    expect(patternsUnavailable(story, extras.patterns, engineState(2), true)).toBe(true);
    expect(patternsUnavailable(story, extras.patterns, engineState(9), true)).toBe(false);
    const finding = PATTERNS_UNAVAILABLE_CHECK.detect({ patternsUnavailable: true } as unknown as RuntimeSnapshot);
    expect(finding?.player).toBeTruthy();
    expect(PATTERNS_UNAVAILABLE_CHECK.detect({ patternsUnavailable: false } as unknown as RuntimeSnapshot)).toBeNull();
  });

  it("switched off records a gap and matches nothing", () => {
    const { port, extras, off } = harness();
    off();
    port.onBoundary(result(1), { derived: [ref("failure", 1)] });
    expect(extras.patterns?.deltas).toEqual([]);
    expect(extras.patterns?.gaps).toEqual([{ from: 1, to: 1, reason: "off" }]);
  });

  it("folds deltas into the base as the engine floor moves, and rollback keeps exactly the boundaries the engine kept", () => {
    const { port, extras } = harness(2);
    port.onBoundary(result(1), { derived: [ref("failure", 1)] });
    port.onBoundary(result(2), { derived: [ref("failure", 2)] });
    port.onBoundary(result(3), { derived: [ref("success", 3)] });
    const state = extras.patterns as PatternsState;
    expect(state.base.at).toEqual({ boundary: 3, index: 0 });
    expect(state.deltas.map((delta) => delta.boundary)).toEqual([3]);
    const back = rollbackPatterns(state, 2) as PatternsState;
    expect(back.completed).toEqual([]);
    expect(currentBranches(back).map((branch) => branch.refs.map((entry) => entry.boundary))).toEqual([[2]]);
  });
});

describe("v2.9 05 C: delivery", () => {
  const played = () => {
    const { port, extras } = harness();
    port.onBoundary(result(1), { derived: [ref("failure", 1)] });
    port.onBoundary(result(2), { derived: [ref("success", 2)] });
    return extras.patterns as PatternsState;
  };

  it("the callback joins What changed as an authored line, never a because", () => {
    const state = played();
    const callbacks = patternCallbacks(story, state, engineState(2), resting);
    const refs = [ref("failure", 1), ref("success", 2)];
    const section = currentSection({ story, state: engineState(2), recap: { refs }, chat: [], callbacks });
    expect(section?.lines[0]).toBe("The climb, won at the second try.");
    expect(section?.personal).toBe(true);
    expect(composeLines(story, engineState(2), refs, [], 5, callbacks).filter((line) => line.because)).toEqual([]);
    expect(currentSection({ story, state: engineState(2), recap: { refs }, chat: [], callbacks: [] })?.lines).not.toContain("The climb, won at the second try.");
  });

  it("the narrator hint rides the omniscient member's sheet for 3 boundaries, under its own header", () => {
    const state = played();
    let boundary = 2;
    const narrator = createNarratorSheetPort({
      story: () => story, state: () => engineState(boundary), log: () => [], chatId: () => "c", refresh: () => undefined,
      hints: () => patternHints(story, state, engineState(boundary), resting),
    });
    expect(narrator.lines("nar")).toEqual([PATTERN_HINT_HEADER, "- Let the cliff feel conquered."]);
    boundary = 4;
    expect(narrator.lines("nar")).toEqual([PATTERN_HINT_HEADER, "- Let the cliff feel conquered."]);
    boundary = 5;
    expect(narrator.lines("nar")).toEqual([]);
  });

  it("player surfaces are identical with and without a held secret the text does not restate, and withhold one that does", () => {
    const state = played();
    const plain = patternProjection(story, state, engineState(2), resting);
    const held = patternProjection(story, state, engineState(2), patternResting(["nar"], (text) => text.replace(/vault/g, "")));
    expect(held).toEqual(plain);
    const restates = patternResting(["nar"], (text) => (/climb/.test(text) ? "" : text));
    expect(patternProjection(story, state, engineState(2), restates)).toEqual([]);
    expect(patternCallbacks(story, state, engineState(2), restates)).toEqual([]);
  });
});
