const mockChat: Array<{ name: string; mes: string }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: mockChat }),
}));

jest.mock("./sharedRead", () => ({
  sharedReadWindow: jest.requireActual("./sharedRead").sharedReadWindow,
  runSharedRead: jest.fn(async () => ({
    audit: { id: "x", createdAt: "t", priority: 0, reason: "r", contractHash: "h", scope: [], window: { from: 0, to: 0 }, prompt: "p", rawResponse: "r", acceptedDeltas: [], rejected: [] },
    facts: [],
    memory: [],
    arcs: [],
  })),
}));

import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type EngineState, type GateNode, type NormalizedStoryV2 } from "@engine/index";
import { ExtractionScheduler, type SchedulerHost } from "./scheduler";
import { runSharedRead } from "./sharedRead";
import { scheduleForcedCues } from "./cues";
import { getChatWindow } from "./chatWindow";
import { deriveScope } from "./scope";

const HUB = "war-the-summons";
const HUB_LINE = "No more waiting: we join the company and swear to the banner.";

const war = (): NormalizedStoryV2 =>
  parseStoryV2OrThrow(JSON.parse(readFileSync(join(__dirname, "..", "..", "test", "fixtures", "adolion-war.story.json"), "utf8")));

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const blackboard = { values: {}, versions: {}, latched: {} };

const hostFor = (story: NormalizedStoryV2, lastMessageId: () => number, checkpoint = HUB): SchedulerHost => ({
  getStory: () => story,
  getEngineState: () => ({ activeCheckpointId: checkpoint, lastMessageId: lastMessageId(), blackboard }) as unknown as EngineState,
  getExtractionSettings: () => ({ enabled: true, profileId: null, cadence: 1, stabilityLag: 0 }),
  getFacts: () => [],
  getFiredTransitions: () => [],
  getExpansionGateSources: () => [],
  getOpenArcs: () => [],
  applyExtractionAudit: async () => undefined,
  onSchedulerChange: () => undefined,
}) as Partial<SchedulerHost> as SchedulerHost;

const gateKeys = (gate: GateNode, keys = new Set<string>()): Set<string> => {
  if ("q" in gate) keys.add(gate.q);
  if ("all" in gate) gate.all.forEach((entry) => gateKeys(entry, keys));
  if ("any" in gate) gate.any.forEach((entry) => gateKeys(entry, keys));
  if ("not" in gate) gateKeys(gate.not, keys);
  return keys;
};

const seedChat = (...lines: string[]) => {
  mockChat.length = 0;
  lines.forEach((mes, index) => mockChat.push({ name: index % 2 ? "Alexander" : "Max", mes }));
};

const reads = () => (runSharedRead as jest.Mock).mock.calls.map(([options]) => options as { priority: number; reason: string; window: { from: number; to: number } });

beforeEach(() => {
  (runSharedRead as jest.Mock).mockClear();
  mockChat.length = 0;
});

describe("forced cues coalesce into one read per window (v2.6 plan 15, model-config audit)", () => {
  it("adolion-war's hub: every transition whose cue matches one message shares ONE read, and its scope covers every one of their gates", async () => {
    const story = war();
    seedChat("The council waits on your answer.", HUB_LINE);
    const matching = (story.outgoingByCheckpoint[HUB] ?? []).filter((transition) => transition.extractor_trigger && new RegExp(transition.extractor_trigger, "i").test(HUB_LINE));
    expect(matching.length).toBe(9);
    const scheduler = new ExtractionScheduler(hostFor(story, () => 1));
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(0, 1));
    await flush();
    expect(reads()).toHaveLength(1);
    const [read] = reads();
    expect(read.priority).toBe(0);
    for (const transition of matching) expect(read.reason).toContain(`${transition.from}->${transition.to}`);
    const scope = new Set(deriveScope(story, HUB, blackboard).map((entry) => entry.key));
    const asked = new Set(matching.flatMap((transition) => [...gateKeys(transition.gate)]).filter((key) => story.qualityByKey[key]?.source === "extractor"));
    expect(asked.size).toBeGreaterThan(0);
    expect([...asked].filter((key) => !scope.has(key))).toEqual([]);
  });

  it("a second boundary's cues fold into the cue read still queued for the same chat, which reads the newest window once", async () => {
    const story = war();
    seedChat("The council waits on your answer.", HUB_LINE, "Alexander nods.", "We march to the banner at dawn.");
    let lastMessageId = 1;
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new ExtractionScheduler(hostFor(story, () => lastMessageId));
    scheduler.schedule({ priority: 0, reason: "busy", run: async () => { await gate; } });
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(0, 1));
    lastMessageId = 3;
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(2, 3));
    release();
    await flush();
    expect(reads()).toHaveLength(1);
    expect(reads()[0].window).toMatchObject({ to: 3 });
  });

  it("control: cues on two different windows (the first read already ran) stay two reads", async () => {
    const story = war();
    seedChat("The council waits on your answer.", HUB_LINE, "Alexander nods.", "We march to the banner at dawn.");
    let lastMessageId = 1;
    const scheduler = new ExtractionScheduler(hostFor(story, () => lastMessageId));
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(0, 1));
    await flush();
    lastMessageId = 3;
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(2, 3));
    await flush();
    expect(reads()).toHaveLength(2);
    expect(reads().map((read) => read.window.to)).toEqual([1, 3]);
  });

  it("control: a cue read does not swallow a rollback re-read of an explicit window, and neither is swallowed by a pending P1", async () => {
    const story = war();
    seedChat("The council waits on your answer.", HUB_LINE, "Alexander nods.", "We march to the banner at dawn.");
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new ExtractionScheduler(hostFor(story, () => 3));
    scheduler.schedule({ priority: 0, reason: "busy", run: async () => { await gate; } });
    scheduler.schedule({ priority: 1, reason: "cadence", window: getChatWindow(0, 3) });
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(2, 3));
    scheduler.schedule({ priority: 0, reason: "rollback:3", window: getChatWindow(0, 3) });
    expect(scheduler.getSnapshot().queueDepth).toBe(3);
    release();
    await flush();
    expect(reads().map((read) => [read.priority, read.reason.split(":")[0]])).toEqual([[0, "cue"], [0, "rollback"], [1, "cadence"]]);
  });

  it("control: a cue read never merges into a scene read, whose reason journeys match exactly", async () => {
    const story = war();
    seedChat("The council waits on your answer.", HUB_LINE);
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new ExtractionScheduler(hostFor(story, () => 1));
    scheduler.schedule({ priority: 0, reason: "busy", run: async () => { await gate; } });
    scheduler.schedule({ priority: 0, reason: "scene:location" });
    scheduleForcedCues(story, HUB, scheduler, getChatWindow(0, 1));
    release();
    await flush();
    expect(reads().map((read) => read.reason.split(":")[0])).toEqual(["scene", "cue"]);
    expect(reads()[0].reason).toBe("scene:location");
  });
});
