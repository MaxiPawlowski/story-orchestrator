const mockChat: Array<{ name: string; mes: string }> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: mockChat }) }));

jest.mock("@extraction/sharedRead", () => ({
  sharedReadWindow: jest.requireActual("@extraction/sharedRead").sharedReadWindow,
  runSharedRead: jest.fn(),
}));

import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { ExtractionScheduler, rollbackRereadReason, type SchedulerHost } from "@extraction/scheduler";
import { runSharedRead } from "@extraction/sharedRead";
import { derivePipelineStatus, EDIT_CATCH_UP_TEXT, editRereadPending, hudChipLabel } from "./pipeline";
import type { ExtractionRuntimeState } from "./types";

const extraction = (scheduler: ExtractionRuntimeState["scheduler"], overrides: Partial<ExtractionRuntimeState> = {}) => ({
  settings: { enabled: true, profileId: "p1", cadence: 3, stabilityLag: 0 },
  audits: [], reconciliationEvents: [], lastReadBoundary: 0, scheduler, ...overrides,
}) as Partial<ExtractionRuntimeState> as ExtractionRuntimeState;

const idle = { queueDepth: 0, inFlight: false, lastError: null };

describe("v2.7 plan 08 C: the pipeline says it is catching up after the player's edit", () => {
  it("names the edit while its re-read is queued or running", () => {
    for (const scheduler of [{ ...idle, queueDepth: 1, rereadReason: rollbackRereadReason(7, "edit") }, { ...idle, inFlight: true, rereadReason: "rollback:7:edit" }]) {
      const status = derivePipelineStatus(extraction(scheduler));
      expect(status).toMatchObject({ state: "catching-up", text: EDIT_CATCH_UP_TEXT, needsSetup: false, nextAction: "wait" });
      expect(status.detail).toContain("rollback:7:edit");
      expect(hudChipLabel(status.state, false)).toBe("catching up after your edit");
    }
  });

  it("outranks the road ahead and an ordinary read", () => {
    expect(derivePipelineStatus(extraction({ ...idle, inFlight: true, rereadReason: "rollback:3:edit" }), { generating: true }).state).toBe("catching-up");
  });

  it("control: a swipe or delete re-read, or an unmarked one, reads as an ordinary read", () => {
    for (const reason of ["rollback:7:swipe", "rollback:7:delete", "rollback:7", null]) {
      expect(editRereadPending({ rereadReason: reason })).toBe(false);
      expect(derivePipelineStatus(extraction({ ...idle, inFlight: true, rereadReason: reason })).state).toBe("reading");
    }
  });

  it("control: a broken pipeline still says what is broken", () => {
    const broken = extraction({ ...idle, inFlight: true, lastError: "profile gone", rereadReason: "rollback:3:edit" });
    expect(derivePipelineStatus(broken).state).toBe("error");
    expect(derivePipelineStatus(extraction({ ...idle, rereadReason: "rollback:3:edit" }, { settings: { enabled: false, profileId: "p1", cadence: 3, stabilityLag: 0 } })).state)
      .toBe("not-configured");
  });

  it("the reason carries the kind only when the rollback named one", () => {
    expect(rollbackRereadReason(4, "edit")).toBe("rollback:4:edit");
    expect(rollbackRereadReason(4)).toBe("rollback:4");
  });
});

describe("v2.7 plan 08 C: the scheduler reports a pending rollback re-read until it lands", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
  const host = (onChange: (snapshot: ReturnType<ExtractionScheduler["getSnapshot"]>) => void, scheduler: () => ExtractionScheduler) => ({
    getStory: () => ({}) as unknown as NormalizedStoryV2,
    getEngineState: () => ({}) as unknown as EngineState,
    getExtractionSettings: () => ({ enabled: true, profileId: null, cadence: 1, stabilityLag: 0 }),
    getFacts: () => [], getFiredTransitions: () => [], getExpansionGateSources: () => [], getOpenArcs: () => [],
    applyExtractionAudit: async () => undefined,
    onSchedulerChange: () => onChange(scheduler().getSnapshot()),
  }) as Partial<SchedulerHost> as SchedulerHost;

  it("queued, then running, then gone", async () => {
    mockChat.length = 0;
    for (let index = 0; index < 6; index += 1) mockChat.push({ name: "Max", mes: `m${index}` });
    let release = () => {};
    (runSharedRead as jest.Mock).mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ audit: { id: "x", createdAt: "t", priority: 0, reason: "r", contractHash: "h", scope: [], window: { from: 0, to: 5 }, prompt: "p", rawResponse: "", acceptedDeltas: [], rejected: [] }, facts: [] });
    }));
    const seen: Array<string | null> = [];
    let scheduler: ExtractionScheduler | null = null;
    scheduler = new ExtractionScheduler(host((snapshot) => seen.push(`${snapshot.inFlight}:${snapshot.rereadReason}`), () => scheduler as ExtractionScheduler));
    scheduler.schedule({ priority: 0, reason: rollbackRereadReason(5, "edit"), window: { from: 0, to: 5, messages: [] } });
    await flush();
    expect(scheduler.getSnapshot()).toMatchObject({ inFlight: true, rereadReason: "rollback:5:edit" });
    release();
    await flush();
    expect(scheduler.getSnapshot()).toMatchObject({ inFlight: false, rereadReason: null });
    expect(seen).toContain("false:rollback:5:edit");
    expect(seen).toContain("true:rollback:5:edit");
    expect(seen[seen.length - 1]).toBe("false:null");
  });

  it("control: a cadence read is not a rollback re-read", () => {
    const scheduler: ExtractionScheduler = new ExtractionScheduler(host(() => undefined, () => scheduler));
    (runSharedRead as jest.Mock).mockImplementation(() => new Promise(() => undefined));
    scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 2, messages: [] } });
    expect(scheduler.getSnapshot().rereadReason).toBeNull();
  });
});
