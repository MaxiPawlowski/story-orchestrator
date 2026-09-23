// v2.3 plan 03 (§Abort and cleanup): "ExtractionScheduler clears both queues and its cursors on
// epoch bump".
//
// An epoch bump means a story load, select, restart, clear or chat change — everything queued
// before it was queued for a world that no longer exists. The ownership tokens added earlier in
// this plan already stop those jobs *writing* anything, but the job still runs: it builds a prompt
// from the new chat's window and spends a model call to produce a result that is then discarded.
//
// The cadence cursor matters as much as the queues. It records the boundary the last cadence read
// happened at, and boundary numbers restart with a new story — so a cursor carried across made the
// new story look as though it had already read at boundary N.

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {} }), sendConnectionProfileRequest: jest.fn() }));

import { ExtractionScheduler, type SchedulerHost } from "./scheduler";
import { control } from "../../test/findings/ledger";

function harness() {
  const ran: string[] = [];
  const host = {
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getEngineState: () => ({ activeCheckpointId: "cp1", boundary: 5, lastMessageId: 9 }),
    getExtractionSettings: () => ({ enabled: true, cadence: 1, profileId: "p1", debugResponse: "SCENE_NONE" }),
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    getEpistemicLedgerCapable: () => false,
    getEntities: () => [],
    applyExtractionAudit: async () => {},
    onSchedulerChange: () => {},
    pauseExtraction: () => {},
    judgeTyped: () => null,
  } as unknown as SchedulerHost;

  const scheduler = new ExtractionScheduler(host);
  const probe = scheduler as unknown as { queue: unknown[]; heavyQueue: unknown[]; cadenceBoundary: number; inFlight: boolean; heavyInFlight: boolean };
  probe.inFlight = true;
  probe.heavyInFlight = true;
  return { scheduler, probe, ran };
}

control("jobs queue up as normal", () => {
  const h = harness();
  h.scheduler.schedule({ priority: 0, reason: "rollback:3", run: async () => {} });
  h.scheduler.schedule({ priority: 4, reason: "arc-summary:1", run: async () => {} });
  expect(h.probe.queue.length + h.probe.heavyQueue.length).toBe(2);
});

control("clearForNewWorld empties BOTH queues, not just the light one", () => {
  // Priority >= 3 goes to the heavy queue. Clearing only `queue` would leave the expensive work —
  // arc summaries, consolidation, the curator — running against the world that replaced it.
  const h = harness();
  h.scheduler.schedule({ priority: 0, reason: "rollback:3", run: async () => {} });
  h.scheduler.schedule({ priority: 4, reason: "arc-summary:1", run: async () => {} });
  h.scheduler.clearForNewWorld();
  expect(h.probe.queue).toEqual([]);
  expect(h.probe.heavyQueue).toEqual([]);
});

control("the cadence cursor is reset, so the new world has not 'already read'", () => {
  // Boundary numbers restart with a new story. A carried-over cursor made the next story look as
  // though its cadence read had already happened.
  const h = harness();
  h.probe.cadenceBoundary = 42;
  h.scheduler.clearForNewWorld();
  expect(h.probe.cadenceBoundary).toBe(-1);
});

control("clearing an idle scheduler is not an error", () => {
  const h = harness();
  expect(() => h.scheduler.clearForNewWorld()).not.toThrow();
  expect(h.probe.queue).toEqual([]);
});

control("a job scheduled after the clear still runs", () => {
  // The clear must not leave the scheduler wedged: the new world queues work immediately.
  const h = harness();
  h.scheduler.clearForNewWorld();
  h.scheduler.schedule({ priority: 0, reason: "cadence:1", run: async () => {} });
  expect(h.probe.queue.length + h.probe.heavyQueue.length).toBe(1);
});

// --- cleanup keyed by epoch (v2.3 plan 03 §Abort and cleanup) ---
//
// Pausing extraction is INSTALL-WIDE. A job that throws after its world has ended used to pause the
// world that replaced it, so switching chats inherited the previous story's dead backend and
// silently stopped extracting everywhere. This is the plan's "an old task's cleanup touches only
// state tagged with its own epoch", in the place where it does the most damage.

function failingHarness() {
  const paused: string[] = [];
  let epoch = 1;
  const host = {
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getEngineState: () => ({ activeCheckpointId: "cp1", boundary: 5, lastMessageId: 9 }),
    getExtractionSettings: () => ({ enabled: true, cadence: 1, profileId: "p1" }),
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    getEpistemicLedgerCapable: () => false,
    getEntities: () => [],
    applyExtractionAudit: async () => {},
    onSchedulerChange: () => {},
    pauseExtraction: (message: string) => { paused.push(message); },
    judgeTyped: () => null,
    epoch: () => epoch,
  } as unknown as SchedulerHost;
  const scheduler = new ExtractionScheduler(host);
  return { scheduler, paused, endTheWorld: () => { epoch += 1; } };
}

control("a job that fails in its own world pauses extraction, as it always has", async () => {
  // The existing behaviour, pinned first: without it the case below cannot tell "correctly not
  // paused" from "never pauses at all".
  const h = failingHarness();
  h.scheduler.schedule({ priority: 0, reason: "cadence:1", run: async () => { throw new Error("backend down"); } });
  // runWithRetries makes 3 attempts with 250ms then 500ms backoff, so the catch that pauses is
  // ~750ms away. A 0ms tick returned before it ran and the assertion measured nothing.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(h.paused).toEqual(["backend down"]);
});

control("a job that fails AFTER its world ended does not pause the world that replaced it", async () => {
  const h = failingHarness();
  h.scheduler.schedule({
    priority: 0,
    reason: "cadence:1",
    run: async () => { h.endTheWorld(); throw new Error("backend down"); },
  });
  // runWithRetries makes 3 attempts with 250ms then 500ms backoff, so the catch that pauses is
  // ~750ms away. A 0ms tick returned before it ran and the assertion measured nothing.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(h.paused).toEqual([]);
});
