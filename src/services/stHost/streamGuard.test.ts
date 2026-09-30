import { CHAT_MOVED, guardStreamToChat, watchChatMove, type GuardedStream } from "./streamGuard";

const world = { chatId: "a", chat: [] as Array<{ mes: string }>, processor: null as GuardedStream | null, token: null as (() => void) | null, settled: 0 };

const stream = (messageId: number): GuardedStream => ({
  messageId,
  isStopped: false,
  isFinished: false,
  abortController: new AbortController(),
  onProgressStreaming: async (id, text) => { world.chat[id].mes = text; },
});

const guard = () => guardStreamToChat("a", {
  processor: () => world.processor,
  chatId: () => world.chatId,
  chat: () => world.chat,
  onToken: (listener) => { world.token = listener; return () => { world.token = null; }; },
  settle: () => { world.settled += 1; },
});

beforeEach(() => {
  world.chatId = "a";
  world.chat = [{ mes: "a0" }, { mes: "..." }];
  world.processor = null;
  world.token = null;
  world.settled = 0;
});

describe("guardStreamToChat", () => {
  it("arms every processor a token reveals, so an auto-continue after the first is guarded too", async () => {
    const g = guard();
    const first = stream(1);
    world.processor = first;
    world.token?.();
    first.isFinished = true;
    const second = stream(1);
    world.processor = second;
    world.token?.();
    world.chatId = "b";
    world.chat = [{ mes: "b0" }, { mes: "b1" }];
    await expect(second.onProgressStreaming(1, "late", false)).rejects.toThrow(CHAT_MOVED);
    expect({ b1: world.chat[1].mes, stopped: second.isStopped, finished: second.isFinished, aborted: (second.abortController as AbortController).signal.aborted }).toEqual({ b1: "b1", stopped: true, finished: true, aborted: true });
    g.release();
    expect(world.settled).toBe(1);
  });

  it("refuses a write when the chat was cleared in place under the same chat id", async () => {
    guard();
    const s = stream(1);
    world.processor = s;
    world.token?.();
    world.chat.length = 0;
    world.chat.push({ mes: "x0" }, { mes: "x1" });
    await expect(s.onProgressStreaming(1, "late", false)).rejects.toThrow(CHAT_MOVED);
    expect(world.chat[1].mes).toBe("x1");
  });

  it("stops at the first write after the chat id changes, before ST has cleared the departing chat", async () => {
    guard();
    const s = stream(1);
    world.processor = s;
    world.token?.();
    world.chatId = "b";
    await expect(s.onProgressStreaming(1, "late", false)).rejects.toThrow(CHAT_MOVED);
    expect({ mes: world.chat[1].mes, stopped: s.isStopped }).toEqual({ mes: "...", stopped: true });
  });

  it("control: halt with no processor stops nothing, and release does not give the button back", () => {
    const g = guard();
    expect(g.halt()).toBe(false);
    g.release();
    expect({ settled: world.settled, listening: world.token !== null }).toEqual({ settled: 0, listening: false });
  });

  it("control: an unmoved chat passes every write through", async () => {
    guard();
    const s = stream(1);
    world.processor = s;
    world.token?.();
    await s.onProgressStreaming(1, "hello", true);
    expect({ mes: world.chat[1].mes, stopped: s.isStopped }).toEqual({ mes: "hello", stopped: false });
  });
});

describe("watchChatMove (v2.6 plan 04 C1r)", () => {
  const watched = (initial: string) => {
    const state = { chatId: initial, listener: (() => undefined) as () => void, offs: 0, moved: 0 };
    const stop = watchChatMove("a", {
      chatId: () => state.chatId,
      subscribe: (next) => { state.listener = next; return () => { state.offs += 1; }; },
    }, () => { state.moved += 1; });
    return { state, stop };
  };

  it("fires once, on the first tick that reads another chat, and unsubscribes itself", () => {
    const { state } = watched("a");
    state.listener();
    expect(state.moved).toBe(0);
    state.chatId = "b";
    state.listener();
    state.listener();
    expect({ moved: state.moved, offs: state.offs }).toEqual({ moved: 1, offs: 1 });
  });

  it("a stop before the move never fires", () => {
    const { state, stop } = watched("a");
    stop();
    state.chatId = "b";
    state.listener();
    expect(state.moved).toBe(0);
  });
});
