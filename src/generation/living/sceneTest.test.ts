import { readFileSync } from "fs";
import { join } from "path";
import { unitDraw } from "@engine/chance";
import { parseStoryV2, parseStoryV2OrThrow, TENSION_LEVELS, type NormalizedStoryV2 } from "@engine/index";
import { parseDirectorDraft } from "./parse";
import { buildDirectorOps, checkDirectorOps, planChapter } from "./plan";
import {
  drawSceneOutcome, planSceneTest, sceneAnswerIssues, sceneChaos, sceneDrawParts, sceneProbability, sceneSignal, sceneSignalLine, spacedOutcome,
  SCENE_INTERRUPT_SHARE, type SceneOutcome, type SceneTestRecord,
} from "./sceneTest";

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures", `${name}.story.json`), "utf8"));
const withScene = (raw: Record<string, unknown>, scene: unknown = { chaos: { from: "tension" } }) => ({ ...raw, living: { ...(raw.living as object), scene_test: scene } });
const ids = { chatId: "chat-1", storyId: "lantern-coast-living" };
const arcs = (texts: string[]) => texts.map((text) => ({ kind: "arc" as const, text }));

const record = (patch: Partial<SceneTestRecord> = {}): SceneTestRecord => ({
  frontierId: "liv_1", plannedAt: 3, messageId: 5, chaos: 2, p: 3 / 7, unit: 0.1, drawn: "interrupt", applied: "interrupt", focus: "the dark lanterns",
  expected: { from: "The Cold Quay", thread: "the dark lanterns" }, ...patch,
});


describe("v2.8 48 scene test format", () => {
  it("accepts { chaos: { from: tension }, min_gap } and keeps it", () => {
    const story = parseStoryV2OrThrow(withScene(fixture("living-premise"), { chaos: { from: "tension" }, min_gap: 3 }));
    expect(story.living?.scene_test).toEqual({ chaos: { from: "tension" }, min_gap: 3 });
  });

  it.each([
    [{ chaos: 3 }, "living.scene_test.chaos"],
    [{ chaos: { from: "quality" } }, "living.scene_test.chaos"],
    [{ chaos: { from: "tension" }, min_gap: 9 }, "living.scene_test.min_gap"],
    [{ chaos: { from: "tension" }, min_gaps: 1 }, "living.scene_test.min_gaps"],
    [{ chaos: { from: "tension", max: 4 } }, "living.scene_test.chaos.max"],
    ["on", "living.scene_test"],
  ])("refuses %j", (scene, path) => {
    const result = parseStoryV2(withScene(fixture("living-premise"), scene));
    expect(Array.isArray(result) && result.some((error) => error.path === path)).toBe(true);
  });

  it("offers a did-you-mean for a misspelt key", () => {
    const result = parseStoryV2(withScene(fixture("living-premise"), { chaos: { from: "tension" }, min_gaps: 1 }));
    expect(Array.isArray(result) && result.find((error) => error.path === "living.scene_test.min_gaps")?.message).toContain('did you mean "min_gap"');
  });
});

describe("v2.8 48 S2 draw calibration", () => {
  it("unexpected rate within ±0.02 of p and interrupt share within ±0.02 of 0.4, 10,000 keys per chaos step", () => {
    const rows = TENSION_LEVELS.map((level) => {
      const chaos = sceneChaos(level);
      const p = sceneProbability(chaos);
      const outcomes: SceneOutcome[] = Array.from({ length: 10_000 }, (_, index) => {
        const parts = (tag: string) => sceneDrawParts({ chatId: `chat-${index % 97}`, storyId: "s" }, `liv_${index}`, index % 50, tag);
        return drawSceneOutcome(p, unitDraw(parts("scene-test")), unitDraw(parts("scene-test:kind")));
      });
      const unexpected = outcomes.filter((outcome) => outcome !== "expected").length;
      const interrupts = outcomes.filter((outcome) => outcome === "interrupt").length;
      return { level, rateOff: Math.abs(unexpected / 10_000 - p) <= 0.02, shareOff: Math.abs(interrupts / unexpected - SCENE_INTERRUPT_SHARE) <= 0.02 };
    });
    expect(rows.filter((row) => !row.rateOff || !row.shareOff)).toEqual([]);
  });

  it("maps smoothed tension to chaos 0..4 and odds (chaos+1)/7", () => {
    expect(TENSION_LEVELS.map(sceneChaos)).toEqual([0, 1, 2, 3, 4]);
    expect(sceneChaos(null)).toBe(0);
    expect(sceneProbability(4)).toBeCloseTo(5 / 7);
  });
});

describe("v2.8 48 S12 spacing", () => {
  it("no two applied interrupts within min_gap frontiers over 1,000 sequences; drawn vs applied recorded", () => {
    const violations: string[] = [];
    let downgraded = 0;
    for (let sequence = 0; sequence < 1000; sequence += 1) {
      const gap = sequence % 6;
      const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const }, min_gap: gap } } };
      const prior: SceneTestRecord[] = [];
      for (let index = 0; index < 12; index += 1) {
        const made = planSceneTest({
          story, ids: { chatId: `c${sequence}`, storyId: "s" }, frontierId: `liv_${index + 1}`, frontierName: `F${index}`, plannedAt: index * 3, messageId: index * 3,
          tension: "peak", candidates: arcs(["thread a"]), prior,
        });
        if (!made) throw new Error("no record");
        if (made.drawn !== made.applied) downgraded += 1;
        prior.push(made);
      }
      const at = prior.map((entry, index) => (entry.applied === "interrupt" ? index : -1)).filter((index) => index >= 0);
      at.slice(1).forEach((index, position) => { if (index - at[position] <= gap) violations.push(`${sequence}:${at[position]}-${index}`); });
    }
    expect(violations).toEqual([]);
    expect(downgraded).toBeGreaterThan(0);
  });

  it("min_gap 0 never downgrades", () => {
    expect(spacedOutcome("interrupt", [record()], 0)).toBe("interrupt");
    expect(spacedOutcome("interrupt", [record()], 1)).toBe("altered");
  });

  it("an interrupt with no safe open thread applies as altered", () => {
    const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const }, min_gap: 0 } } };
    const made = Array.from({ length: 200 }, (_, index) => planSceneTest({
      story, ids, frontierId: `liv_${index + 1}`, frontierName: "F", plannedAt: index, messageId: index, tension: "peak", candidates: [], prior: [],
    }));
    expect(made.some((entry) => entry?.drawn === "interrupt")).toBe(true);
    expect(made.filter((entry) => entry?.applied === "interrupt")).toEqual([]);
  });

  it("never draws on the opening, or without scene_test", () => {
    const story = { living: { premise: "p", scene_test: { chaos: { from: "tension" as const } } } };
    const base = { ids, frontierName: "F", plannedAt: 1, messageId: 1, tension: "peak" as const, candidates: [], prior: [] };
    expect(planSceneTest({ ...base, story, frontierId: "liv_open" })).toBeNull();
    expect(planSceneTest({ ...base, story: { living: { premise: "p" } }, frontierId: "liv_1" })).toBeNull();
  });
});

describe("v2.8 48 signal and S13 one change", () => {
  const story = parseStoryV2OrThrow(fixture("living-premise")) as NormalizedStoryV2;
  const raw = fixture("living-premise");
  const reply = (patch: Record<string, unknown>) => JSON.stringify({
    name: "The Cold Quay", objective: "A lantern on the quay goes dark while the harbourmaster watches.", tension: "stirring", snapshot: {},
    opens_when: { new: { key: "quay_seen", rubric: "Has the dark quay been seen?" } }, new_qualities: [], builds_on: null, new_chapter: false, final: false, reason: "r", ...patch,
  });
  const check = (signal: ReturnType<typeof sceneSignal>, patch: Record<string, unknown>) => {
    const parsed = parseDirectorDraft(reply(patch), story);
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    const built = buildDirectorOps(story, "liv_open", parsed.draft, planChapter(story, "liv_open", { sealsOn: true, final: false, newChapter: false }));
    const answer = { changed: parsed.draft.changed, advances: parsed.draft.advances };
    return checkDirectorOps({ raw, story, frontierId: "liv_open", ops: built.ops, values: {}, latched: {}, scene: { signal, answer, threads: ["the dark lanterns"] } }).issues;
  };
  const altered = sceneSignal(record({ applied: "altered", focus: undefined }));
  const interrupt = sceneSignal(record());

  it("refuses an altered draft naming no change or two, and a bad change", () => {
    expect(check(altered, {})).toEqual([expect.stringContaining("exactly one change")]);
    expect(check(altered, { changed: ["place", "cast"] })).toEqual([expect.stringContaining("named 2")]);
    expect(check(altered, { changed: "weather" })).toEqual([expect.stringContaining("must be one of")]);
    expect(check(altered, { changed: "place" })).toEqual([]);
  });

  it("refuses an interrupt naming no existing thread", () => {
    expect(check(interrupt, {})).toEqual([expect.stringContaining("advances")]);
    expect(check(interrupt, { advances: "a brand new detour" })).toEqual([expect.stringContaining("existing open thread")]);
    expect(check(interrupt, { advances: "The Dark Lanterns" })).toEqual([]);
  });

  it("expected or absent checks nothing", () => {
    expect(check(undefined, { changed: ["place", "cast"] })).toEqual([]);
    expect(sceneSignal(record({ applied: "expected" }))).toBeUndefined();
    expect(sceneAnswerIssues(undefined, {}, [])).toEqual([]);
  });

  it("states the destination, the thread, the change list and world pressure", () => {
    expect(altered && sceneSignalLine(altered)).toContain('continues the thread "the dark lanterns" on from "The Cold Quay"');
    expect(altered && sceneSignalLine(altered)).toContain('"changed": "place|cast|timing|obstacle"');
    expect(interrupt && sceneSignalLine(interrupt)).toContain('advances the open thread "the dark lanterns"');
    expect(interrupt && sceneSignalLine(interrupt)).toContain("World pressure only");
  });
});
