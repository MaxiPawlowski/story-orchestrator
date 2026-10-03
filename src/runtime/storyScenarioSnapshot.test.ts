jest.mock("@services/STAPI", () => ({ settingsAreLoaded: () => true, settingsReady: async () => {}, getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {}, characters: [] }) }));

import { parseStoryV2OrThrow } from "@engine/index";
import { setupWarnings, type SnapshotSources } from "./snapshotBuilder";
import { readScenarioFrameWith, scenarioFrame } from "./storyScenario";

const storyWith = (effects: Record<string, unknown> | undefined) => parseStoryV2OrThrow({
  format: 2, id: "frame", version: 1, title: "Frame", description: "d",
  qualities: [{ key: "step", type: "int", source: "code", rubric: "Step." }],
  roster: [],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, ...(effects ? { effects } : {}) }],
  transitions: [],
});

const sources = (story: ReturnType<typeof storyWith> | null, frame: SnapshotSources["scenarioFrame"]) => ({
  loaded: story ? { story } : null,
  secretsHeld: false,
  promptBlocks: { own: [], foreign: [] },
  copiersOn: [],
  extras: { memory: { settings: {} } },
  chat: [],
  scenarioFrame: frame,
}) as unknown as SnapshotSources;

const CAST = [{ name: "Arin", scenario: "Arin's card scene." }, { name: "Luke", scenario: "Luke's card scene." }];

describe("v2.7 02 C1: the competing-cards note rides the snapshot for the author view", () => {
  it("a story that sets no scenario, in a chat with no override, names every card scenario that frames the chat", () => {
    expect(setupWarnings(sources(storyWith(undefined), { override: "", cast: CAST })).competingScenarios).toEqual(["Arin", "Luke"]);
  });

  it("controls: a story that sets one, a user override, no story and no chat name none", () => {
    expect(setupWarnings(sources(storyWith({ scenario: "The gate." }), { override: "", cast: CAST })).competingScenarios).toEqual([]);
    expect(setupWarnings(sources(storyWith(undefined), { override: "Mine.", cast: CAST })).competingScenarios).toEqual([]);
    expect(setupWarnings(sources(null, { override: "", cast: CAST })).competingScenarios).toEqual([]);
    expect(setupWarnings(sources(storyWith(undefined), null)).competingScenarios).toEqual([]);
  });

  it("the frame is read through the registered reader, and nothing is read once it is gone", () => {
    const stop = readScenarioFrameWith(() => ({ override: "", cast: CAST }));
    expect(scenarioFrame()).toEqual({ override: "", cast: CAST });
    stop();
    expect(scenarioFrame()).toBeNull();
  });
});
