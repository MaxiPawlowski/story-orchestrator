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

  test("five active quests never starve a hidden quest's discovery key", () => {
    const raw = withQuests();
    raw.qualities = [...raw.qualities, { key: "met_smuggler", type: "bool", source: "extractor", rubric: "Met the smuggler." }];
    raw.quests = [...raw.quests!.slice(0, 5), { ...raw.quests![5], visible_when: { q: "met_smuggler", op: "==", v: true } }];
    const story = parseStoryV2OrThrow(raw);
    const reads = Array.from({ length: 20 }, (_, rotation) => deriveScopeExplained(story, "a", empty, [], { rotation }).map((entry) => entry.key));
    expect(reads.filter((keys) => keys.includes("met_smuggler")).length).toBeGreaterThan(0);
    reads.forEach((keys) => expect(keys.filter((key) => /^k\d$|^met_smuggler$/.test(key)).length).toBeLessThanOrEqual(QUEST_SCOPE_CAP));
    const seen = new Set(reads.flat());
    ["k0", "k1", "k2", "k3", "k4"].forEach((key) => expect(seen.has(key)).toBe(true));
  });

  test("a closed quest frees its slot for the next one", () => {
    const story = parseStoryV2OrThrow(withQuests());
    const closed = { ...empty, values: { [questClosedKey("q0")]: "done" } };
    expect(QUEST_SOURCE.keys(story, closed, {})).toEqual(["k1", "k2", "k3", "k4", "k5"]);
    expect(scopeOverflow(story, "a", closed)).toEqual([]);
  });
});
