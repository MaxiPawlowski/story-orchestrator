import { parseStoryV2OrThrow, questClosedKey, type StoryV2 } from "@engine/index";
import { deriveScopeExplained, scopeOverflow } from "./scope";
import { CARD_SOURCE, QUEST_SCOPE_CAP, QUEST_SOURCE } from "./scopeSources";

const empty = { values: {}, versions: {}, latched: {} };

const base = (): StoryV2 => ({
  format: 2, title: "Scope", description: "Synthetic.", roster: [],
  qualities: [{ key: "gate", type: "bool", source: "extractor", rubric: "Gate." }, ...Array.from({ length: 6 }, (_, index) => ({ key: `k${index}`, type: "bool" as const, source: "extractor" as const, rubric: `Key ${index}.` }))],
  checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "Go." }, { id: "b", name: "B", type: "anchor", objective: "Stop." }],
  transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "gate", op: "==", v: true } }],
} as StoryV2);

const withQuests = (): StoryV2 => ({
  ...base(),
  quests: Array.from({ length: 6 }, (_, index) => ({ id: `q${index}`, title: `Quest ${index}`, kind: "side" as const, steps: [], done_when: { q: `k${index}`, op: "==" as const, v: true } })),
});

describe("quest scope sources", () => {
  test("a story without quests reads exactly what it read before quests existed", () => {
    const story = parseStoryV2OrThrow(base());
    expect(deriveScopeExplained(story, "a", empty)).toEqual(deriveScopeExplained(story, "a", empty, [], {}, [CARD_SOURCE]));
  });

  test("quest keys join the read up to the cap, and the rest is named as overflow", () => {
    const story = parseStoryV2OrThrow(withQuests());
    const keys = deriveScopeExplained(story, "a", empty).map((entry) => entry.key);
    expect(keys.filter((key) => key.startsWith("k"))).toHaveLength(QUEST_SCOPE_CAP);
    expect(scopeOverflow(story, "a", empty)).toEqual([{ kind: "quest", dropped: ["k5"] }]);
  });

  test("a closed quest frees its slot for the next one", () => {
    const story = parseStoryV2OrThrow(withQuests());
    const closed = { ...empty, values: { [questClosedKey("q0")]: "done" } };
    expect(QUEST_SOURCE.keys(story, closed, {})).toEqual(["k1", "k2", "k3", "k4", "k5"]);
    expect(scopeOverflow(story, "a", closed)).toEqual([]);
  });
});
