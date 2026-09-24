import { TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";

// v2.4 plan 01 T1. ST emits MESSAGE_DELETED with the post-delete chat.length (host-facts 01-H1), so the
// bridge has to decode which message went from the chat it saw before. These cases pin the three
// places the decoded start must reach: the rollback (and so the manager's noteMutation), the turn-key
// purge, and the order — the decode happens before the first await, because /cut splices the next
// message while the previous rollback is still running (01-H4).

const handlers = new Map<string, (...args: unknown[]) => unknown>();
type Row = { send_date: string; name: string; is_user: boolean; mes: string };
const host = { chat: [] as Row[], chatId: "t1-chat" };

jest.mock("./storyLibrary", () => ({ listStoryRecords: () => [] }));
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  getContext: () => ({ chat: host.chat, chatId: host.chatId, chatMetadata: {}, saveMetadata: () => undefined }),
  isHostGenerating: () => false,
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: (...args: unknown[]) => unknown }>) => {
    for (const entry of entries) handlers.set(entry.eventName, entry.handler);
    return () => handlers.clear();
  },
}));

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const emit = async (eventName: string, ...args: unknown[]) => {
  await handlers.get(eventName)?.(...args);
  await settle();
};

const row = (index: number): Row => ({ send_date: `t${index}`, name: index % 2 ? "Arin" : "Player", is_user: index % 2 === 0, mes: `line ${index}` });

function harness() {
  const manager = {
    commitBoundary: jest.fn(async (_at?: number) => undefined),
    fireAfterSpeak: jest.fn(async () => undefined),
    rollbackFromMessage: jest.fn(async (_id: number, _journal?: unknown) => undefined),
    loadSelectedFromChat: jest.fn(async () => undefined),
    getOwnership: () => undefined,
    notify: jest.fn(),
  };
  new TurnBridge(manager as unknown as RuntimeManager).start();
  return manager;
}

const hostDelete = async (index: number, count = 1) => {
  host.chat.splice(index, count);
  await emit("MESSAGE_DELETED", host.chat.length);
};

beforeEach(() => {
  handlers.clear();
  host.chat = [0, 1, 2, 3].map(row);
  host.chatId = "t1-chat";
});

describe("v2.4 T1: a middle delete rolls back from the message it removed", () => {
  it("hands the decoded start to the rollback, not the post-delete length", async () => {
    const manager = harness();
    await emit("CHAT_CHANGED");
    await hostDelete(1);
    expect(manager.rollbackFromMessage.mock.calls).toEqual([[1]]);
  });

  it("decodes before the first await: a /cut range reports each removed message while the rollback is still running", async () => {
    const manager = harness();
    await emit("CHAT_CHANGED");
    let release: () => void = () => undefined;
    manager.rollbackFromMessage.mockImplementation(() => new Promise<undefined>((resolve) => { release = () => resolve(undefined); }));
    host.chat.splice(1, 1);
    const first = handlers.get("MESSAGE_DELETED")?.(host.chat.length);
    host.chat.splice(1, 1);
    const second = handlers.get("MESSAGE_DELETED")?.(host.chat.length);
    release();
    await Promise.all([first, second]);
    await settle();
    expect(manager.rollbackFromMessage.mock.calls.map(([start]) => start)).toEqual([1, 1]);
    expect(manager.rollbackFromMessage.mock.calls.every((call) => call.length === 1)).toBe(true);
  });

  it("purges the turn keys from the decoded start, so a reply rendered at a shifted index is a new turn", async () => {
    const manager = harness();
    await emit("CHAT_CHANGED");
    await emit("MESSAGE_RECEIVED", 2, "normal");
    await emit("CHARACTER_MESSAGE_RENDERED", 2, "normal");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(1);
    await hostDelete(1);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    expect(manager.commitBoundary).toHaveBeenCalledTimes(2);
  });

  it("journals a delete it could not decode, and still rolls back from the post-delete length", async () => {
    const manager = harness();
    await emit("MESSAGE_DELETED", 3);
    expect(manager.rollbackFromMessage).toHaveBeenCalledTimes(1);
    const [start, journal] = manager.rollbackFromMessage.mock.calls[0];
    expect(start).toBe(3);
    expect(journal).toEqual(expect.objectContaining({ summary: "message delete not decoded" }));
  });

  it("refreshes on MESSAGE_SENT, so a player line sent after the last snapshot decodes exactly", async () => {
    const manager = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(row(4), row(5));
    await emit("MESSAGE_SENT", 5);
    await hostDelete(4);
    expect(manager.rollbackFromMessage.mock.calls).toEqual([[4]]);
  });

  it("control: a tail delete decodes to the same value ST sends", async () => {
    const manager = harness();
    await emit("CHAT_CHANGED");
    await hostDelete(3);
    expect(manager.rollbackFromMessage.mock.calls).toEqual([[3]]);
  });
});
