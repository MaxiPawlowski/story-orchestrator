// v2.4 plan 03 live gate 2, D2: an edit inside an in-flight read that rolls nothing back cancelled the
// read, and nothing read its window again — the cadence cursor had already moved past it.

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {} }), sendConnectionProfileRequest: jest.fn() }));

type Read = { reason: string; window: { from: number; to: number }; settle: (outcome: "ok" | "lapsed") => void };
const reads: Read[] = [];
const chat = { last: 11 };

jest.mock("./sharedRead", () => {
  const actual = jest.requireActual("./sharedRead");
  const { ModelCallError } = jest.requireActual("./modelError");
  return {
    ...actual,
    runSharedRead: (options: { reason: string; window: { from: number; to: number } }) => new Promise((resolve, reject) => {
      reads.push({
        reason: options.reason,
        window: { from: options.window.from, to: options.window.to },
        settle: (outcome) => (outcome === "ok"
          ? resolve({ audit: { reason: options.reason, window: options.window, acceptedDeltas: [] }, facts: [], memory: [], arcs: [], epistemic: [], ledger: [] })
          : reject(new ModelCallError("lapsed", "signal is aborted without reason"))),
      });
    }),
  };
});
jest.mock("./chatWindow", () => ({ getChatWindow: (from: number, to: number) => ({ from, to: Math.min(to, chat.last), messages: [] }) }));

import { ExtractionScheduler, REREAD_LAPSED_REASON, REREAD_SETTLE_MAX_MS, type ReadOwnership, type SchedulerHost } from "./scheduler";

const settle = async () => { for (let tick = 0; tick < 20; tick += 1) await Promise.resolve(); };

function harness() {
  const world = { epoch: 1, chat: "chat-a", revision: 0, mutatedAt: null as number | null };
  let settleRollback = () => {};
  let rollback: Promise<void> = Promise.resolve();
  const applied: string[] = [];
  const host = {
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getEngineState: () => ({ activeCheckpointId: "cp1", boundary: 5, lastMessageId: chat.last }),
    getExtractionSettings: () => ({ enabled: true, cadence: 1, profileId: "p1", stabilityLag: 0 }),
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    getEntities: () => [],
    epoch: () => world.epoch,
    beginRead: (window: { from: number; to: number }): ReadOwnership => {
      const minted = { ...world };
      const lapsed = () => (world.epoch !== minted.epoch ? "epoch" : world.chat !== minted.chat ? "chat" : world.revision !== minted.revision && world.mutatedAt !== null && world.mutatedAt <= window.to ? "window" : null);
      return { stillOwns: () => lapsed() === null, lapsed, lapsedDetail: () => lapsed() };
    },
    mutationSettled: () => rollback,
    applyExtractionAudit: async (audit: { reason: string }, _f: unknown, _m: unknown, _a: unknown, _e: unknown, _l: unknown, read?: ReadOwnership | null) => { if (!read || read.stillOwns()) applied.push(audit.reason); },
    onSchedulerChange: () => {},
    noteLapse: () => {},
  } as unknown as SchedulerHost;
  const scheduler = new ExtractionScheduler(host);
  return {
    scheduler, applied,
    edit: (messageId: number) => {
      world.revision += 1;
      world.mutatedAt = messageId;
      rollback = new Promise((resolve) => { settleRollback = resolve; });
    },
    rollbackDone: () => settleRollback(),
    switchChat: () => { world.epoch += 1; world.chat = "chat-b"; },
    openOtherChat: () => { world.chat = "chat-b"; },
  };
}

beforeEach(() => { reads.length = 0; chat.last = 11; });

describe("D2: a read cancelled by a mutation is read again", () => {
  it("a read cancelled by an in-window edit with nothing to roll back is re-read", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    expect(reads).toHaveLength(1);
    h.edit(5);
    reads[0].settle("lapsed");
    await settle();
    expect(reads).toHaveLength(1);
    h.rollbackDone();
    await settle();
    expect(reads).toHaveLength(2);
    expect(reads[1]).toMatchObject({ reason: REREAD_LAPSED_REASON, window: { from: 2, to: 9 } });
    reads[1].settle("ok");
    await settle();
    expect(h.applied).toEqual([REREAD_LAPSED_REASON]);
  });

  it("a read that finished but was refused at the write edge is re-read, clamped to the chat that remains", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 11, messages: [] } });
    await settle();
    h.edit(10);
    chat.last = 10;
    reads[0].settle("ok");
    h.rollbackDone();
    await settle();
    expect(h.applied).toEqual([]);
    expect(reads).toHaveLength(2);
    expect(reads[1]).toMatchObject({ reason: REREAD_LAPSED_REASON, window: { from: 2, to: 10 } });
  });

  it("a window the edit deleted entirely is not re-read", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 9, to: 11, messages: [] } });
    await settle();
    h.edit(9);
    chat.last = 8;
    reads[0].settle("lapsed");
    h.rollbackDone();
    await settle();
    expect(reads).toHaveLength(1);
  });

  it("control: a chat switch lapse is not re-read", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.switchChat();
    reads[0].settle("lapsed");
    await settle();
    expect(reads).toHaveLength(1);
  });

  it("control: a chat change seen before the epoch moves is not re-read either", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.openOtherChat();
    reads[0].settle("lapsed");
    await settle();
    expect(reads).toHaveLength(1);
  });

  it("control: an edit inside the window followed by a chat switch before the re-read is not re-read", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.edit(5);
    reads[0].settle("lapsed");
    await settle();
    h.switchChat();
    h.rollbackDone();
    await settle();
    expect(reads).toHaveLength(1);
  });

  it("control: an overlapping rollback re-read is not duplicated", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.edit(5);
    reads[0].settle("lapsed");
    await settle();
    h.scheduler.schedule({ priority: 0, reason: "rollback:5", window: { from: 4, to: 11, messages: [] } });
    h.rollbackDone();
    await settle();
    expect(reads).toHaveLength(2);
    expect(reads[1]).toMatchObject({ reason: "rollback:5", window: { from: 2, to: 11 } });
    reads[1].settle("ok");
    await settle();
    expect(reads).toHaveLength(2);
  });

  it("control: a rollback re-read queued before the lapse absorbs it too", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.edit(5);
    h.scheduler.schedule({ priority: 0, reason: "rollback:5", window: { from: 4, to: 11, messages: [] } });
    reads[0].settle("lapsed");
    h.rollbackDone();
    await settle();
    expect(reads.map((read) => read.reason)).toEqual(["cadence", "rollback:5"]);
    expect(reads[1].window).toEqual({ from: 2, to: 11 });
  });

  it("a rollback that never settles holds the re-read for the declared bound, not forever", async () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
      await settle();
      h.edit(5);
      reads[0].settle("lapsed");
      await settle();
      jest.advanceTimersByTime(REREAD_SETTLE_MAX_MS - 1);
      await settle();
      expect(reads).toHaveLength(1);
      jest.advanceTimersByTime(1);
      await settle();
      expect(reads.map((read) => read.reason)).toEqual(["cadence", REREAD_LAPSED_REASON]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a new world does not wait on the departed chat's rollback", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.edit(5);
    reads[0].settle("lapsed");
    await settle();
    h.switchChat();
    h.scheduler.clearForNewWorld();
    h.scheduler.schedule({ priority: 0, reason: "manual", window: { from: 0, to: 3, messages: [] } });
    await settle();
    expect(reads.map((read) => read.reason)).toEqual(["cadence", "manual"]);
  });

  it("control: a reply appended after the window lapses nothing and reads nothing twice", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 2, to: 9, messages: [] } });
    await settle();
    h.edit(10);
    reads[0].settle("ok");
    h.rollbackDone();
    await settle();
    expect(h.applied).toEqual(["cadence"]);
    expect(reads).toHaveLength(1);
  });
});
