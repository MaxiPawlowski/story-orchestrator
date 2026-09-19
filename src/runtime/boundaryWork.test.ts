import type { BoundaryResult } from "@engine/index";
import type { ExtractionScheduler } from "@extraction/index";
import { cueScanStart, runBoundaryWork } from "./boundaryWork";
import type { RuntimeManager } from "./runtimeManager";

const scheduleForcedCues = jest.fn();

jest.mock("@extraction/index", () => ({
  getChatWindow: (from: number, to: number) => ({ from, to, messages: [] }),
  maybeScheduleReconciliation: () => null,
  scheduleForcedCues: (...args: unknown[]) => scheduleForcedCues(...args),
}));

const result = (previousLastMessageId: number, lastMessageId: number): BoundaryResult => ({
  boundary: 1,
  queue: { applied: [], discarded: [] },
  fired: null,
  effects: null,
  activeCheckpointId: "start",
  context: { lastMessageId, chatLength: lastMessageId + 1 },
  previousLastMessageId,
});

const manager = {
  getStory: () => null,
  getEngineState: () => null,
  getExtractionSettings: () => ({ reconciliationMultiplier: 1.5 }),
  recordReconciliation: jest.fn(),
  scheduleExpansionForActive: jest.fn(),
  detectSceneBreak: () => null,
  shouldCompactShortTerm: () => false,
  curatorDueForRun: () => false,
} as unknown as RuntimeManager;

const scheduler = { onBoundary: jest.fn(), schedule: jest.fn() } as unknown as ExtractionScheduler;

describe("forced-cue scan window", () => {
  it("covers the greeting and the player's first message on the story's first boundary", () => {
    expect(cueScanStart(result(-1, 2))).toBe(0);
  });

  it("covers only what arrived since the previous boundary", () => {
    expect(cueScanStart(result(2, 4))).toBe(3);
  });

  it("rescans the newest message when a swipe or continue commits at the same message id", () => {
    expect(cueScanStart(result(4, 4))).toBe(4);
  });

  it("hands that window to the cue scheduler through the boundary registry", () => {
    runBoundaryWork({ result: result(2, 4), manager, scheduler });
    expect(scheduleForcedCues).toHaveBeenCalledWith(null, "start", scheduler, { from: 3, to: 4, messages: [] });
  });
});
