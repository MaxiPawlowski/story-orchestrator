import { TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";
import { EmptyReplyRecovery, REASONING_RESIDUE_TAGS } from "./emptyReply";
import { testOwnership } from "../../test/findings/testOwnership";
import { wrote } from "@utils/writeResult";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
let chat: Array<Record<string, unknown>> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat, chatId: "chat-a" }),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
}));

const emit = async (eventName: string, ...args: unknown[]) => {
  await handlers.get(eventName)?.(...args);
};

const makeManager = () => ({
  commitBoundary: jest.fn(async () => undefined),
  fireAfterSpeak: jest.fn(async () => undefined),
  rollbackFromMessage: jest.fn(async () => undefined),
  rollbackOnEnter: jest.fn(async () => false),
  loadSelectedFromChat: jest.fn(async () => undefined),
  reapplyPromptBlocks: jest.fn(),
  reapplyCopilotNudge: jest.fn(),
  getOwnership: () => testOwnership(),
  getRunContext: () => ({ chatId: "chat-a", storyId: "s", storyHash: "h", sessionEpoch: 1, windowRevision: 0 }),
  getEngineState: () => null,
  notify: jest.fn(),
});

const player = { is_user: true, mes: "Where is the gate?" };
const emptyReply = () => ({ name: "Belle", is_user: false, mes: "", swipe_id: 0, swipes: [""], extra: { reasoning: "The guard asks; Belle should answer plainly." } });

const wire = (bridge: TurnBridge, onSwipe: (row: Record<string, unknown>) => void) => {
  const asked: number[] = [];
  const recovery = new EmptyReplyRecovery({
    storyChat: () => "chat-a",
    openChat: () => "chat-a",
    row: (messageId) => chat[messageId],
    chatLength: () => chat.length,
    busy: () => false,
    askAgain: async (messageId, row) => {
      asked.push(messageId);
      onSwipe(row as Record<string, unknown>);
      return wrote();
    },
    ownership: () => testOwnership(),
    journal: () => undefined,
    wait: async () => undefined,
  });
  const done: Array<Promise<unknown>> = [];
  bridge.setEmptyReplySeam({ tags: () => REASONING_RESIDUE_TAGS, observe: (messageId, type) => { done.push(recovery.observe(messageId, type)); } });
  return { asked, settle: () => Promise.all(done) };
};

describe("TurnBridge: a reply that came back as a thought only", () => {
  beforeEach(() => {
    handlers.clear();
    chat = [];
  });

  it("commits no boundary for it (no extraction read of an empty reply), and hands it to the recovery once", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();
    chat = [player, emptyReply()];
    const { asked, settle } = wire(bridge, () => undefined);

    await emit("MESSAGE_RECEIVED", 1, "normal");
    await emit("CHARACTER_MESSAGE_RENDERED", 1, "normal");
    await settle();

    expect(manager.fireAfterSpeak).not.toHaveBeenCalled();
    expect(manager.commitBoundary).not.toHaveBeenCalled();
    expect(asked).toEqual([1]);
  });

  it("commits the recovered reply once the swipe brings visible text, as an ordinary swipe", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();
    chat = [player, emptyReply()];
    const { asked, settle } = wire(bridge, (row) => {
      const recovered = "Belle points north. Past the well.";
      row.swipes = ["", recovered];
      row.swipe_id = 1;
      row.mes = recovered;
    });

    await emit("MESSAGE_RECEIVED", 1, "normal");
    await settle();
    await emit("MESSAGE_SWIPED", 1);
    await emit("MESSAGE_RECEIVED", 1, "swipe");
    await emit("CHARACTER_MESSAGE_RENDERED", 1, "swipe");

    expect(asked).toEqual([1]);
    expect(manager.rollbackFromMessage).toHaveBeenCalledTimes(1);
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
    expect(manager.commitBoundary).toHaveBeenCalledWith(1);
  });

  it("does not ask a second time when the swiped-in reply is empty too, and still commits nothing", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();
    chat = [player, emptyReply()];
    const { asked, settle } = wire(bridge, (row) => {
      row.swipes = ["", ""];
      row.swipe_id = 1;
    });

    await emit("MESSAGE_RECEIVED", 1, "normal");
    await settle();
    await emit("MESSAGE_SWIPED", 1);
    await emit("MESSAGE_RECEIVED", 1, "swipe");
    await settle();

    expect(asked).toEqual([1]);
    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });

  it("never recommits an empty stored swipe the player swipes back to", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();
    chat = [player, { ...emptyReply(), swipes: ["", "Belle points north."], swipe_id: 0 }];

    await emit("MESSAGE_SWIPED", 1);

    expect(manager.commitBoundary).not.toHaveBeenCalled();
  });

  it("negative control: a reply with visible text commits as before and never reaches the recovery", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();
    chat = [player, { ...emptyReply(), mes: "Belle points north." }];
    const { asked } = wire(bridge, () => undefined);

    await emit("MESSAGE_RECEIVED", 1, "normal");

    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
    expect(asked).toEqual([]);
  });

  it("negative control: a plain empty reply (no thought, the backend-down shape) still commits as before", async () => {
    const manager = makeManager();
    const bridge = new TurnBridge(manager as unknown as RuntimeManager);
    bridge.start();
    chat = [player, { name: "Belle", is_user: false, mes: "", extra: {} }];
    const { asked } = wire(bridge, () => undefined);

    await emit("MESSAGE_RECEIVED", 1, "normal");

    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
    expect(asked).toEqual([]);
  });
});
