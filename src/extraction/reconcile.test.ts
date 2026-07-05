let mockChat: Array<{ mes: string; name: string; is_user: boolean }> = [];
jest.mock("@services/STAPI", () => ({
  getContext: () => ({ chat: mockChat }),
  sendConnectionProfileRequest: jest.fn(),
}));

import { StoryEngine } from "@engine/index";
import { parseStoryV2OrThrow } from "@engine/index";
import * as fs from "node:fs";
import * as path from "node:path";
import { maybeScheduleReconciliation } from "./reconcile";
import { runSharedRead } from "./sharedRead";

const readGolden = (name: string): string => fs.readFileSync(path.join(process.cwd(), "test/goldens", name), "utf8");
const storyFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "test/fixtures/extractor.story.json"), "utf8"));

const pushMessage = () => {
  mockChat.push({ mes: `Turn ${mockChat.length}`, name: "Max", is_user: true });
  return mockChat.length - 1;
};

describe("reconciliation recovery", () => {
  beforeEach(() => {
    mockChat = [];
  });

  it("recovers a stalled gate via targeted re-read after a cadence miss", async () => {
    const story = parseStoryV2OrThrow(storyFixture);
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);

    for (let turn = 0; turn < 6; turn += 1) {
      const messageId = pushMessage();
      engine.commitBoundary({ lastMessageId: messageId, chatLength: mockChat.length });
    }
    let state = engine.serialize();
    expect(state.activeCheckpointId).toBe("start");
    expect(state.boundary).toBe(6);

    const cadence = await runSharedRead({
      story,
      state,
      priority: 1,
      reason: "cadence",
      stabilityLag: 1,
      client: { profileId: null, debugResponse: readGolden("reconcile-cadence.response.txt") },
    });
    expect(cadence.audit.acceptedDeltas).toEqual([]);
    expect(engine.serialize().activeCheckpointId).toBe("start");

    const scheduler = { schedule: jest.fn() };
    maybeScheduleReconciliation(story, state, 1.5, scheduler as any);
    expect(scheduler.schedule).toHaveBeenCalledTimes(1);
    const job = scheduler.schedule.mock.calls[0][0];
    expect(job.reason).toBe("reconcile:player_has_key");
    expect(job.window).toBeDefined();

    const targeted = await runSharedRead({
      story,
      state,
      priority: 0,
      reason: job.reason,
      window: job.window,
      client: { profileId: null, debugResponse: readGolden("reconcile-targeted.response.txt") },
    });
    expect(targeted.audit.acceptedDeltas).toHaveLength(1);
    expect(targeted.audit.acceptedDeltas[0].delta).toMatchObject({ q: "player_has_key", v: true });

    engine.enqueue({
      source: "extractor",
      blackboardVersionSum: 0,
      turnRange: targeted.audit.window,
      deltas: targeted.audit.acceptedDeltas.map((entry) => entry.delta),
    });
    const messageId = pushMessage();
    const result = engine.commitBoundary({ lastMessageId: messageId, chatLength: mockChat.length });
    expect(result.activeCheckpointId).toBe("door");
  });
});
