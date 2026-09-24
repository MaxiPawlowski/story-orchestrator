jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {} }), sendConnectionProfileRequest: jest.fn() }));

const gate: { release: () => void; promise: Promise<unknown>; order: string[] } = { release: () => {}, promise: Promise.resolve(), order: [] };
const result = { audit: { reason: "cadence", window: { from: 2, to: 9 }, acceptedDeltas: [] }, facts: [], memory: [], arcs: [], epistemic: [], ledger: [] };

jest.mock("./sharedRead", () => {
  const actual = jest.requireActual("./sharedRead");
  return { ...actual, runSharedRead: () => { gate.order.push("read"); return gate.promise; } };
});
jest.mock("./chatWindow", () => ({ getChatWindow: (from: number, to: number) => ({ from, to, messages: [] }) }));

import { ExtractionScheduler, type ReadOwnership, type SchedulerHost } from "./scheduler";

function harness() {
  const world = { chat: "chat-a" };
  const applied: Array<ReadOwnership | null | undefined> = [];
  const host = {
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getEngineState: () => ({ activeCheckpointId: "cp1", boundary: 5, lastMessageId: 9 }),
    getExtractionSettings: () => ({ enabled: true, cadence: 1, profileId: "p1", stabilityLag: 0 }),
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    getEntities: () => [],
    beginRead: () => {
      gate.order.push("mint");
      const minted = world.chat;
      return { stillOwns: () => world.chat === minted, lapsedDetail: () => (world.chat === minted ? null : `chat: ${minted} -> ${world.chat}`) };
    },
    applyExtractionAudit: async (_audit: unknown, _facts: unknown, _memory: unknown, _arcs: unknown, _epistemic: unknown, _ledger: unknown, read?: ReadOwnership | null) => { applied.push(read); },
    onSchedulerChange: () => {},
  } as unknown as SchedulerHost;
  return { scheduler: new ExtractionScheduler(host), world, applied };
}

async function settle() {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
}

beforeEach(() => {
  gate.order = [];
  gate.promise = new Promise((resolve) => { gate.release = () => resolve(result); });
});

describe("V2: a shared read is owned from before the model call, not from after it", () => {
  it("mints before the read and hands the apply a lapsed guard when the chat changed during the call", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence" });
    await settle();
    expect(gate.order).toEqual(["mint", "read"]);
    h.world.chat = "chat-b";
    gate.release();
    await settle();
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0]?.stillOwns()).toBe(false);
    expect(h.applied[0]?.lapsedDetail()).toContain("chat-b");
  });

  it("control: an unchanged world hands the apply a guard that still owns", async () => {
    const h = harness();
    h.scheduler.schedule({ priority: 1, reason: "cadence" });
    await settle();
    gate.release();
    await settle();
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0]?.stillOwns()).toBe(true);
  });
});
