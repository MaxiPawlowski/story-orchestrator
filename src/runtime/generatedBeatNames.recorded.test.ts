import { StoryEngine, type StoryV2 } from "@engine/index";
import { mergeExpansions } from "@generation/merge";
import { parseGeneratedBeats } from "@generation/parse";
import { parseStoryV2OrThrow } from "@engine/index";
import type { ExpansionCacheEntry } from "@generation/types";
import { buildLastTransition, playerLastTransition } from "./snapshot";

jest.mock("@services/STAPI", () => ({ settingsAreLoaded: () => true, settingsReady: async () => {} }));

const raw: StoryV2 = {
  format: 2,
  title: "T1-1 road",
  description: "",
  qualities: [
    { key: "first_camp", type: "bool", source: "extractor", latching: true, rubric: "Camped?" },
    { key: "reached_walls", type: "bool", source: "extractor", latching: true, rubric: "At the walls?" },
    { key: "path", type: "enum", values: ["unknown", "wendhope", "around"], source: "extractor", rubric: "Which way?" },
  ],
  checkpoints: [
    { id: "road-to-wendhope", name: "The Road North", player_name: "The Journey North", objective: "", type: "anchor", start: true },
    { id: "on-the-road", name: "On the Road", player_name: "First Night on the Road", objective: "", type: "intermediate" },
    { id: "at-the-walls", name: "Hold, Wendhope Is Closed", player_name: "Turned Away at the Gate", objective: "", type: "anchor" },
  ],
  transitions: [
    { from: "road-to-wendhope", to: "at-the-walls", priority: 2, gate: { q: "reached_walls", op: "==", v: true } },
    { from: "road-to-wendhope", to: "on-the-road", priority: 1, gate: { q: "first_camp", op: "==", v: true } },
    { from: "on-the-road", to: "at-the-walls", priority: 2, gate: { q: "progress_toward_at-the-walls", op: ">=", v: 1 } },
    { from: "on-the-road", to: "at-the-walls", priority: 1, gate: { q: "reached_walls", op: "==", v: true } },
  ],
  roster: [],
} as unknown as StoryV2;

const RECORDED_BEATS = JSON.stringify({ beats: [
  { title: "The Road North", objective: "Walk north toward Wendhope.", guidance: "g", tension_target: "stirring",
    outcomes: [{ label: "on", gate: { q: "path", op: "==", v: "wendhope" }, progress: { anchor: "at-the-walls", amount: 1 } }] },
  { title: "Hold, Wendhope Is Closed", objective: "Reach the walls.", guidance: "g", tension_target: "tense",
    outcomes: [{ label: "walls", gate: { q: "reached_walls", op: "==", v: true } }] },
] });

const merged = () => {
  const story = parseStoryV2OrThrow(raw);
  const beats = parseGeneratedBeats(RECORDED_BEATS, story).beats;
  const entry = { key: "k", status: "validated", contract: 2, sourceCheckpointId: "road-to-wendhope", stubId: "on-the-road", targetAnchorId: "at-the-walls", beats } as unknown as ExpansionCacheEntry;
  return mergeExpansions(raw, { k: entry });
};

describe("T1-1: at Wendhope's gate the HUD said 'First Night on the Road' and the Overview 'Turned Away at the Gate' (T1-1 findings, journal.jsonl:428)", () => {
  it("a generated beat carries its own title, not the stub's player name", () => {
    const story = merged();
    expect(story.checkpointById["gen_on-the-road_1"].player_name).toBe("The Road North");
    expect(story.checkpointById["gen_on-the-road_2"].player_name).toBe("Hold, Wendhope Is Closed");
  });

  it("'Recently' names the checkpoint the story moved into by id, even when a beat shares an anchor's name", () => {
    const story = merged();
    const engine = new StoryEngine();
    engine.loadStory(story);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "first_camp", v: true }] });
    engine.commitBoundary({ lastMessageId: 10, chatLength: 11 });
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: "path", v: "wendhope" }] });
    engine.commitBoundary({ lastMessageId: 12, chatLength: 13 });
    expect(engine.serialize().activeCheckpointId).toBe("gen_on-the-road_2");
    expect(buildLastTransition(story, engine.stateLog)?.toName).toBe("Hold, Wendhope Is Closed");
    expect(story.checkpoints.find((checkpoint) => checkpoint.name === "Hold, Wendhope Is Closed")?.id).toBe("at-the-walls");
    expect(playerLastTransition(story, engine.stateLog)).toEqual({ fromName: "The Road North", toName: "Hold, Wendhope Is Closed" });
  });

  it("control: a stub with no generated title keeps the stub's player name", () => {
    const untitled = JSON.parse(RECORDED_BEATS);
    untitled.beats.forEach((beat: { title?: string }) => { delete beat.title; });
    const story = parseStoryV2OrThrow(raw);
    const entry = { key: "k", status: "validated", contract: 2, sourceCheckpointId: "road-to-wendhope", stubId: "on-the-road", targetAnchorId: "at-the-walls",
      beats: parseGeneratedBeats(JSON.stringify(untitled), story).beats } as unknown as ExpansionCacheEntry;
    expect(mergeExpansions(raw, { k: entry }).checkpointById["gen_on-the-road_1"].player_name).toBe("First Night on the Road");
  });
});
