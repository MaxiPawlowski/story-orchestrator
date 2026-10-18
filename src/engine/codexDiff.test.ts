import { StoryEngine } from "./engine";
import { diffStories, pruneEngineState } from "./storyDiff";
import { parseStoryOrThrow } from "./validate";
import { codexFactKey, type NormalizedStory } from "./schema";
import { labRaw, labStory } from "../../test/support/codexLab";

type RawEntry = { id: string; facts: Array<Record<string, unknown>> } & Record<string, unknown>;

const edited = (change: (people: RawEntry[]) => RawEntry[]): NormalizedStory => {
  const raw = labRaw();
  const codex = raw.codex as { people: RawEntry[]; places: RawEntry[] };
  return parseStoryOrThrow({ ...raw, codex: { ...codex, people: change(JSON.parse(JSON.stringify(codex.people)) as RawEntry[]) } });
};

const earned = () => {
  const story = labStory();
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "heard_debt", v: true, source: "extractor" }, { q: "found_ledger", v: true, source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 2, chatLength: 3 });
  return { story, state: engine.serialize() };
};

const DEBT = codexFactKey("people", "ferryman", "debt");

const fact = (people: RawEntry[], entry: string, id: string) => people.find((item) => item.id === entry)!.facts.find((item) => item.id === id)!;

describe("C10: story edits to the codex", () => {
  test("a reworded earned fact stays known and shows the new words; the change is compatible", () => {
    const { story, state } = earned();
    const next = edited((people) => { fact(people, "ferryman", "debt").text = "Owes a great deal upriver."; return people; });
    const diff = diffStories(story, next, state);
    expect(diff.classification).toBe("compatible");
    expect(diff.entries.map((entry) => entry.code)).toEqual(["codex-fact-edited"]);
    expect(pruneEngineState(state, next, diff).blackboard.values[DEBT]).toBe(1);
  });

  test("a gate change drops the latch, so the new line is absent until earned again", () => {
    const { story, state } = earned();
    const next = edited((people) => { fact(people, "ferryman", "debt").known_when = { q: "paid", op: "==", v: true }; return people; });
    const diff = diffStories(story, next, state);
    expect(diff.classification).toBe("compatible");
    expect(diff.entries.map((entry) => entry.code)).toEqual(["codex-fact-replaced"]);
    const pruned = pruneEngineState(state, next, diff);
    expect(pruned.blackboard.values[DEBT]).toBeUndefined();
    expect(pruned.blackboard.latched[DEBT]).toBeUndefined();
  });

  test("a rev bump is a new discovery", () => {
    const { story, state } = earned();
    const next = edited((people) => { fact(people, "ferryman", "debt").rev = 2; return people; });
    const diff = diffStories(story, next, state);
    expect(diff.entries.map((entry) => entry.code)).toEqual(["codex-fact-replaced"]);
    expect(pruneEngineState(state, next, diff).blackboard.values[DEBT]).toBeUndefined();
  });

  test("a removed fact or entry is pruned, compatibly, never left as an orphan", () => {
    const { story, state } = earned();
    const lessFact = edited((people) => people.map((entry) => (entry.id === "ferryman" ? { ...entry, facts: entry.facts.filter((item) => item.id !== "debt") } : entry)));
    const factDiff = diffStories(story, lessFact, state);
    expect(factDiff.classification).toBe("compatible");
    expect(factDiff.entries.map((entry) => entry.code)).toEqual(["codex-fact-removed"]);
    expect(pruneEngineState(state, lessFact, factDiff).blackboard.values[DEBT]).toBeUndefined();
    const lessEntry = edited((people) => people.filter((entry) => entry.id !== "widow"));
    const entryDiff = diffStories(story, lessEntry, state);
    expect(entryDiff.classification).toBe("compatible");
    expect(entryDiff.entries.map((entry) => entry.code)).toEqual(["codex-entry-removed"]);
    expect(Object.keys(pruneEngineState(state, lessEntry, entryDiff).blackboard.values).filter((key) => key.startsWith("codex_p_widow"))).toEqual([]);
  });

  test("an added entry is a compatible change, and an identical codex is no change", () => {
    const { story, state } = earned();
    expect(diffStories(story, labStory(), state).classification).toBe("identical");
    const added = edited((people) => [...people, { id: "stranger", name: "A stranger", facts: [] }]);
    expect(diffStories(story, added, state).entries.map((entry) => entry.code)).toEqual(["codex-changed"]);
  });
});
