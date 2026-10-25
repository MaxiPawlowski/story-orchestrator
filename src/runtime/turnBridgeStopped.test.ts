import { TurnBridge } from "./turnBridge";
import type { RuntimeManager } from "./runtimeManager";
import { testOwnership } from "../../test/findings/testOwnership";
import { clearStoppedReply, heldStoppedReply, readableEndBefore, readableLastId } from "./stoppedReply";
import { userStoppedStream } from "@services/stHost/streamGuard";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
type Row = { send_date: string; name: string; is_user: boolean; mes: string; swipes?: string[]; swipe_id?: number; extra?: { reasoning?: string } };
const host = { chat: [] as Row[], chatId: "stop-chat", stopped: new Set<number>() };

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
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};

const emit = async (eventName: string, ...args: unknown[]) => {
  await handlers.get(eventName)?.(...args);
  await settle();
};

function harness() {
  const order: string[] = [];
  const manager = {
    commitBoundary: jest.fn(async (at?: number) => { order.push(`commit ${at}`); }),
    fireAfterSpeak: jest.fn(async () => undefined),
    rollbackFromMessage: jest.fn(async (id: number) => { order.push(`rollback ${id}`); }),
    rollbackOnEnter: jest.fn(async () => false),
    loadSelectedFromChat: jest.fn(async () => undefined),
    reapplyPromptBlocks: jest.fn(),
    reapplyCopilotNudge: jest.fn(),
    getOwnership: testOwnership,
    notify: jest.fn(),
  };
  const bridge = new TurnBridge(manager as unknown as RuntimeManager);
  bridge.setStopSeam((id) => host.stopped.has(id));
  bridge.start();
  return { manager, order };
}

const npc = (mes: string): Row => ({ send_date: "t", name: "Belle", is_user: false, mes, swipes: [mes], swipe_id: 0 });
const player = (mes: string): Row => ({ send_date: "t", name: "Max", is_user: true, mes });

beforeEach(() => {
  handlers.clear();
  clearStoppedReply();
  host.chatId = "stop-chat";
  host.stopped = new Set();
  host.chat = [npc("The guild hall is loud."), player("We take the job.")];
});

describe("a reply the player stopped mid-stream", () => {
  it("is not a turn until the player sends again, then counts as a reply before the player's line", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    await emit("CHARACTER_MESSAGE_RENDERED", 2, "normal");
    expect(order).toEqual([]);
    expect(heldStoppedReply("stop-chat")).toBe(2);
    expect(readableEndBefore("stop-chat")).toBe(1);
    expect(readableLastId("stop-chat", 2)).toBe(1);
    expect(readableLastId("other-chat", 2)).toBe(2);
    host.chat.push(player("Keep going."));
    await emit("MESSAGE_SENT", 3);
    expect(order).toEqual(["commit 2"]);
    expect(heldStoppedReply("stop-chat")).toBeNull();
    host.chat.push(npc("North, then."));
    await emit("MESSAGE_RECEIVED", 4, "normal");
    expect(order).toEqual(["commit 2", "commit 4"]);
  });

  it("a fresh swipe of the stopped reply drops the hold; the new version commits once", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.chat[2] = { ...npc(""), swipes: ["You ride no"], swipe_id: 1 };
    await emit("MESSAGE_SWIPED", 2);
    expect(heldStoppedReply("stop-chat")).toBeNull();
    host.stopped.delete(2);
    host.chat[2] = { ...npc("You stay."), swipes: ["You ride no", "You stay."], swipe_id: 1 };
    await emit("MESSAGE_RECEIVED", 2, "swipe");
    host.chat.push(player("Fine."));
    await emit("MESSAGE_SENT", 3);
    expect(order).toEqual(["rollback 2", "commit 2"]);
  });

  it("a swipe that is stopped again stays held", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.chat[2] = { ...npc(""), swipes: ["You ride no"], swipe_id: 1 };
    await emit("MESSAGE_SWIPED", 2);
    host.chat[2] = { ...npc("You st"), swipes: ["You ride no", "You st"], swipe_id: 1 };
    await emit("MESSAGE_RECEIVED", 2, "swipe");
    expect(order).toEqual(["rollback 2"]);
    expect(heldStoppedReply("stop-chat")).toBe(2);
  });

  it("deleting the stopped reply (regenerate) drops the hold, and the regenerated reply commits", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.chat.pop();
    await emit("MESSAGE_DELETED", 2);
    expect(heldStoppedReply("stop-chat")).toBeNull();
    host.stopped.delete(2);
    host.chat.push(npc("You ride north."));
    await emit("MESSAGE_RECEIVED", 2, "normal");
    expect(order.filter((step) => step.startsWith("commit"))).toEqual(["commit 2"]);
  });

  it("a continue that finishes the stopped reply commits it without waiting for a send", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.stopped.delete(2);
    host.chat[2] = npc("You ride north.");
    await emit("MESSAGE_RECEIVED", 2, "continue");
    expect(order).toEqual(["commit 2"]);
    expect(heldStoppedReply("stop-chat")).toBeNull();
  });

  it("a later reply that renders before any send commits the stopped one first, in order", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.chat.push(npc("The guard shrugs."));
    await emit("MESSAGE_RECEIVED", 3, "normal");
    expect(order).toEqual(["commit 2", "commit 3"]);
  });

  it("a stopped reply with only thoughts is dropped at the send, never committed", async () => {
    const { order } = harness();
    await emit("CHAT_CHANGED");
    host.chat.push({ ...npc(""), swipes: [""], extra: { reasoning: "Should I answer?" } });
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.chat.push(player("Hello?"));
    await emit("MESSAGE_SENT", 3);
    expect(order).toEqual([]);
  });

  it("a chat change forgets the hold", async () => {
    harness();
    await emit("CHAT_CHANGED");
    host.chat.push(npc("You ride no"));
    host.stopped.add(2);
    await emit("MESSAGE_RECEIVED", 2, "normal");
    host.chatId = "other-chat";
    await emit("CHAT_CHANGED");
    expect(heldStoppedReply("stop-chat")).toBeNull();
    expect(readableEndBefore("other-chat")).toBeUndefined();
  });
});

describe("userStoppedStream reads ST's StreamingProcessor (script.js onStopStreaming / onErrorStreaming)", () => {
  const stream = (over: Partial<{ messageId: number; isStopped: boolean; isFinished: boolean; aborted: boolean }>) => {
    const { messageId = 2, isStopped = false, isFinished = true, aborted = true } = over;
    return { messageId, isStopped, isFinished, abortController: { signal: { aborted } } };
  };

  it("a user stop: finished, aborted, not errored", () => expect(userStoppedStream(stream({}), 2)).toBe(true));
  it("a normal finish is not a stop", () => expect(userStoppedStream(stream({ aborted: false }), 2)).toBe(false));
  it("an errored stream is not a user stop", () => expect(userStoppedStream(stream({ isStopped: true }), 2)).toBe(false));
  it("another message's stream does not count", () => expect(userStoppedStream(stream({}), 3)).toBe(false));
  it("no stream", () => expect(userStoppedStream(null, 2)).toBe(false));
});
