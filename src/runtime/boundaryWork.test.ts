import type { BoundaryResult } from "@engine/index";
import type { ExtractionScheduler } from "@extraction/index";
import { BOUNDARY_WORK, cueScanStart, runBoundaryWork } from "./boundaryWork";
import type { SceneCoordinator } from "./coordinators/sceneCoordinator";
import type { RuntimeManager } from "./runtimeManager";

const scheduleForcedCues = jest.fn();
const planReconciliation = jest.fn((..._args: unknown[]): unknown => null);

jest.mock("@extraction/index", () => ({
  getChatWindow: (from: number, to: number) => ({ from, to, messages: [] }),
  planReconciliation: (...args: unknown[]) => planReconciliation(...args),
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
  getExtractionSettings: () => ({}),
  scheduleExpansionForActive: jest.fn(),
  detectSceneBreak: () => null,
  shouldCompactShortTerm: () => false,
  curatorDueForRun: () => false,
  innerBeatDue: () => false,
  meanwhile: { land: async () => 0, due: () => false, schedule: () => false },
  living: { applyAccepted: async () => 0, compact: () => undefined, due: () => false, schedule: () => false },
  recordReconciliation: jest.fn(),
  judgedExtraction: jest.fn(() => false),
} as unknown as RuntimeManager;

const scheduler = { onBoundary: jest.fn(), schedule: jest.fn(), cadenceQueuedAt: jest.fn(() => false) } as unknown as ExtractionScheduler;

describe("living story director (v2.8 22)", () => {
  it("applies accepted turning points before expansion looks for a stub, and schedules the director off-path when due", async () => {
    const order = BOUNDARY_WORK.map((item) => item.id);
    expect(order.indexOf("living-apply")).toBeLessThan(order.indexOf("expansion"));
    expect(order.indexOf("living-director")).toBeGreaterThan(order.indexOf("expansion-commit"));
    const applyAccepted = jest.fn(async () => 1);
    const compact = jest.fn();
    const schedule = jest.fn(() => true);
    const on = { ...manager, living: { applyAccepted, compact, due: () => true, schedule } } as unknown as RuntimeManager;
    runBoundaryWork({ result: result(2, 4), manager: on, scheduler });
    await Promise.resolve();
    await Promise.resolve();
    expect(applyAccepted).toHaveBeenCalledWith({ boundary: 1, messageId: 4 });
    expect(compact).toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
    const off = { ...manager, living: { applyAccepted, compact, due: () => false, schedule } } as unknown as RuntimeManager;
    runBoundaryWork({ result: result(2, 4), manager: off, scheduler });
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

describe("inner beat (v2.6 plan 06 C)", () => {
  it("runs off-path after the scene read, only while the switch is on, and never as a scheduler job", async () => {
    const order = BOUNDARY_WORK.map((item) => item.id);
    expect(order.indexOf("inner-beat")).toBeGreaterThan(order.indexOf("scene-read"));
    const runInnerBeat = jest.fn(async () => 1);
    const on = { ...manager, innerBeatDue: () => true, runInnerBeat } as unknown as RuntimeManager;
    const schedule = scheduler.schedule as unknown as jest.Mock;
    schedule.mockClear();
    runBoundaryWork({ result: result(2, 4), manager: on, scheduler });
    runBoundaryWork({ result: result(4, 5), manager, scheduler });
    expect(runInnerBeat).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls.map(([job]) => (job as { reason: string }).reason)).not.toContain("inner-beat");
  });
});

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

describe("scene read (v2.2 plan 03)", () => {
  const scene = (active: boolean) => {
    const run = jest.fn(async () => null);
    return { run, coordinator: { active: () => active, run } as unknown as SceneCoordinator };
  };

  it("runs after scene-detect, so the judge only adds a read the heuristic did not schedule", () => {
    const ids = BOUNDARY_WORK.map((item) => item.id);
    expect(ids.indexOf("scene-read")).toBe(ids.indexOf("scene-detect") + 1);
  });

  it("hands the heuristic's verdict to the scene read, and skips it while no usage is on", () => {
    const hitManager = { ...manager, detectSceneBreak: () => ({ hit: true, reason: "location", signals: ["cast"] }) } as unknown as RuntimeManager;
    const on = scene(true);
    runBoundaryWork({ result: result(2, 4), manager: hitManager, scheduler, scene: on.coordinator });
    expect(on.run).toHaveBeenCalledWith(expect.objectContaining({ boundary: 1, messageId: 4, heuristicFired: true }));
    const quiet = scene(true);
    runBoundaryWork({ result: result(4, 5), manager, scheduler, scene: quiet.coordinator });
    expect(quiet.run).toHaveBeenCalledWith(expect.objectContaining({ messageId: 5, heuristicFired: false }));
    const off = scene(false);
    runBoundaryWork({ result: result(5, 6), manager, scheduler, scene: off.coordinator });
    expect(off.run).not.toHaveBeenCalled();
  });
});

describe("judged extraction (v2.2 plan 06)", () => {
  const judged = manager.judgedExtraction as unknown as jest.Mock;
  const cadence = scheduler.cadenceQueuedAt as unknown as jest.Mock;
  const schedule = scheduler.schedule as unknown as jest.Mock;
  beforeEach(() => { judged.mockReset(); judged.mockReturnValue(false); cadence.mockReset(); cadence.mockReturnValue(false); schedule.mockReset(); planReconciliation.mockReset(); planReconciliation.mockReturnValue(null); });

  it("offers the typed read on a boundary without a cadence read, and skips it when one was queued", () => {
    runBoundaryWork({ result: result(3, 5), manager, scheduler });
    expect(judged).toHaveBeenCalledWith({ kind: "typed", boundary: 1, messageId: 5 });
    judged.mockClear();
    cadence.mockReturnValue(true);
    runBoundaryWork({ result: result(5, 6), manager, scheduler });
    expect(judged).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "typed" }));
  });

  it("hands a stall to the judge pre-check first, and schedules today's re-read when it declines", () => {
    const plan = { descriptor: { checkpointId: "start", boundary: 1, targetedKeys: ["door"] }, reason: "reconcile:door", window: { from: 0, to: 4, messages: [] }, leaves: [] };
    planReconciliation.mockReturnValue(plan);
    runBoundaryWork({ result: result(3, 4), manager, scheduler });
    expect(judged).toHaveBeenCalledWith(expect.objectContaining({ kind: "stall", plan }));
    expect(schedule).toHaveBeenCalledWith({ priority: 0, reason: "reconcile:door", window: plan.window });
    schedule.mockClear();
    judged.mockImplementation((work: { kind: string }) => work.kind === "stall");
    runBoundaryWork({ result: result(4, 5), manager, scheduler });
    expect(schedule).not.toHaveBeenCalledWith(expect.objectContaining({ reason: "reconcile:door" }));
  });
});

