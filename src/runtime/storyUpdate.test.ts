import { parseStoryV2OrThrow, StoryEngine, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { applyStoryUpdate, describeStoryUpdate, type StoryUpdateDeps, type StoryUpdateOutcome } from "./storyUpdate";
import { diffStories } from "@engine/storyDiff";
import type { LoadedStory, StoryLibraryRecord } from "./types";

const choice = jest.fn(async () => "keep" as string | null);
jest.mock("@services/STAPI", () => ({ showChoicePopup: (...args: unknown[]) => choiceProxy(...args) }));
const choiceProxy = (...args: unknown[]) => choice(...(args as []));

const library = new Map<string, StoryLibraryRecord>();
jest.mock("./storyLibrary", () => ({
  findStoryRecord: (id: string) => libraryProxy().get(id) ?? null,
  loadStoryRecord: (record: StoryLibraryRecord) => ({ record, story: parseStoryV2OrThrow(record.raw) }),
}));
const libraryProxy = () => library;

const storyV1 = (): StoryV2 => ({
  format: 2,
  id: "hot-swap",
  version: 1,
  title: "Hot swap",
  description: "Base.",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "How far does she trust him?" },
    { key: "mood", type: "enum", values: ["calm", "angry"], source: "extractor", rubric: "What is the mood?" },
  ],
  checkpoints: [
    { id: "start", name: "The gate", objective: "Arrive", type: "anchor", start: true },
    { id: "end", name: "The road", objective: "Leave", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "end", gate: { q: "trust", op: ">=", v: 9 }, priority: 0 }],
  roster: [],
});

const record = (raw: StoryV2, version: number, hash: string): StoryLibraryRecord => ({
  id: raw.id as string,
  version,
  hash,
  title: raw.title,
  description: raw.description,
  raw,
  importedAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
});

const playedState = (story: NormalizedStoryV2): EngineState => {
  const engine = new StoryEngine();
  engine.loadStory(story);
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "trust", v: 3, source: "extractor" }, { q: "mood", v: "angry", source: "extractor" }] });
  engine.commitBoundary({ lastMessageId: 4, chatLength: 5 });
  return engine.serialize();
};

const harness = (next: StoryV2, nextVersion = 2) => {
  const base = parseStoryV2OrThrow(storyV1());
  const loaded: LoadedStory = { record: record(storyV1(), 1, "hash-1"), story: base };
  const state = playedState(base);
  library.clear();
  library.set("hot-swap", record(next, nextVersion, "hash-2"));
  const swapped: Array<{ loaded: LoadedStory; state: EngineState | null; reanchored: boolean }> = [];
  const journalled: StoryUpdateOutcome[] = [];
  const restart = jest.fn(async () => true);
  const deps: StoryUpdateDeps = {
    getLoaded: () => loaded,
    getState: () => state,
    mergeStory: (_raw, parsed) => parsed,
    swapStory: async (nextLoaded, nextState, reanchored) => { swapped.push({ loaded: nextLoaded, state: nextState, reanchored }); },
    restart,
    journal: (outcome) => journalled.push(outcome),
  };
  return { deps, swapped, journalled, restart, state, base };
};

beforeEach(() => {
  choice.mockClear();
  choice.mockResolvedValue("keep");
});

describe("applyStoryUpdate", () => {
  it("hot-swaps a compatible edit without asking, keeping the run", async () => {
    const next = storyV1();
    next.transitions[0].gate = { q: "trust", op: ">=", v: 2 };
    next.description = "Edited mid-play.";
    const { deps, swapped, journalled } = harness(next);

    const outcome = await applyStoryUpdate(deps);

    expect(choice).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ applied: true, classification: "compatible", choice: "keep", fromVersion: 1, toVersion: 2 });
    expect(swapped).toHaveLength(1);
    expect(swapped[0].state?.blackboard.values).toEqual(expect.objectContaining({ trust: 3, mood: "angry" }));
    expect(swapped[0].reanchored).toBe(false);
    expect(journalled).toHaveLength(1);
  });

  it("asks before an invalidating edit and drops only the orphaned value on keep", async () => {
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    const { deps, swapped } = harness(next);

    const outcome = await applyStoryUpdate(deps);

    expect(choice).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ applied: true, classification: "invalidating", choice: "keep", dropped: ["mood"] });
    expect(swapped[0].state?.blackboard.values.mood).toBeUndefined();
    expect(swapped[0].state?.blackboard.values.trust).toBe(3);
  });

  it("restarts when the author picks restart, and leaves the chat alone on cancel", async () => {
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");

    choice.mockResolvedValue("restart");
    const restarting = harness(next);
    expect(await applyStoryUpdate(restarting.deps)).toMatchObject({ applied: true, choice: "restart" });
    expect(restarting.restart).toHaveBeenCalledTimes(1);
    expect(restarting.swapped).toHaveLength(0);

    choice.mockResolvedValue(null);
    const cancelling = harness(next);
    expect(await applyStoryUpdate(cancelling.deps)).toMatchObject({ applied: false, choice: "cancel" });
    expect(cancelling.swapped).toHaveLength(0);
    expect(cancelling.restart).not.toHaveBeenCalled();
  });

  it("re-anchors when the checkpoint the chat is standing on is gone", async () => {
    const next = storyV1();
    next.checkpoints = [
      { id: "prologue", name: "The road out", objective: "Set off", type: "anchor", start: true },
      { id: "end", name: "The road", objective: "Leave", type: "anchor" },
    ];
    next.transitions = [{ from: "prologue", to: "end", gate: { q: "trust", op: ">=", v: 2 }, priority: 0 }];
    const { deps, swapped } = harness(next);

    const outcome = await applyStoryUpdate(deps);

    expect(outcome.classification).toBe("invalidating");
    expect(swapped[0].reanchored).toBe(true);
    expect(swapped[0].state?.activeCheckpointId).toBe("prologue");
  });

  it("does nothing when the chat already plays the saved version", async () => {
    const { deps, swapped, journalled } = harness(storyV1(), 1);
    library.set("hot-swap", record(storyV1(), 1, "hash-1"));

    const outcome = await applyStoryUpdate(deps);

    expect(outcome).toMatchObject({ applied: false, classification: "identical", reason: "already playing this version" });
    expect(swapped).toHaveLength(0);
    expect(journalled).toHaveLength(1);
  });

  it("refuses a record that is a different story", async () => {
    const { deps } = harness(storyV1());
    const other = record({ ...storyV1(), id: "somewhere-else" }, 1, "hash-x");

    expect(await applyStoryUpdate(deps, other)).toMatchObject({ applied: false, classification: "unavailable" });
  });
});

describe("describeStoryUpdate", () => {
  it("lists every consequence the author is deciding about", () => {
    const before = parseStoryV2OrThrow(storyV1());
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    next.description = "Edited.";
    const diff = diffStories(before, parseStoryV2OrThrow(next), playedState(before));
    const html = describeStoryUpdate("Hot swap", diff, 1, 2);
    expect(html).toContain("(v1 → v2)");
    expect(html).toContain("“mood”");
    expect(html).toContain("1 other change carries over untouched.");
  });
});
