import { StoryEngine, type EngineHistory, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { diffStories, pruneEngineHistory } from "@engine/storyDiff";
import { parseStoryV2OrThrow } from "@engine/validate";
import { applyStoryUpdate, type StoryUpdateDeps } from "./storyUpdate";
import type { LoadedStory, StoryLibraryRecord } from "./types";
import { testOwnership } from "../../test/findings/testOwnership";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  showChoicePopup: async () => "keep",
}));

const base = (): StoryV2 => ({
  format: 2,
  id: "redline",
  title: "The Redline Kingdom",
  description: "A map that redraws the kingdom.",
  qualities: [{ key: "ink", type: "int", source: "extractor", rubric: "How much does she understand?" }],
  checkpoints: [
    { id: "start", name: "The Ink That Moves", objective: "Notice.", type: "anchor", start: true },
    { id: "flight", name: "Flight", objective: "Run.", type: "intermediate", guidance: "Keep moving." },
    { id: "redline", name: "The Redline", objective: "Choose.", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "flight", priority: 0, gate: { q: "ink", op: ">=", v: 1 } },
    { from: "flight", to: "redline", priority: 0, gate: { q: "ink", op: ">=", v: 5 } },
  ],
  roster: [{ id: "lord_vael", name: "Lord Vael" }],
});

const edited = (patch: (draft: StoryV2) => void): StoryV2 => {
  const draft = JSON.parse(JSON.stringify(base())) as StoryV2;
  patch(draft);
  return draft;
};

const played = (): { engine: StoryEngine; story: NormalizedStoryV2 } => {
  const story = parseStoryV2OrThrow(base());
  const engine = new StoryEngine();
  engine.loadStory(story);
  for (let turn = 0; turn < 4; turn += 1) {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "ink", v: turn + 1, source: "extractor" }] });
    engine.commitBoundary({ lastMessageId: turn * 2 + 1, chatLength: turn * 2 + 2 });
  }
  return { engine, story };
};

describe("T5-3 LOW: an edit that changes what a checkpoint does is never recorded as \"identical\"", () => {
  const state = { activeCheckpointId: "flight", boundary: 4, visitedAnchors: [], blackboard: { values: {}, versions: {}, latched: {} } } as unknown as EngineState;
  const diff = (next: StoryV2) => diffStories(parseStoryV2OrThrow(base()), parseStoryV2OrThrow(next), state);

  it.each([
    ["guidance", edited((draft) => { draft.checkpoints[1].guidance = "Run north, not west."; }), "guidance"],
    ["background", edited((draft) => { draft.checkpoints[2].effects = { background: { name: "cityscape medieval night.jpg" } }; }), "effects.background"],
    ["cast", edited((draft) => { draft.checkpoints[0].effects = { cast_changes: { disable: ["Lord Vael"] } }; }), "effects.cast_changes"],
  ])("a %s edit is a compatible checkpoint change that names the field", (_label, next, field) => {
    const result = diff(next);
    expect(result.classification).toBe("compatible");
    expect(result.entries.map((entry) => entry.code)).toEqual(["checkpoint-changed"]);
    expect(result.entries[0].message).toContain(field);
  });

  it("control: the same story is still identical", () => {
    expect(diff(base()).classification).toBe("identical");
  });
});

describe("T5-3 MEDIUM: a saved edit keeps the chat's boundary history, so the gate replay has rows", () => {
  it("prunes the history to the new story and keeps every boundary", () => {
    const { engine, story } = played();
    const history = engine.serializeHistory();
    expect(history.log).toHaveLength(4);
    const next = parseStoryV2OrThrow(edited((draft) => { draft.checkpoints[1].guidance = "Run north."; }));
    const kept = pruneEngineHistory(history, next, diffStories(story, next, engine.serialize()));
    const swapped = new StoryEngine();
    swapped.loadStory(next);
    swapped.hydrate(engine.serialize(), kept);
    expect(swapped.serializeHistory().log.map((entry) => entry.boundary)).toEqual([1, 2, 3, 4]);
  });

  it("drops a quality the new story no longer declares from every retained state", () => {
    const { engine, story } = played();
    const next = parseStoryV2OrThrow(edited((draft) => {
      draft.qualities = [{ key: "nerve", type: "int", source: "extractor", rubric: "Nerve?" }];
      draft.transitions = draft.transitions.map((transition) => ({ ...transition, gate: { q: "nerve", op: ">=", v: 1 } }));
    }));
    const kept = pruneEngineHistory(engine.serializeHistory(), next, diffStories(story, next, engine.serialize())) as EngineHistory;
    expect(kept.log.every((entry) => !("ink" in entry.after.blackboard.values))).toBe(true);
  });

  it("hands the history to the swap when the author saves from this chat", async () => {
    const { engine, story } = played();
    const record = (raw: StoryV2, hash: string): StoryLibraryRecord => ({ id: "redline", title: raw.title, hash, raw } as unknown as StoryLibraryRecord);
    const loaded: LoadedStory = { record: record(base(), "h1"), story };
    const swapStory = jest.fn(async () => undefined);
    const deps: StoryUpdateDeps = {
      getLoaded: () => loaded,
      getState: () => engine.serialize(),
      getHistory: () => engine.serializeHistory(),
      mergeStory: (_raw, parsed) => parsed,
      swapStory,
      restart: async () => false,
      journal: () => undefined,
      ownership: testOwnership(),
      chatOpen: () => true,
    };
    const outcome = await applyStoryUpdate(deps, record(edited((draft) => { draft.checkpoints[1].guidance = "Run north."; }), "h2"));
    expect(outcome).toMatchObject({ applied: true, classification: "compatible" });
    const history = (swapStory.mock.calls[0] as unknown[])[3] as EngineHistory | null;
    expect(history?.log).toHaveLength(4);
  });
});
