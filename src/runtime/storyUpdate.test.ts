import { parseStoryV2OrThrow, StoryEngine, type EngineState, type NormalizedStoryV2, type StoryV2 } from "@engine/index";
import { applyStoryUpdate, chatUpdateSentence, describeStoryUpdate, renderStoryUpdate, type StoryUpdateDeps, type StoryUpdateOutcome } from "./storyUpdate";
import { diffStories } from "@engine/storyDiff";
import type { LoadedStory, StoryLibraryRecord } from "./types";
import { mintToken, tokenMatches, type RunContext, type RunOwnership, type RunToken } from "./runToken";

const choice = jest.fn(async () => "keep" as string | null);
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, showChoicePopup: (...args: unknown[]) => choiceProxy(...args) }));
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
  raw: raw as unknown as Record<string, unknown>,
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
  let current: RunContext = {
    chatId: "chat-a",
    storyId: "hot-swap",
    playedVersion: 1,
    sessionEpoch: 1,
    windowRevision: 0,
    lowestMutatedMessageId: null,
  };
  const ownership: RunOwnership = {
    mint: (window = null) => mintToken(current, window),
    check: (token: RunToken) => tokenMatches(current, token),
  };
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
    ownership,
  };
  return {
    deps,
    swapped,
    journalled,
    restart,
    state,
    base,
    switchWorld: () => { current = { ...current, chatId: "chat-b", sessionEpoch: 2 }; },
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// jest runs with `testEnvironment: "node"`, so the renderer is handed the document it builds into
// rather than reaching for a global one. This records what it was asked for.
const fakeDoc = () => {
  const created: string[] = [];
  const texts: string[] = [];
  const leaf = (text: string) => ({ text, get textContent(): string { return this.text; } });
  const doc = {
    createTextNode: (value: string) => { texts.push(value); return leaf(value); },
    createElement: (tag: string) => {
      created.push(tag);
      const children: Array<{ textContent?: string }> = [];
      return {
        children,
        text: "",
        append(...kids: Array<{ textContent?: string }>) { kids.forEach((kid) => children.push(kid)); },
        get textContent(): string { return this.text + children.map((child) => child.textContent ?? "").join(""); },
      };
    },
  };
  return { doc: doc as unknown as Document, created, texts };
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

  it("applies a delayed keep decision while the same world remains current", async () => {
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    const h = harness(next);
    const pending = deferred<string | null>();
    choice.mockImplementationOnce(() => pending.promise);

    const running = applyStoryUpdate(h.deps);
    await settle();
    expect(choice).toHaveBeenCalledTimes(1);
    pending.resolve("keep");
    const outcome = await running;

    expect(outcome).toMatchObject({ applied: true, choice: "keep" });
    expect(h.swapped).toHaveLength(1);
    expect(h.journalled).toHaveLength(1);
  });

  it("discards a delayed keep decision after the world changes", async () => {
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    const h = harness(next);
    const pending = deferred<string | null>();
    choice.mockImplementationOnce(() => pending.promise);

    const running = applyStoryUpdate(h.deps);
    await settle();
    expect(choice).toHaveBeenCalledTimes(1);
    h.switchWorld();
    pending.resolve("keep");
    const outcome = await running;

    expect(outcome).toMatchObject({ applied: false, choice: null });
    expect(outcome.reason).toContain("story update discarded: epoch:");
    expect(h.swapped).toHaveLength(0);
    expect(h.restart).not.toHaveBeenCalled();
    expect(h.journalled).toHaveLength(0);
  });

  it("discards the update when the world changes while the story comparison is still loading", async () => {
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    const h = harness(next);

    const running = applyStoryUpdate(h.deps);
    h.switchWorld();
    const outcome = await running;

    expect(outcome).toMatchObject({ applied: false, choice: null, classification: "unavailable" });
    expect(outcome.reason).toContain("story update discarded: epoch:");
    expect(choice).not.toHaveBeenCalled();
    expect(h.swapped).toHaveLength(0);
    expect(h.journalled).toHaveLength(0);
  });

  it("discards a delayed restart decision after the world changes", async () => {
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    const h = harness(next);
    const pending = deferred<string | null>();
    choice.mockImplementationOnce(() => pending.promise);

    const running = applyStoryUpdate(h.deps);
    await settle();
    expect(choice).toHaveBeenCalledTimes(1);
    h.switchWorld();
    pending.resolve("restart");
    const outcome = await running;

    expect(outcome).toMatchObject({ applied: false, choice: null });
    expect(h.restart).not.toHaveBeenCalled();
    expect(h.swapped).toHaveLength(0);
    expect(h.journalled).toHaveLength(0);
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
    const description = describeStoryUpdate("Hot swap", diff, 1, 2);
    const text = renderStoryUpdate(description, fakeDoc().doc).textContent ?? "";
    expect(text).toContain("(v1 → v2)");
    expect(text).toContain("“mood”");
    // v2.3 plan 09: one save vocabulary — the library half is already done when this pops up.
    expect(text).toContain("Your edit is already saved to the library.");
    expect(text).toContain("1 other change is applied to this chat as it stands.");
    expect(text).toContain("Cancel applies nothing — this chat keeps playing v1, the version it is playing now. Either way the library keeps your edit.");
  });

  it("T4-4: taken from the drawer in a chat that made no edit, the popup names the library's version, not an edit (T4-4-2 x-drive-1790920434406-update.json)", () => {
    const before = parseStoryV2OrThrow(storyV1());
    const next = storyV1();
    next.qualities = next.qualities.filter((quality) => quality.key !== "mood");
    const diff = diffStories(before, parseStoryV2OrThrow(next), playedState(before));
    const text = renderStoryUpdate(describeStoryUpdate("Hot swap", diff, 30, 31, "update"), fakeDoc().doc).textContent ?? "";
    expect(text).not.toContain("Your edit");
    expect(text).toContain("The library holds v31 of this story.");
    expect(text).toContain("this chat keeps playing v30, the version it is playing now.");
  });

  it("T4-4: Cancel is never reported as applied, and each outcome is one sentence (T4-4-2 x-drive-1790920351290-save.json:55)", () => {
    const outcome = (over: Partial<StoryUpdateOutcome>): StoryUpdateOutcome => ({ applied: false, classification: "invalidating", choice: null, fromVersion: 30, toVersion: 31, storyId: "s", dropped: [], at: "", ...over });
    expect(chatUpdateSentence(outcome({ choice: "cancel", reason: "author kept this chat on its pinned version" }))).toBe("Not applied to this chat: this chat keeps playing v30.");
    expect(chatUpdateSentence(outcome({ applied: true, choice: "keep", classification: "compatible" }))).toBe("Applied to this chat: this chat is playing the new version now.");
    expect(chatUpdateSentence(outcome({ applied: true, choice: "restart" }))).toBe("Applied to this chat: this chat restarted on the new version.");
    expect(chatUpdateSentence(outcome({ choice: "restart", reason: "restart declined" }))).toBe("Not applied to this chat: restart declined.");
    expect(chatUpdateSentence(undefined)).toBeNull();
  });

  // R7. The title comes from an imported story and the message from a diff over it, so neither is
  // markup — the renderer only ever puts them in text nodes.
  it("renders an authored title as text, never as live markup", () => {
    const marker = '<img src=x onerror="globalThis.reviewMarker=1">';
    const hostile = { classification: "invalidating", entries: [{ kind: "invalidating", message: marker }], droppedQualityKeys: [] } as never;
    const { doc, created, texts } = fakeDoc();
    const rendered = renderStoryUpdate(describeStoryUpdate(marker, hostile, 1, 2), doc);
    expect(texts).toContain(marker);
    expect(rendered.textContent).toContain(marker);
    expect(created.every((tag) => /^[a-z][a-z0-9]*$/.test(tag))).toBe(true);
  });
});
