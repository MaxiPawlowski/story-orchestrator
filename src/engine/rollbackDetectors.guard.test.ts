import { parseStoryV2OrThrow } from "./validate";
import { ROLLBACK_DETECTORS, ROLLBACK_EXEMPT, rollbackMoved, uncoveredCodeKeys } from "./rollbackDetectors";
import { StoryEngine } from "./engine";
import { codexFactKey, type NormalizedStoryV2, type Quality } from "./schema";
import { labRaw } from "../../test/support/codexLab";

const is = (key: string) => ({ q: key, op: "==", v: true });

const everyCompiler = (): Record<string, unknown> => {
  const raw = labRaw();
  return {
    ...raw,
    clock: { times: ["morning", "evening", "night"] },
    roster: [
      { id: "tom", name: "Tom", mood: { baseline: "calm", values: ["calm", "angry"] }, relationships: [{ toward: "player", axes: ["trust"] }],
        agenda: [{ id: "plan", goal: "Leave", pace: "per_n_boundaries", every: 2, steps: [{ text: "packs" }, { text: "waits", repeat: true }] }] },
      { id: "ada", name: "Ada" },
    ],
    living: { premise: "A river town.", authored_until: "end" },
    checkpoints: (raw.checkpoints as Array<Record<string, unknown>>).map((checkpoint) => (checkpoint.id === "river" ? { ...checkpoint, stretch: { mode: "open", arrive_when: is("saw_mill") } } : checkpoint)),
  };
};

const authoredKeys = (raw: Record<string, unknown>): Set<string> => new Set((raw.qualities as Quality[]).map((quality) => quality.key));

describe("SC1: every compiled code key has a rollback check", () => {
  test("a story using every compiler leaves no compiled code key uncovered", () => {
    const raw = everyCompiler();
    const story = parseStoryV2OrThrow(raw);
    const compiled = story.qualities.filter((quality) => quality.source === "code" && !authoredKeys(raw).has(quality.key)).map((quality) => quality.key);
    expect(compiled.length).toBeGreaterThan(20);
    expect(compiled.some((key) => key.startsWith("codex_"))).toBe(true);
    expect(compiled.some((key) => key.startsWith("quest_"))).toBe(true);
    expect(compiled.some((key) => key.startsWith("agenda_"))).toBe(true);
    expect(uncoveredCodeKeys(story, authoredKeys(raw))).toEqual([]);
  });

  test("planted control: a compiled prefix with no detector is caught", () => {
    const raw = everyCompiler();
    const story = parseStoryV2OrThrow(raw);
    const planted: Quality = { key: "zz_new_writer_latch", type: "int", source: "code", rubric: "A new writer nobody registered." };
    const withPlant: NormalizedStoryV2 = { ...story, qualities: [...story.qualities, planted], qualityByKey: { ...story.qualityByKey, [planted.key]: planted } };
    expect(uncoveredCodeKeys(withPlant, authoredKeys(raw))).toEqual(["zz_new_writer_latch"]);
  });

  test("each detector and exemption names a reason or a check, and ids are unique", () => {
    const ids = [...ROLLBACK_DETECTORS, ...ROLLBACK_EXEMPT].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROLLBACK_EXEMPT.forEach((entry) => expect(entry.reason.length).toBeGreaterThan(20));
  });

  test("code-only boundary: a swiped boundary whose only change is a codex latch still rolls back", () => {
    const story = parseStoryV2OrThrow(labRaw());
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "searched_dock", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    const before = engine.stateLog.at(-1)!;
    expect(before.fired).toBeNull();
    expect(before.queue.applied.every((entry) => !entry.turnRange)).toBe(true);
    expect(rollbackMoved(story, before.before.blackboard.values, before.after.blackboard.values)).toBe(true);
    expect(engine.shouldRollbackFromMessage(2)).toBe(true);
    const restored = engine.rollbackTo(engine.boundaryBeforeMessage(2) ?? 0);
    expect(restored).toEqual({ ok: true, result: "applied" });
    expect(engine.serialize().blackboard.values[codexFactKey("places", "boathouse", "door")]).toBeUndefined();
  });

  test("control: a boundary with no derived write and no read window does not ask for a rollback", () => {
    const story = parseStoryV2OrThrow({ ...labRaw(), codex: { places: [{ id: "far", name: "Far", facts: [{ id: "f", text: "x", known_when: is("lost") }] }] } });
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "searched_dock", v: true, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
    expect(engine.shouldRollbackFromMessage(2)).toBe(false);
  });
});
