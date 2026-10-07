import { diffStories } from "./storyDiff";
import { parseStoryV2OrThrow } from "./validate";
import { questClosedKey, questRewardKey, type EngineState } from "./index";

const story = (quests: unknown[]) => parseStoryV2OrThrow({
  format: 2, id: "quest-diff", version: 1, title: "Quest diff", description: "Synthetic.",
  qualities: [{ key: "paid", type: "bool", source: "extractor", rubric: "Was the debt paid?" }, { key: "coins", type: "int", source: "code", rubric: "Coins." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  roster: [],
  quests,
});

const debt = (reward: Record<string, unknown> = { set: { coins: { add: 3 } } }) => ({
  id: "debt", title: "The debt", kind: "side", steps: [], done_when: { all: [{ q: "paid", op: "==", v: true }] }, reward,
});

const state = (values: Record<string, unknown>): EngineState => ({
  boundary: 3, activeCheckpointId: "start", checkpointStartedBoundary: 0, checkpointStartedMessageId: -1, lastMessageId: 4,
  blackboard: { values, versions: {}, latched: {} }, visitedPath: ["start"],
} as unknown as EngineState);

const codes = (result: ReturnType<typeof diffStories>) => result.entries.map((entry) => `${entry.kind}:${entry.code}`);

describe("story updates and quests", () => {
  test("a changed reward after it was earned is kept and says so", () => {
    const result = diffStories(story([debt()]), story([debt({ set: { coins: { add: 9 } } })]), state({ paid: true, [questClosedKey("debt")]: "done", [questRewardKey("debt")]: true }));
    expect(codes(result)).toContain("compatible:quest-reward-changed-earned");
  });

  test("a changed reward not yet earned is an ordinary compatible edit", () => {
    const result = diffStories(story([debt()]), story([debt({ set: { coins: { add: 9 } } })]), state({}));
    expect(codes(result)).not.toContain("compatible:quest-reward-changed-earned");
    expect(result.classification).toBe("compatible");
  });

  test("removing an active quest is compatible", () => {
    const result = diffStories(story([debt()]), story([]), state({ paid: false }));
    expect(codes(result)).toContain("compatible:quest-removed");
    expect(result.classification).toBe("compatible");
  });

  test("removing a quest this chat closed asks first", () => {
    const result = diffStories(story([debt()]), story([]), state({ paid: true, [questClosedKey("debt")]: "done", [questRewardKey("debt")]: true }));
    expect(codes(result)).toContain("invalidating:quest-removed-closed");
    expect(result.classification).toBe("invalidating");
  });
});
