import { StoryEngine } from "./engine";
import { parseStoryOrThrow } from "./validate";
import type { PrimitiveValue } from "./schema";

const KEYS = ["asked", "taken", "freed", "bargained", "fled", "refused", "violent", "witnessed"];
const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key} is true.` });
const is = (key: string) => ({ q: key, op: "==", v: true });

const QUESTS = [
  {
    id: "rescue", title: "Rescue", kind: "side", offered_when: is("asked"), visible_when: is("taken"), steps: [],
    resolutions: [
      { id: "freed", label: "Freed", when: is("freed"), consequences: [
        { id: "thanks", set: { coins: { add: 5 }, renown: { add: 2 } } },
        { id: "blood", when: is("violent"), set: { mood: "uneasy" } },
      ] },
      { id: "ransomed", label: "Ransomed", when: is("bargained"), consequences: [{ id: "poorer", set: { coins: { add: -3 } } }] },
      { id: "abandoned", label: "Left", when: is("fled"), consequences: [{ id: "shame", set: { mood: "angry" } }] },
      { id: "declined", label: "Declined", from: ["offered"], when: is("refused") },
    ],
    precedence: ["abandoned", "freed", "ransomed", "declined"],
  },
  {
    id: "rumour", title: "Rumour", kind: "side", steps: [], requires: [{ quest: "rescue", resolution: ["freed", "ransomed"] }],
    done_when: is("witnessed"), failed_when: is("fled"), reward: { set: { renown: { add: 1 }, mood: "calm" } },
  },
  {
    id: "toll", title: "Toll", kind: "side", steps: [], hold_when_ambiguous: true,
    resolutions: [
      { id: "paid", label: "Paid", when: is("bargained"), consequences: [{ id: "fee", set: { coins: { add: -1 }, renown: { add: 1 } } }] },
      { id: "dodged", label: "Dodged", when: is("fled"), consequences: [{ id: "chased", when: is("violent"), set: { mood: "angry" } }] },
    ],
    precedence: ["dodged", "paid"],
  },
];

const shuffled = <T,>(items: readonly T[], random: () => number): T[] => {
  const copy = [...items];
  for (let at = copy.length - 1; at > 0; at -= 1) {
    const other = Math.floor(random() * (at + 1));
    [copy[at], copy[other]] = [copy[other], copy[at]];
  }
  return copy;
};

const lcg = (seed: number) => {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
};

const storyOf = (quests: unknown[]) => parseStoryOrThrow({
  title: "Property lab", description: "Synthetic quests with endings.",
  roster: [],
  qualities: [...KEYS.map(bool), { key: "coins", type: "int", source: "code", rubric: "Coins." }, { key: "renown", type: "int", source: "code", rubric: "Renown." },
    { key: "mood", type: "enum", values: ["calm", "uneasy", "angry"], source: "code", rubric: "Mood." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  quests,
});

const turnsFor = (random: () => number, count: number) => Array.from({ length: count }, () =>
  Object.fromEntries(KEYS.filter(() => random() < 0.25).map((key) => [key, random() < 0.75])) as Record<string, PrimitiveValue>);

const run = (story: ReturnType<typeof storyOf>, turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((turn, index) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(turn).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: (index + 1) * 2, chatLength: (index + 1) * 2 + 1 });
  });
  return engine;
};

const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7919 + 13);

describe("48 D floors: quest resolutions are order-free and roll back like a replay", () => {
  const base = storyOf(QUESTS);

  test("shuffling the quest array and each quest's resolutions changes no boundary log (200 seeds)", () => {
    for (const seed of SEEDS) {
      const random = lcg(seed);
      const turns = turnsFor(random, 30);
      const mixed = shuffled(QUESTS, random).map((quest) => ("resolutions" in quest && quest.resolutions ? { ...quest, resolutions: shuffled(quest.resolutions, random) } : quest));
      const left = run(base, turns).stateLog.map((entry) => entry.after.blackboard.values);
      const right = run(storyOf(mixed), turns).stateLog.map((entry) => entry.after.blackboard.values);
      expect(right).toEqual(left);
    }
  });

  test("rolling back to a random boundary equals replaying to it (200 seeds)", () => {
    for (const seed of SEEDS) {
      const random = lcg(seed);
      const turns = turnsFor(random, 40);
      const full = run(base, turns);
      const cut = 1 + Math.floor(random() * (turns.length - 1));
      const reopened = new StoryEngine({ now: () => 0 });
      reopened.loadStory(base);
      reopened.hydrate(full.serialize(), full.serializeHistory());
      reopened.rollbackTo(cut);
      expect(reopened.serialize().blackboard.values).toEqual(run(base, turns.slice(0, cut)).serialize().blackboard.values);
    }
  });
});
