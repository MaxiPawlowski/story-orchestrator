jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({
    chat: [{ name: "Max", is_user: true, mes: "Show me the pawn ticket." }, { name: "The Queen's Agent", is_user: false, mes: "It rests in the Keeper's vault." }],
    chatId: "pawnbroker-chat",
    extensionSettings: {},
  }),
  sendConnectionProfileRequest: jest.fn(),
}));

import { ExtractionScheduler, type SchedulerHost } from "./scheduler";

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function harness(openChatIsLoaded: boolean) {
  const beginRead = jest.fn(() => ({ stillOwns: () => true }));
  const applyExtractionAudit = jest.fn(async () => {});
  const host = {
    getStory: () => ({ title: "The Hoard of the Dead Dragon", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getEngineState: () => ({ activeCheckpointId: "start", boundary: 4, lastMessageId: 1 }),
    getExtractionSettings: () => ({ enabled: true, cadence: 1, profileId: "p1", debugResponse: "SCENE_NONE" }),
    getFacts: () => [],
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    getOpenArcs: () => [],
    getEpistemicLedgerCapable: () => false,
    getEntities: () => [],
    applyExtractionAudit,
    onSchedulerChange: () => {},
    judgeTyped: () => null,
    beginRead,
    readsOpenChat: () => openChatIsLoaded,
  } as unknown as SchedulerHost;
  return { scheduler: new ExtractionScheduler(host), beginRead, applyExtractionAudit };
}

describe("T5-2-2 LOW: a read never pairs the loaded story with another chat's transcript", () => {
  it("does not send a read while SillyTavern shows a chat the runtime has not loaded yet (payloads.jsonl:502-503)", async () => {
    const h = harness(false);
    h.scheduler.schedule({ priority: 1, reason: "resume:dropped", window: { from: 0, to: 1, messages: [], form: "cleaned" } as never });
    await settle();
    expect(h.beginRead).not.toHaveBeenCalled();
    expect(h.applyExtractionAudit).not.toHaveBeenCalled();
  });

  it("control: the same job reads when the open chat is the loaded one", async () => {
    const h = harness(true);
    h.scheduler.schedule({ priority: 1, reason: "resume:dropped", window: { from: 0, to: 1, messages: [], form: "cleaned" } as never });
    await settle();
    expect(h.beginRead).toHaveBeenCalledTimes(1);
  });
});
