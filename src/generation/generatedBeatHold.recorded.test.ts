import * as recorded from "../../test/fixtures/t2-1-between-the-floors.expansion.json";
import { StoryEngine, parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import { mergeExpansions } from "./merge";
import { parseGeneratedBeats } from "./parse";
import type { ExpansionCacheEntry } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
}));

const raw = recorded.story as unknown as StoryV2;
const story = parseStoryV2OrThrow(raw);
const parsed = parseGeneratedBeats(JSON.stringify({ beats: recorded.beats }), story);
const entry = { key: "k", status: "validated", contract: 2, sourceCheckpointId: "the-first-descent", stubId: "between-the-floors",
  targetAnchorId: "the-changed-deep", beats: parsed.beats } as unknown as ExpansionCacheEntry;

const entered = () => {
  const engine = new StoryEngine();
  engine.loadStory(mergeExpansions(raw, { k: entry }));
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "descent", v: 1 }, { q: "location", v: "upper_mines" }] });
  expect(engine.commitBoundary({ lastMessageId: 46, chatLength: 47, lastPlayerMessageId: 45 }).activeCheckpointId).toBe("gen_between-the-floors_1");
  return engine;
};

describe("T2-1: a generated beat waits for the player (journal.jsonl:1001 enter gen_1 at msg 46, :1030 gen_1 -> gen_2 at msg 47, same round)", () => {
  it("parses the recorded chain, which the recorded code check passed", () => {
    expect(parsed.issues).toEqual([]);
    expect(recorded.codeCheck).toEqual({ ok: true, issues: [], progressTotal: 1 });
    expect(parsed.beats[0].outcomes[0].gate).toEqual({ q: "descent", op: ">=", v: 1 });
  });

  it("the next member's reply in the same round does not move The Breathing Dark on; the player's next turn does", () => {
    const engine = entered();
    expect(engine.commitBoundary({ lastMessageId: 47, chatLength: 48, lastPlayerMessageId: 45 }).fired).toBeNull();
    expect(engine.activeCheckpoint.id).toBe("gen_between-the-floors_1");
    expect(engine.commitBoundary({ lastMessageId: 49, chatLength: 50, lastPlayerMessageId: 48 }).activeCheckpointId).toBe("gen_between-the-floors_2");
  });

  it("the hold survives a reopen: it reads only the entry message and the context", () => {
    const engine = entered();
    const state = engine.serialize();
    const reopened = new StoryEngine();
    reopened.loadStory(mergeExpansions(raw, { k: entry }));
    reopened.hydrate(state);
    expect(reopened.commitBoundary({ lastMessageId: 47, chatLength: 48, lastPlayerMessageId: 45 }).fired).toBeNull();
  });

  it("control: without the player id (the recorded bundle) the beat passes at the very next boundary", () => {
    const engine = entered();
    expect(engine.commitBoundary({ lastMessageId: 47, chatLength: 48 }).activeCheckpointId).toBe("gen_between-the-floors_2");
  });

  it("control: an authored checkpoint is never held", () => {
    const engine = new StoryEngine();
    engine.loadStory(story);
    engine.activateCheckpoint("the-first-descent", { lastMessageId: 46, chatLength: 47, lastPlayerMessageId: 45 });
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "descent", v: 1 }] });
    expect(engine.commitBoundary({ lastMessageId: 47, chatLength: 48, lastPlayerMessageId: 45 }).activeCheckpointId).toBe("between-the-floors");
  });
});
