import { narratesPlayer } from "@generation/living/guard";
import { parseStory } from "@engine/index";
import { livingInputs, type LivingInputSources } from "./livingInputs";

const sources = (hooks: string[], hidden: string[] = []): LivingInputSources => ({
  memory: {
    injector: { restingFilter: () => (text: string) => (hidden.some((word) => text.includes(word)) ? "" : text) },
    canon: { getCanon: () => "" },
    getOpenArcs: () => ["The baron's census"],
    getArcs: () => [],
  },
  state: () => null,
  refused: () => null,
  playerName: () => "Rin",
  promiseHooks: () => hooks,
});

describe("plan 47 director inputs: promise hooks keep the resting filter (P4d)", () => {
  it("adds a public promise hook to the open threads", () => {
    expect(livingInputs(sources(['Mara was promised: "I\'ll find him"'])).openThreads).toEqual(["The baron's census", 'Mara was promised: "I\'ll find him"']);
  });

  it("drops a hook the resting filter withholds", () => {
    expect(livingInputs(sources(['Mara was promised: "the smuggler\'s debt"'], ["smuggler"])).openThreads).toEqual(["The baron's census"]);
  });

  it("works without the source", () => {
    const { promiseHooks: _hooks, ...rest } = sources([]);
    expect(livingInputs(rest).openThreads).toEqual(["The baron's census"]);
  });
});

describe("plan 47 director guard: keeping, breaking or releasing is the player's act", () => {
  it.each(["{{user}} keeps the promise", "Rin breaks the vow", "the player finally fulfills the oath", "you release Mara from it", "Rin kept the promise"])("flags %s", (text) => {
    expect(narratesPlayer(text, ["Rin"])).toBe(true);
  });

  it("leaves a character's own act alone", () => {
    expect(narratesPlayer("Mara keeps the lantern lit", ["Rin"])).toBe(false);
  });
});

describe("plan 47 authored promises: a promise quest needs a giver", () => {
  const base = {
    id: "q", title: "Q", description: "d",
    qualities: [{ key: "found", type: "bool", source: "extractor", rubric: "Found?" }],
    checkpoints: [{ id: "cp1", name: "Start", objective: "o", type: "anchor", start: true }], transitions: [], roster: [{ id: "mara", name: "Mara" }],
  };
  const quest = (patch: object) => ({ id: "brother", title: "Bring her brother home", kind: "side", done_when: { q: "found", op: "==", v: true }, ...patch });

  it("accepts promise: true with a giver and keeps it", () => {
    const parsed = parseStory({ ...base, quests: [quest({ giver: "mara", promise: true })] });
    expect(Array.isArray(parsed)).toBe(false);
    expect(!Array.isArray(parsed) && parsed.quests?.[0]?.promise).toBe(true);
  });

  it("refuses a promise quest without a giver, and a non-boolean promise", () => {
    expect(parseStory({ ...base, quests: [quest({ promise: true })] })).toEqual(expect.arrayContaining([expect.objectContaining({ path: "quests.0.promise" })]));
    expect(parseStory({ ...base, quests: [quest({ giver: "mara", promise: "yes" })] })).toEqual(expect.arrayContaining([expect.objectContaining({ path: "quests.0.promise" })]));
  });
});
